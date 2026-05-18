import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pg from 'pg';

// Walk up from cwd to find the first .env — workspaces run scripts from sub-dirs.
function findEnvFile(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const envPath = findEnvFile();
if (envPath) loadEnv({ path: envPath });
else loadEnv();

const { Pool } = pg;

let _pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (_pool) return _pool;
  if (!process.env.KB_DATABASE_URL) {
    throw new Error('KB_DATABASE_URL is required');
  }
  _pool = new Pool({
    connectionString: process.env.KB_DATABASE_URL,
    max: 10,
  });
  _pool.on('error', (err) => {
    console.error('[db] unexpected pool error', err);
  });
  return _pool;
}

// Lazy proxy — only constructs the real pool on first access.
export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    const p = getPool();
    const value = (p as unknown as Record<PropertyKey, unknown>)[prop as PropertyKey];
    return typeof value === 'function' ? value.bind(p) : value;
  },
});

export type QueryParams = ReadonlyArray<unknown>;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: QueryParams,
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as unknown[]);
}

export async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
}
