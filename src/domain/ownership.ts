import type { Role } from './types.js';

export interface AccessContext {
  role: Role;
  actorId: string;
  actorTenantId: string;
  actorManagerOf?: string[];
  supportOverride?: boolean;
}

export interface RecordScope {
  tenantId: string;
  representativeId: string;
}

export function canAccessRecord(context: AccessContext, record: RecordScope): boolean {
  if (context.actorTenantId !== record.tenantId) return false;

  if (context.role === 'ADMIN' || context.role === 'OWNER') return true;

  if (context.role === 'REPRESENTANTE') {
    return context.actorId === record.representativeId;
  }

  if (context.role === 'GESTOR_COMERCIAL') {
    return (context.actorManagerOf ?? []).includes(record.representativeId);
  }

  if (context.role === 'SUPORTE_OPERACAO') {
    return context.supportOverride === true;
  }

  return false;
}

export function canChangeOwnership(role: Role): boolean {
  return role === 'ADMIN' || role === 'OWNER';
}

export function canDeleteCommercialRecord(role: Role): boolean {
  return role === 'ADMIN' || role === 'OWNER';
}
