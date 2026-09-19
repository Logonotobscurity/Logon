import { describe, expect, it } from "vitest";
import { PgExecutionStore } from "../src/kernel/postgres-store.js";
import { canonicalJson } from "../src/kernel/canonical-json.js";

describe("PostgreSQL runtime boundary", () => {
  it("canonicalizes object key order for deterministic request hashes", () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } }))
      .toBe('{"a":{"c":3,"d":4},"b":2}');
    expect(canonicalJson({ a: 1, b: 2 }))
      .toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it("commits successful transaction work on the same client", async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        return { rows: [], rowCount: 0 };
      },
      release: () => calls.push("RELEASE")
    };
    const pool = {
      connect: async () => client
    } as unknown as import("pg").Pool;

    const store = new PgExecutionStore(pool);
    await store.withTransaction(async (tx) => {
      await tx.query("select 1");
    });

    expect(calls).toEqual(["BEGIN", "select 1", "COMMIT", "RELEASE"]);
  });

  it("rolls back and releases the client when transaction work fails", async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql === "select boom") throw new Error("boom");
        return { rows: [], rowCount: 0 };
      },
      release: () => calls.push("RELEASE")
    };
    const pool = {
      connect: async () => client
    } as unknown as import("pg").Pool;

    const store = new PgExecutionStore(pool);
    await expect(store.withTransaction(async (tx) => {
      await tx.query("select boom");
    })).rejects.toThrow("boom");

    expect(calls).toEqual(["BEGIN", "select boom", "ROLLBACK", "RELEASE"]);
  });
});
