export function getEnvironmentTenantId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const tenantId = env.APP_TENANT_ID?.trim();
  return tenantId ? tenantId : undefined;
}

export function requireEnvironmentTenantId(env: NodeJS.ProcessEnv = process.env): string {
  const tenantId = getEnvironmentTenantId(env);
  if (!tenantId) {
    throw new Error('APP_TENANT_ID is required to resolve runtime tenant.');
  }
  return tenantId;
}
