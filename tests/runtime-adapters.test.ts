import { describe, expect, it } from "vitest";
import {
  redisConnectionFromEnv,
  redisWorkerConnectionFromEnv
} from "../src/queue/redis-connection.js";

describe("runtime adapters", () => {
  it("parses Redis URLs without embedding infrastructure in business code", () => {
    const connection = redisConnectionFromEnv({
      REDIS_URL: "rediss://worker:secret@redis.example.com:6380/4"
    });

    expect(connection.host).toBe("redis.example.com");
    expect(connection.port).toBe(6380);
    expect(connection.username).toBe("worker");
    expect(connection.password).toBe("secret");
    expect(connection.db).toBe(4);
    expect(connection.tls).toEqual({});
  });

  it("sets unlimited command retries for worker connections", () => {
    const connection = redisWorkerConnectionFromEnv({
      REDIS_URL: "redis://localhost:6379/0"
    });

    expect(connection.maxRetriesPerRequest).toBeNull();
  });
});
