import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  PrincipalResolutionError,
  canDecideApproval,
  requireRole,
  resolvePrincipal
} from "../src/control-plane/auth.js";

describe("control-plane principal resolution", () => {
  it("uses development identity only when explicit dev mode is enabled", () => {
    const principal = resolvePrincipal(
      {
        headers: {
          "x-logon-tenant-id": "tenant-a",
          "x-logon-actor-id": "alice",
          "x-logon-roles": "viewer,approver"
        }
      },
      { LOGON_CONTROL_PLANE_DEV_MODE: "true" }
    );

    expect(principal).toEqual({
      subjectId: "alice",
      tenantId: "tenant-a",
      roles: ["VIEWER", "APPROVER"],
      authentication: "DEV"
    });
  });

  it("rejects arbitrary browser identity when no trusted boundary is configured", () => {
    expect(() =>
      resolvePrincipal(
        { headers: { "x-logon-tenant-id": "tenant-a" } },
        {}
      )
    ).toThrow(PrincipalResolutionError);
  });

  it("resolves only trusted-proxy claims in production mode", () => {
    const principal = resolvePrincipal(
      {
        headers: {
          "x-logon-auth-tenant": "tenant-a",
          "x-logon-auth-subject": "operator-7",
          "x-logon-auth-roles": "APPROVER,viewer"
        }
      },
      { LOGON_CONTROL_PLANE_TRUSTED_PROXY: "true" }
    );

    expect(principal.tenantId).toBe("tenant-a");
    expect(principal.subjectId).toBe("operator-7");
    expect(principal.authentication).toBe("TRUSTED_PROXY");
    expect(canDecideApproval(principal)).toBe(true);
  });

  it("denies approval to viewer-only principals", () => {
    const principal = resolvePrincipal(
      {
        headers: {
          "x-logon-auth-tenant": "tenant-a",
          "x-logon-auth-subject": "viewer-7",
          "x-logon-auth-roles": "VIEWER"
        }
      },
      { LOGON_CONTROL_PLANE_TRUSTED_PROXY: "true" }
    );

    expect(() => requireRole(principal, "APPROVE")).toThrow(AuthorizationError);
    expect(() => requireRole(principal, "READ")).not.toThrow();
  });

  it("does not silently promote unknown roles", () => {
    const principal = resolvePrincipal(
      {
        headers: {
          "x-logon-auth-tenant": "tenant-a",
          "x-logon-auth-subject": "viewer-7",
          "x-logon-auth-roles": "ROOT,SUPERUSER"
        }
      },
      { LOGON_CONTROL_PLANE_TRUSTED_PROXY: "true" }
    );

    expect(principal.roles).toEqual(["VIEWER"]);
  });
});
