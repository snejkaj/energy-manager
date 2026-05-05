// Requirements: DB-007, ARC-003

import type { DatabaseClient } from "../DatabaseClient.js";

export abstract class BaseRepository {
  protected constructor(protected readonly db: DatabaseClient) {}

  protected async one<TRecord>(sql: string, values: readonly unknown[]): Promise<TRecord> {
    const result = await this.db.query<TRecord>(sql, values);
    const record = result.rows[0];
    if (record === undefined) {
      throw new Error("Expected database query to return one row.");
    }

    return record;
  }

  protected async many<TRecord>(sql: string, values: readonly unknown[] = []): Promise<TRecord[]> {
    const result = await this.db.query<TRecord>(sql, values);
    return result.rows;
  }
}
