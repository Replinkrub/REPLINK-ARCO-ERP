import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to run migrations.');
  process.exit(1);
}

const migrationsDir = resolve(process.cwd(), 'src/infrastructure/postgres/migrations');
const entries = await readdir(migrationsDir);
const files = entries.filter((entry) => entry.endsWith('.sql')).sort();

if (files.length === 0) {
  console.log('No SQL migrations found.');
  process.exit(0);
}

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  for (const file of files) {
    const sql = await readFile(resolve(migrationsDir, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log(`Applied migration: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  console.log(`Migration run completed (${files.length} file(s)).`);
} finally {
  await client.end();
}
