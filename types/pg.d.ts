declare module "pg" {
  interface PoolConfig {
    connectionString?: string;
    ssl?: boolean | { rejectUnauthorized?: boolean };
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    allowExitOnIdle?: boolean;
  }

  interface QueryResult {
    rows: unknown[];
    rowCount: number | null;
  }

  export class Client {
    constructor(config?: PoolConfig);
    connect(): Promise<void>;
    query(text: string, params?: unknown[]): Promise<QueryResult>;
    end(): Promise<void>;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query(text: string, params?: unknown[]): Promise<QueryResult>;
    on(event: "error", listener: (err: Error) => void): this;
    end(): Promise<void>;
  }
}
