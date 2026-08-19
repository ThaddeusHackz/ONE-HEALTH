declare module "pg" {
  export class Client {
    constructor(config?: { connectionString?: string; ssl?: boolean | { rejectUnauthorized?: boolean } });
    connect(): Promise<void>;
    query(text: string, params?: unknown[]): Promise<unknown>;
    end(): Promise<void>;
  }
}
