import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Client } = pg;

function requireEnvironmentTenantId(env = process.env) {
  const tenantId = env.APP_TENANT_ID?.trim();
  if (!tenantId) {
    throw new Error('APP_TENANT_ID is required to bootstrap environment tenant.');
  }
  return tenantId;
}

function getEnvironmentTenantName(tenantId, env = process.env) {
  const tenantName = env.APP_TENANT_NAME?.trim();
  return tenantName || tenantId;
}

export async function bootstrapEnvironmentTenant(client, env = process.env, logger = console) {
  const tenantId = requireEnvironmentTenantId(env);
  const tenantName = getEnvironmentTenantName(tenantId, env);

  const result = await client.query(
    `INSERT INTO tenants (id, name, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [tenantId, tenantName]
  );

  const inserted = result.rowCount === 1;
  logger.log(inserted ? `Bootstrapped tenant: ${tenantId}` : `Tenant already exists: ${tenantId}`);
  return { tenantId, inserted };
}

export async function runBootstrapCli({ databaseUrl = process.env.DATABASE_URL, env = process.env, logger = console } = {}) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to bootstrap environment tenant.');
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    return await bootstrapEnvironmentTenant(client, env, logger);
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBootstrapCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
