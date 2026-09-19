import type { ConnectionOptions } from "bullmq";

export function redisConnectionFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ConnectionOptions {
  const rawUrl = env.LOGON_REDIS_URL ?? env.REDIS_URL ?? "redis://127.0.0.1:6379/0";
  const url = new URL(rawUrl);
  const pathname = url.pathname.replace(/^\//, "");
  const db = pathname === "" ? 0 : Number(pathname);

  if (!Number.isInteger(db) || db < 0) {
    throw new Error("Invalid Redis database in URL");
  }

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(db > 0 ? { db } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {})
  };
}

export function redisWorkerConnectionFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ConnectionOptions {
  return {
    ...redisConnectionFromEnv(env),
    maxRetriesPerRequest: null
  };
}
