import { describe, expect, it } from 'vitest';
import { calculateChecksum, runMigrations } from '../scripts/db-migrate.mjs';

class FakeMigrationClient {
  constructor() {
    this.applied = new Map();
    this.queries = [];
  }

  async query(text, values = []) {
    this.queries.push({ text, values });

    if (text.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) {
      return result([]);
    }

    if (text.startsWith('SELECT filename, checksum FROM schema_migrations')) {
      const filename = values[0];
      const checksum = this.applied.get(filename);
      return checksum ? result([{ filename, checksum }]) : result([]);
    }

    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
      return result([]);
    }

    if (text.startsWith('INSERT INTO schema_migrations')) {
      const [filename, checksum] = values;
      this.applied.set(filename, checksum);
      return result([]);
    }

    if (text.includes('FAIL_MIGRATION')) {
      throw new Error('migration failed');
    }

    return result([]);
  }
}

function result(rows) {
  return { rows, rowCount: rows.length };
}

function silentLogger() {
  const messages = [];
  return {
    messages,
    log: (message) => messages.push(message),
  };
}

describe('db migration runner', () => {
  it('applies an unapplied migration and records its checksum', async () => {
    const client = new FakeMigrationClient();
    const logger = silentLogger();
    const migration = { filename: '001_init.sql', sql: 'CREATE TABLE example (id TEXT);' };

    const summary = await runMigrations(client, [migration], logger);

    expect(summary).toEqual({ applied: 1, skipped: 0 });
    expect(client.applied.get('001_init.sql')).toBe(calculateChecksum(migration.sql));
    expect(logger.messages).toContain('Applied migration: 001_init.sql');
    expect(client.queries[0]?.text).toBe('SELECT pg_advisory_lock($1)');
    expect(client.queries.at(-1)?.text).toBe('SELECT pg_advisory_unlock($1)');
  });

  it('skips an already applied migration with the same checksum', async () => {
    const client = new FakeMigrationClient();
    const logger = silentLogger();
    const migration = { filename: '001_init.sql', sql: 'CREATE TABLE example (id TEXT);' };
    client.applied.set(migration.filename, calculateChecksum(migration.sql));

    const summary = await runMigrations(client, [migration], logger);

    expect(summary).toEqual({ applied: 0, skipped: 1 });
    expect(logger.messages).toContain('Skipped migration: 001_init.sql');
    expect(client.queries.some((query) => query.text === migration.sql)).toBe(false);
    expect(client.queries[0]?.text).toBe('SELECT pg_advisory_lock($1)');
    expect(client.queries.at(-1)?.text).toBe('SELECT pg_advisory_unlock($1)');
  });

  it('blocks when an applied filename has a different checksum', async () => {
    const client = new FakeMigrationClient();
    const migration = { filename: '001_init.sql', sql: 'CREATE TABLE changed (id TEXT);' };
    client.applied.set(migration.filename, calculateChecksum('CREATE TABLE original (id TEXT);'));

    await expect(runMigrations(client, [migration], silentLogger())).rejects.toThrow(
      'MIGRATION_CHECKSUM_MISMATCH: 001_init.sql'
    );
    expect(client.queries.some((query) => query.text === migration.sql)).toBe(false);
    expect(client.queries[0]?.text).toBe('SELECT pg_advisory_lock($1)');
    expect(client.queries.at(-1)?.text).toBe('SELECT pg_advisory_unlock($1)');
  });

  it('does not record a migration when applying it fails', async () => {
    const client = new FakeMigrationClient();
    const migration = { filename: '002_fail.sql', sql: 'FAIL_MIGRATION;' };

    await expect(runMigrations(client, [migration], silentLogger())).rejects.toThrow('migration failed');

    expect(client.applied.has('002_fail.sql')).toBe(false);
    expect(client.queries.some((query) => query.text === 'ROLLBACK')).toBe(true);
    expect(client.queries[0]?.text).toBe('SELECT pg_advisory_lock($1)');
    expect(client.queries.at(-1)?.text).toBe('SELECT pg_advisory_unlock($1)');
  });
});
