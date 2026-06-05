import { describe, expect, it } from 'vitest';
import {
  PostgresOrderRepository,
  PostgresQuoteRepository,
  createQuote,
  convertQuoteToOrder,
  type SqlExecutor,
} from '../src/index.js';
import type { QueryResultRow } from 'pg';

class FakeSqlExecutor implements SqlExecutor {
  calls: Array<{ text: string; values?: unknown[] }> = [];
  resultRows: unknown[] = [];
  errorToThrow: (Error & { code?: string }) | null = null;
  async query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
    this.calls.push({ text, values });
    if (this.errorToThrow) {
      throw this.errorToThrow;
    }
    return {
      rows: this.resultRows as T[],
      rowCount: this.resultRows.length,
      command: 'SELECT',
      oid: 0,
      fields: [],
    };
  }
}

describe('postgres repositories', () => {
  it('enforces quote repository document type', async () => {
    const db = new FakeSqlExecutor();
    const repository = new PostgresQuoteRepository(db);
    const quote = createQuote({
      id: 'q-db-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
      numberSequence: 1,
    });
    const converted = convertQuoteToOrder(quote, 10);
    if (!converted.ok) return;

    await expect(repository.save(converted.document)).rejects.toThrowError('QUOTE_REPOSITORY_ONLY_ACCEPTS_QUOTES');
  });

  it('preserves source_quote_id uniqueness conflict contract on saveFromQuoteOnce', async () => {
    const db = new FakeSqlExecutor();
    const repository = new PostgresOrderRepository(db);
    const conflictError = new Error('duplicate key') as Error & { code?: string };
    conflictError.code = '23505';
    db.errorToThrow = conflictError;

    const quote = createQuote({
      id: 'q-db-2',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
      numberSequence: 2,
    });
    const converted = convertQuoteToOrder(quote, 20);
    if (!converted.ok) return;

    const result = await repository.saveFromQuoteOnce(converted.document);
    expect(result.ok).toBe(false);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.text).toContain('INSERT INTO commercial_documents');
  });

  it('persists represented_company_id when saving quote', async () => {
    const db = new FakeSqlExecutor();
    const repository = new PostgresQuoteRepository(db);
    const quote = createQuote({
      id: 'q-db-represented',
      tenantId: 'tenant-1',
      representedCompanyId: 'represented-1',
      customerId: 'customer-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
      numberSequence: 12,
    });

    await repository.save(quote);

    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.text).toContain('represented_company_id');
    expect(db.calls[0]?.values?.[4]).toBe('represented-1');
  });

  it('order save upserts only the order row without mutating source quote row', async () => {
    const db = new FakeSqlExecutor();
    const repository = new PostgresOrderRepository(db);

    const quote = createQuote({
      id: 'q-db-3',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
      numberSequence: 3,
    });
    const converted = convertQuoteToOrder(quote, 30);
    if (!converted.ok) return;

    await repository.save(converted.document);

    expect(db.calls).toHaveLength(1);
    const sql = db.calls[0]?.text ?? '';
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET');
    expect(sql).toContain('document_type = EXCLUDED.document_type');
    expect(sql).toContain('source_quote_id = EXCLUDED.source_quote_id');
    expect(sql).toContain('source_quote_snapshot = EXCLUDED.source_quote_snapshot');
    expect(db.calls[0]?.values?.[0]).not.toBe(quote.id);
    expect(converted.document.source_quote_id).toBe(quote.id);
  });

  it('saveFromQuoteOnce inserts without id upsert so duplicate source quote conflicts are not hidden', async () => {
    const db = new FakeSqlExecutor();
    const repository = new PostgresOrderRepository(db);

    const quote = createQuote({
      id: 'q-db-4',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
      numberSequence: 4,
    });
    const converted = convertQuoteToOrder(quote, 40);
    if (!converted.ok) return;

    const result = await repository.saveFromQuoteOnce(converted.document);

    expect(result.ok).toBe(true);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.text).toContain('INSERT INTO commercial_documents');
    expect(db.calls[0]?.text).toContain('represented_company_id');
    expect(db.calls[0]?.text).not.toContain('ON CONFLICT (id) DO UPDATE SET');
  });
});
