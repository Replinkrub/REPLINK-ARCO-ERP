import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const CREATE_SCHEMA_MIGRATIONS_SQL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

const MIGRATION_LOCK_ID = 424242001;

export function calculateChecksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

export async function readMigrationFiles(migrationsDir) {
  const entries = await readdir(migrationsDir);
  const files = entries.filter((entry) => entry.endsWith('.sql')).sort();

  return Promise.all(
    files.map(async (filename) => ({
      filename,
      sql: await readFile(resolve(migrationsDir, filename), 'utf8'),
    }))
  );
}

export async function runMigrations(client, migrations, logger = console) {
  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
  try {
    await client.query(CREATE_SCHEMA_MIGRATIONS_SQL);

    let applied = 0;
    let skipped = 0;

    for (const migration of migrations) {
      const checksum = calculateChecksum(migration.sql);
      const existing = await client.query(
        'SELECT filename, checksum FROM schema_migrations WHERE filename = $1 LIMIT 1',
        [migration.filename]
      );

      if (existing.rowCount > 0) {
        const existingChecksum = existing.rows[0]?.checksum;
        if (existingChecksum !== checksum) {
          throw new Error(`MIGRATION_CHECKSUM_MISMATCH: ${migration.filename}`);
        }

        skipped += 1;
        logger.log(`Skipped migration: ${migration.filename}`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [migration.filename, checksum]
        );
        await client.query('COMMIT');
        applied += 1;
        logger.log(`Applied migration: ${migration.filename}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    logger.log(`Migration run completed (${applied} applied, ${skipped} skipped).`);
    return { applied, skipped };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
  }
}

export async function runMigrationCli({ databaseUrl = process.env.DATABASE_URL, cwd = process.cwd(), logger = console } = {}) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations.');
  }

  const migrationsDir = resolve(cwd, 'src/infrastructure/postgres/migrations');
  const migrations = await readMigrationFiles(migrationsDir);

  if (migrations.length === 0) {
    logger.log('No SQL migrations found.');
    return { applied: 0, skipped: 0 };
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    return await runMigrations(client, migrations, logger);
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrationCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
