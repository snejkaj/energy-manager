// Requirements: DB-001, DB-007, OPS-003, ARC-003

import pg from "pg";

import type { DatabaseClient, QueryResult } from "./DatabaseClient.js";

export class PgDatabaseClient implements DatabaseClient {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  async query<TRecord = unknown>(sql: string, values: readonly unknown[] = []): Promise<QueryResult<TRecord>> {
    const result = await this.pool.query(sql, [...values]);
    return { rows: result.rows as TRecord[] };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
