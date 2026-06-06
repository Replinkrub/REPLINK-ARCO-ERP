import { randomUUID } from 'node:crypto';
import type { AccessContext } from '../../domain/ownership.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import type { CustomerRepository } from '../ports/customerRepository.js';
import type { CustomerContactRecord, CustomerContactRepository, CustomerContactStatus } from '../ports/customerContactRepository.js';
import { applicationFailure, applicationSuccess, type ApplicationResult } from '../result.js';

export interface CustomerContactPayload {
  [key: string]: unknown;
  id?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  whatsapp?: unknown;
  role?: unknown;
  title?: unknown;
  roleTitle?: unknown;
  role_title?: unknown;
  isPrimary?: unknown;
  is_primary?: unknown;
  status?: unknown;
}

type CustomerContactPatchPayload = Partial<Pick<CustomerContactRecord, 'name' | 'roleTitle' | 'phone' | 'whatsapp' | 'email' | 'isPrimary' | 'status'>>;

const ALLOWED_FIELDS = new Set(['id', 'name', 'email', 'phone', 'whatsapp', 'role', 'title', 'roleTitle', 'role_title', 'isPrimary', 'is_primary', 'status']);
const OUT_OF_SCOPE_FIELDS = new Set([
  'addresses', 'address', 'customer', 'owner_id', 'ownerId', 'representative_id', 'representativeId', 'tenant_id', 'tenantId',
  'default_payment_term_id', 'defaultPaymentTermId', 'default_price_table_id', 'defaultPriceTableId', 'commercial_profile', 'commercialProfile',
  'products', 'prices', 'payment_terms', 'paymentTerms', 'credit_limit', 'creditLimit', 'tax_profile', 'taxProfile', 'documents', 'quote_rules', 'quoteRules',
  'delivery_rules', 'deliveryRules',
]);

export interface CustomerContactResponse {
  id: string;
  tenantId: string;
  customerId: string;
  name: string;
  roleTitle?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  isPrimary: boolean;
  status: CustomerContactStatus;
  createdAt: string;
  updatedAt: string;
}

export async function listCustomerContactsUseCase(
  deps: { customerRepository: CustomerRepository; customerContactRepository: CustomerContactRepository },
  input: { actor: AccessContext; customerId: string }
): Promise<ApplicationResult<{ items: CustomerContactResponse[] }>> {
  const access = await ensureCustomerAccess(deps.customerRepository, input.actor, input.customerId);
  if (!access.ok) return access;
  const contacts = await deps.customerContactRepository.listByCustomer({ tenantId: input.actor.actorTenantId, customerId: input.customerId });
  return applicationSuccess({ items: contacts.map(toCustomerContactResponse) });
}

export async function createCustomerContactUseCase(
  deps: { customerRepository: CustomerRepository; customerContactRepository: CustomerContactRepository },
  input: { actor: AccessContext; customerId: string; payload: CustomerContactPayload; now?: Date }
): Promise<ApplicationResult<CustomerContactResponse>> {
  const access = await ensureCustomerAccess(deps.customerRepository, input.actor, input.customerId);
  if (!access.ok) return access;
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo do PR7B contacts', outOfScopeField);
  const normalized = normalizeCustomerContactPayload(input.payload, true);
  if (!normalized.ok) return normalized;

  const contact = await deps.customerContactRepository.create({
    id: stringOptional(input.payload.id) ?? randomUUID(),
    tenantId: input.actor.actorTenantId,
    customerId: input.customerId,
    name: normalized.data.name,
    roleTitle: normalized.data.roleTitle,
    phone: normalized.data.phone,
    whatsapp: normalized.data.whatsapp,
    email: normalized.data.email,
    isPrimary: normalized.data.isPrimary ?? false,
    status: normalized.data.status ?? 'active',
    now: input.now,
  });
  return applicationSuccess(toCustomerContactResponse(contact));
}

export async function updateCustomerContactUseCase(
  deps: { customerRepository: CustomerRepository; customerContactRepository: CustomerContactRepository },
  input: { actor: AccessContext; customerId: string; contactId: string; payload: CustomerContactPayload; now?: Date }
): Promise<ApplicationResult<CustomerContactResponse>> {
  const access = await ensureCustomerAccess(deps.customerRepository, input.actor, input.customerId);
  if (!access.ok) return access;
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo do PR7B contacts', outOfScopeField);
  const normalized = normalizeCustomerContactPayload(input.payload, false);
  if (!normalized.ok) return normalized;
  const contact = await deps.customerContactRepository.update({
    tenantId: input.actor.actorTenantId,
    customerId: input.customerId,
    contactId: input.contactId,
    patch: normalized.data,
    now: input.now,
  });
  if (!contact) return contactNotFound(input.contactId);
  return applicationSuccess(toCustomerContactResponse(contact));
}

