import { type PoolClient, type QueryResult } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';
import { DatabaseService } from '../db/database';

function connectionString(): string {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }
  const { host, port, name, user, password } = config.database;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
}

const db = new DatabaseService(connectionString());

export async function query(
  text: string,
  params?: unknown[]
): Promise<QueryResult> {
  return db.query(text, params);
}

export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  return db.transaction(callback);
}

export async function testConnection(): Promise<boolean> {
  const ok = await db.healthCheck();
  if (ok) {
    const result = await query('SELECT NOW()');
    logger.info(`Database connected: ${result.rows[0].now}`);
  }
  return ok;
}

export { db as databaseService };
export default db;
