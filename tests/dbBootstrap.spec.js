import { describe, expect, it } from 'vitest';
import { bootstrapEnvironmentTenant } from '../scripts/db-bootstrap.mjs';

function createFakeClient(existingTenantIds = new Set()) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      const tenantId = params[0];
      if (existingTenantIds.has(tenantId)) {
        return { rowCount: 0, rows: [] };
      }
      existingTenantIds.add(tenantId);
      return { rowCount: 1, rows: [{ id: tenantId }] };
    },
  };
}

describe('db bootstrap tenant', () => {
  it('requires APP_TENANT_ID', async () => {
    const client = createFakeClient();
    await expect(bootstrapEnvironmentTenant(client, {}, { log: () => undefined })).rejects.toThrow(
      'APP_TENANT_ID is required to bootstrap environment tenant.'
    );
  });

  it('inserts configured tenant idempotently', async () => {
    const client = createFakeClient();
    const env = { APP_TENANT_ID: 'tenant-pr4a', APP_TENANT_NAME: 'Tenant PR4a' };
    const logger = { log: () => undefined };

    await expect(bootstrapEnvironmentTenant(client, env, logger)).resolves.toEqual({
      tenantId: 'tenant-pr4a',
      inserted: true,
    });
    await expect(bootstrapEnvironmentTenant(client, env, logger)).resolves.toEqual({
      tenantId: 'tenant-pr4a',
      inserted: false,
    });

    expect(client.calls).toHaveLength(2);
    expect(client.calls[0].params).toEqual(['tenant-pr4a', 'Tenant PR4a']);
    expect(client.calls[0].sql).toContain('ON CONFLICT (id) DO NOTHING');
  });
});
