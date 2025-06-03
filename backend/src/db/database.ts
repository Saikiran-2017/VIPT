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

// Updated: 2025-03-04 - Update error handling in payment processor

// Updated: 2025-03-06 - Add snapshot tests

// Updated: 2025-03-10 - Clean up test fixtures

// Updated: 2025-03-11 - Add real-time notifications feature

// Updated: 2025-03-15 - Fix timezone handling

// Updated: 2025-03-15 - Add mock data generators

// Updated: 2025-03-18 - Fix formatting in output

// Updated: 2025-03-21 - Implement recommendation engine

// Updated: 2025-03-21 - Update changelog

// Updated: 2025-03-21 - Update configuration guide

// Updated: 2025-03-21 - Add batch processing system

// Updated: 2025-03-21 - Fix CSS alignment issue

// Updated: 2025-03-22 - Optimize SQL queries for performance

// Updated: 2025-03-24 - Add snapshot tests

// Updated: 2025-03-27 - Write troubleshooting guide

// Updated: 2025-03-27 - Clean up test fixtures

// Updated: 2025-03-29 - Add unit tests for service layer

// Updated: 2025-04-06 - Fix test database setup

// Updated: 2025-04-07 - Add setup instructions

// Updated: 2025-04-09 - Add integration test suite

// Updated: 2025-04-10 - Add real-time notifications feature

// Updated: 2025-04-10 - Add integration test suite

// Updated: 2025-04-10 - Document database schema

// Updated: 2025-04-10 - Update error handling in payment processor

// Updated: 2025-04-16 - Fix test database setup

// Updated: 2025-04-16 - Build analytics dashboard

// Updated: 2025-04-18 - Improve test documentation

// Updated: 2025-04-19 - Update changelog

// Updated: 2025-04-19 - Fix sorting order

// Updated: 2025-04-19 - Improve database transaction handling

// Updated: 2025-04-20 - Write troubleshooting guide

// Updated: 2025-04-20 - Add setup instructions

// Updated: 2025-04-21 - Add snapshot tests

// Updated: 2025-04-22 - Add architecture diagrams

// Updated: 2025-04-24 - Write quick start guide

// Updated: 2025-04-25 - Create reporting module

// Updated: 2025-04-25 - Fix concurrent access issue

// Updated: 2025-04-27 - Add alert management system

// Updated: 2025-04-27 - Fix filter logic

// Updated: 2025-04-29 - Create product search functionality

// Updated: 2025-05-02 - Fix typo in validation logic

// Updated: 2025-05-02 - Fix input validation bug

// Updated: 2025-05-04 - Fix null pointer exception

// Updated: 2025-05-06 - Add unit tests for service layer

// Updated: 2025-05-07 - Write quick start guide

// Updated: 2025-05-07 - Add end-to-end tests

// Updated: 2025-05-11 - Add health check endpoint

// Updated: 2025-05-11 - Refactor service layer

// Updated: 2025-05-14 - Add timeout configuration

// Updated: 2025-05-15 - Create admin panel interface

// Updated: 2025-05-16 - Add contributing guidelines

// Updated: 2025-05-16 - Fix concurrent access issue

// Updated: 2025-05-16 - Build analytics dashboard

// Updated: 2025-05-18 - Write quick start guide

// Updated: 2025-05-20 - Fix CSS alignment issue

// Updated: 2025-05-22 - Add batch processing system

// Updated: 2025-05-23 - Fix test database setup

// Updated: 2025-05-23 - Create reporting module

// Updated: 2025-05-23 - Build analytics dashboard

// Updated: 2025-05-24 - Create admin panel interface

// Updated: 2025-05-26 - Update changelog

// Updated: 2025-05-26 - Fix timezone handling

// Updated: 2025-06-02 - Add architecture diagrams

// Updated: 2025-06-04 - Fix failing integration tests

// Updated: 2025-06-04 - Fix date parsing issue