function normalizeCustomerContactPayload(payload: CustomerContactPayload, requireName: true): ApplicationResult<CustomerContactPatchPayload & Pick<CustomerContactRecord, 'name'>>;
function normalizeCustomerContactPayload(payload: CustomerContactPayload, requireName: false): ApplicationResult<CustomerContactPatchPayload>;
function normalizeCustomerContactPayload(payload: CustomerContactPayload, requireName: boolean): ApplicationResult<CustomerContactPatchPayload> {
  const unknownField = findUnknownField(payload);
  if (unknownField) return validationError('Campo fora do escopo do PR7B contacts', unknownField);
  const name = stringOptional(payload.name);
  if (requireName && !name) return validationError('name é obrigatório', 'name');
  const status = stringOptional(payload.status);
  if (status !== undefined && status !== 'active' && status !== 'inactive') return validationError('status inválido', 'status');
  const isPrimary = booleanOptional(payload.isPrimary ?? payload.is_primary);
  if ((payload.isPrimary ?? payload.is_primary) !== undefined && isPrimary === undefined) return validationError('is_primary inválido', 'is_primary');

  const normalized: CustomerContactPatchPayload = {};
  if (name !== undefined) normalized.name = name;
  const roleTitle = stringOptional(payload.roleTitle ?? payload.role_title ?? payload.role ?? payload.title);
  if (roleTitle !== undefined) normalized.roleTitle = roleTitle;
  const phone = stringOptional(payload.phone);
  if (phone !== undefined) normalized.phone = phone;
  const whatsapp = stringOptional(payload.whatsapp);
  if (whatsapp !== undefined) normalized.whatsapp = whatsapp;
  const email = stringOptional(payload.email);
  if (email !== undefined) normalized.email = email;
  if (isPrimary !== undefined) normalized.isPrimary = isPrimary;
  if (status !== undefined) normalized.status = status as CustomerContactStatus;
  return applicationSuccess(normalized);
}

async function ensureCustomerAccess(customerRepository: CustomerRepository, actor: AccessContext, customerId: string): Promise<ApplicationResult<true>> {
  if (!isSupportedCustomerRole(actor.role)) return forbidden();
  const customer = await customerRepository.getById({ tenantId: actor.actorTenantId, actorId: actor.actorId, role: actor.role, customerId });
  if (customer) return applicationSuccess(true);
  const exists = await customerRepository.findStatusByTenantAndId({ tenantId: actor.actorTenantId, customerId });
  return exists ? forbidden() : customerNotFound(customerId);
}

function toCustomerContactResponse(contact: CustomerContactRecord): CustomerContactResponse {
  return {
    id: contact.id,
    tenantId: contact.tenantId,
    customerId: contact.customerId,
    name: contact.name,
    roleTitle: contact.roleTitle,
    phone: contact.phone,
    whatsapp: contact.whatsapp,
    email: contact.email,
    isPrimary: contact.isPrimary,
    status: contact.status,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

function stringOptional(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function booleanOptional(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function validationError(message: string, field: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, message, { field });
}

function findOutOfScopeField(payload: CustomerContactPayload): string | null {
  for (const field of Object.keys(payload)) {
    if (OUT_OF_SCOPE_FIELDS.has(field)) return field;
  }
  return null;
}

function findUnknownField(payload: CustomerContactPayload): string | null {
  for (const field of Object.keys(payload)) {
    if (!ALLOWED_FIELDS.has(field)) return field;
  }
  return null;
}

function customerNotFound(customerId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.CUSTOMER_NOT_FOUND, 'Cliente não encontrado', { customerId });
}

function contactNotFound(contactId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.CUSTOMER_CONTACT_NOT_FOUND, 'Contato não encontrado', { contactId });
}

function forbidden() {
  return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Operação não permitida');
}

function isSupportedCustomerRole(role: AccessContext['role']): role is 'ADMIN' | 'REPRESENTANTE' {
  return role === 'ADMIN' || role === 'REPRESENTANTE';
}
