// Requirements: DB-007, ARC-003

export interface DatabaseClient {
  query<TRecord = unknown>(sql: string, values?: readonly unknown[]): Promise<QueryResult<TRecord>>;
}

export interface QueryResult<TRecord> {
  rows: TRecord[];
}
