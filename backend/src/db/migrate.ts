import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { config } from '../config';
import { logger } from '../utils/logger';
import { DatabaseService } from './database';

dotenv.config();

function buildConnectionString(): string {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }
  const { host, port, name, user, password } = config.database;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
}

/** Resolve schema files for ts-node (src/db), compiled (dist/backend/src/db), or cwd. */
export function resolveSchemaPath(filename: string): string {
  const candidates = [
    path.join(__dirname, filename),
    path.join(__dirname, '..', '..', 'src', 'db', filename),
    path.join(process.cwd(), 'src', 'db', filename),
    path.join(process.cwd(), 'backend', 'src', 'db', filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error(`Missing schema file: ${filename} (searched: ${candidates.join('; ')})`);
}

function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
  return (
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|connection refused|timeout|getaddrinfo|password authentication failed/i.test(
      msg
    ) || ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(code)
  );
}

function shouldFallbackToCoreSchema(err: unknown): boolean {
  if (isConnectionError(err)) {
    return false;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /timescaledb|create_hypertable|continuous aggregate|timescaledb_information|extension "timescaledb"/i.test(
    msg
  );
}

async function verifySchema(db: DatabaseService): Promise<{ hypertable: boolean }> {
  const required = ['products', 'price_history', 'prediction_outcomes', 'model_performance'];
  for (const table of required) {
    const r = await db.query<{ ok: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = $1
      ) AS ok`,
      [table]
    );
    if (!r.rows[0]?.ok) {
      throw new Error(`Verification failed: table "${table}" is missing`);
    }
  }
  const qCol = await db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'price_history' AND column_name = 'quality'
     LIMIT 1`
  );
  if (qCol.rows.length === 0) {
    throw new Error('Verification failed: price_history.quality column is missing');
  }

  let hypertable = false;
  try {
    const h = await db.query(
      `SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'price_history' LIMIT 1`
    );
    hypertable = h.rows.length > 0;
  } catch {
    /* plain Postgres or Timescale metadata not available */
  }
  return { hypertable };
}

export async function runMigrations(): Promise<void> {
  const url = buildConnectionString();
  const db = new DatabaseService(url);
  let usedCoreFallback = false;

  try {
    const schemaPath = resolveSchemaPath('schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    logger.info(`Running database migrations from ${schemaPath}`);
    try {
      await db.query(sql);
      logger.info('Database migrations completed successfully (full Timescale schema)');
    } catch (err) {
      if (!shouldFallbackToCoreSchema(err)) {
        throw err;
      }
      logger.warn(
        `Full schema failed (Timescale or related); applying core schema without hypertable/compression/CAgg. Cause: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      const corePath = resolveSchemaPath('schema.core.sql');
      const coreSql = fs.readFileSync(corePath, 'utf8');
      await db.query(coreSql);
      usedCoreFallback = true;
      logger.info('Core schema applied successfully (Timescale features skipped)');
    }

    try {
      const patchPath = resolveSchemaPath('prompt8_prediction_outcomes.sql');
      const patchSql = fs.readFileSync(patchPath, 'utf8');
      await db.query(patchSql);
      logger.info(`Applied Prompt 8 patch: ${patchPath}`);
    } catch (patchErr) {
      logger.warn(
        `Prompt 8 prediction_outcomes patch failed (skeleton inserts may fail until fixed): ${
          patchErr instanceof Error ? patchErr.message : String(patchErr)
        }`
      );
    }

    const { hypertable } = await verifySchema(db);
    logger.info(
      `Schema verification passed (hypertable=${hypertable}, coreFallback=${usedCoreFallback})`
    );
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
