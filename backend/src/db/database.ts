import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

function defaultConnectionString(): string {
  const { host, port, name, user, password } = config.database;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
}

export class DatabaseService {
  private readonly pool: Pool;

  constructor(connectionString?: string) {
    const cs = connectionString ?? process.env.DATABASE_URL ?? defaultConnectionString();
    this.pool = new Pool({ connectionString: cs, max: 20 });
    this.pool.on('error', (err: Error) => {
      logger.error('Unexpected PostgreSQL pool error', err);
    });
  }

  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<R>> {
    const start = Date.now();
    const result = await this.pool.query<R>(text, params);
    const duration = Date.now() - start;
    logger.debug(`Query executed in ${duration}ms: ${text.substring(0, 80)}...`);
    return result;
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 AS ok');
      return result.rows[0]?.ok === 1;
    } catch (err) {
      logger.error('Database health check failed', err);
      return false;
    }
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}
