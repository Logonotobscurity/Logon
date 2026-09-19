import type { IncomingHttpHeaders, IncomingMessage } from "node:http";

export type ControlPlaneRole = "VIEWER" | "OPERATOR" | "APPROVER" | "ADMIN";

export interface ControlPlanePrincipal {
  subjectId: string;
  tenantId: string;
  roles: ControlPlaneRole[];
  authentication: "TRUSTED_PROXY" | "DEV";
}

export class PrincipalResolutionError extends Error {
  readonly statusCode = 401;

  constructor(message: string) {
    super(message);
    this.name = "PrincipalResolutionError";
  }
}

export class AuthorizationError extends Error {
  readonly statusCode = 403;

  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

const VALID_ROLES = new Set<ControlPlaneRole>(["VIEWER", "OPERATOR", "APPROVER", "ADMIN"]);

function firstHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

function parseRoles(raw: string | undefined, fallback: ControlPlaneRole[] = ["VIEWER"]): ControlPlaneRole[] {
  const values = (raw ?? "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  const roles = values.filter((item): item is ControlPlaneRole =>
    VALID_ROLES.has(item as ControlPlaneRole)
  );

  return roles.length ? [...new Set(roles)] : fallback;
}

function requireValue(value: string | undefined, message: string): string {
  if (!value) throw new PrincipalResolutionError(message);
  return value;
}

/**
 * Resolves identity at the API trust boundary.
 *
 * Production:
 * - LOGON_CONTROL_PLANE_TRUSTED_PROXY=true means an authenticated edge/proxy
 *   must strip incoming copies of the x-logon-auth-* headers and inject trusted
 *   principal values.
 *
 * Local development:
 * - LOGON_CONTROL_PLANE_DEV_MODE=true permits explicit development headers.
 * - This mode must never be enabled on a public deployment.
 */
export function resolvePrincipal(
  req: Pick<IncomingMessage, "headers">,
  env: NodeJS.ProcessEnv = process.env
): ControlPlanePrincipal {
  const devMode = env.LOGON_CONTROL_PLANE_DEV_MODE === "true";
  const trustedProxy = env.LOGON_CONTROL_PLANE_TRUSTED_PROXY === "true";

  if (devMode) {
    const tenantId = requireValue(
      firstHeader(req.headers, "x-logon-tenant-id") ?? env.LOGON_CONTROL_PLANE_TENANT_ID,
      "Development tenant identity is required"
    );
    const subjectId =
      firstHeader(req.headers, "x-logon-actor-id") ??
      env.LOGON_CONTROL_PLANE_ACTOR_ID ??
      "control-plane-dev";
    return {
      subjectId,
      tenantId,
      roles: parseRoles(firstHeader(req.headers, "x-logon-roles") ?? env.LOGON_CONTROL_PLANE_ROLES, [
        "ADMIN"
      ]),
      authentication: "DEV"
    };
  }

  if (!trustedProxy) {
    throw new PrincipalResolutionError(
      "No authenticated Control Plane principal is configured"
    );
  }

  const tenantId = requireValue(
    firstHeader(req.headers, "x-logon-auth-tenant"),
    "Authenticated tenant claim is required"
  );
  const subjectId = requireValue(
    firstHeader(req.headers, "x-logon-auth-subject"),
    "Authenticated subject claim is required"
  );

  return {
    subjectId,
    tenantId,
    roles: parseRoles(firstHeader(req.headers, "x-logon-auth-roles")),
    authentication: "TRUSTED_PROXY"
  };
}

export function canReadControlPlane(principal: ControlPlanePrincipal): boolean {
  return principal.roles.some((role) =>
    ["VIEWER", "OPERATOR", "APPROVER", "ADMIN"].includes(role)
  );
}

export function canDecideApproval(principal: ControlPlanePrincipal): boolean {
  return principal.roles.some((role) => ["APPROVER", "ADMIN"].includes(role));
}

export function requireRole(
  principal: ControlPlanePrincipal,
  permission: "READ" | "APPROVE"
): void {
  const allowed =
    permission === "READ"
      ? canReadControlPlane(principal)
      : canDecideApproval(principal);

  if (!allowed) {
    throw new AuthorizationError(
      permission === "APPROVE"
        ? "Approval decisions require APPROVER or ADMIN role"
        : "Control Plane read access is not granted"
    );
  }
}
