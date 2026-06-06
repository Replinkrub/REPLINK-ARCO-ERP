import { randomUUID } from 'node:crypto';
import type { AccessContext } from '../../domain/ownership.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import type { CustomerAddressRecord, CustomerAddressRepository, CustomerAddressStatus, CustomerAddressType } from '../ports/customerAddressRepository.js';
import type { CustomerRepository } from '../ports/customerRepository.js';
import { applicationFailure, applicationSuccess, type ApplicationResult } from '../result.js';

export interface CustomerAddressPayload {
  [key: string]: unknown;
  id?: unknown;
  addressType?: unknown;
  address_type?: unknown;
  type?: unknown;
  label?: unknown;
  zipcode?: unknown;
  postalCode?: unknown;
  postal_code?: unknown;
  street?: unknown;
  number?: unknown;
  complement?: unknown;
  district?: unknown;
  city?: unknown;
  state?: unknown;
  country?: unknown;
  isPrimary?: unknown;
  is_primary?: unknown;
  status?: unknown;
}

type CustomerAddressPatchPayload = Partial<Pick<CustomerAddressRecord, 'addressType' | 'zipcode' | 'street' | 'number' | 'complement' | 'district' | 'city' | 'state' | 'country' | 'isPrimary' | 'status'>>;

const ALLOWED_FIELDS = new Set(['id', 'addressType', 'address_type', 'type', 'label', 'zipcode', 'postalCode', 'postal_code', 'street', 'number', 'complement', 'district', 'city', 'state', 'country', 'isPrimary', 'is_primary', 'status']);
const OUT_OF_SCOPE_FIELDS = new Set([
  'contacts', 'contact', 'customer', 'owner_id', 'ownerId', 'representative_id', 'representativeId', 'tenant_id', 'tenantId',
  'default_payment_term_id', 'defaultPaymentTermId', 'default_price_table_id', 'defaultPriceTableId', 'commercial_profile', 'commercialProfile',
  'products', 'prices', 'payment_terms', 'paymentTerms', 'credit_limit', 'creditLimit', 'tax_profile', 'taxProfile', 'documents', 'quote_rules', 'quoteRules',
  'delivery_rules', 'deliveryRules',
]);
const ADDRESS_TYPES = new Set(['main', 'delivery', 'billing', 'other']);

export interface CustomerAddressResponse {
  id: string;
  tenantId: string;
  customerId: string;
  addressType: CustomerAddressType;
  zipcode?: string;
  street: string;
  number?: string;
  complement?: string;
  district?: string;
  city: string;
  state: string;
  country: string;
  isPrimary: boolean;
  status: CustomerAddressStatus;
  createdAt: string;
  updatedAt: string;
}

export async function listCustomerAddressesUseCase(
  deps: { customerRepository: CustomerRepository; customerAddressRepository: CustomerAddressRepository },
  input: { actor: AccessContext; customerId: string }
): Promise<ApplicationResult<{ items: CustomerAddressResponse[] }>> {
  const access = await ensureCustomerAccess(deps.customerRepository, input.actor, input.customerId);
  if (!access.ok) return access;
  const addresses = await deps.customerAddressRepository.listByCustomer({ tenantId: input.actor.actorTenantId, customerId: input.customerId });
  return applicationSuccess({ items: addresses.map(toCustomerAddressResponse) });
}

export async function createCustomerAddressUseCase(
  deps: { customerRepository: CustomerRepository; customerAddressRepository: CustomerAddressRepository },
  input: { actor: AccessContext; customerId: string; payload: CustomerAddressPayload; now?: Date }
): Promise<ApplicationResult<CustomerAddressResponse>> {
  const access = await ensureCustomerAccess(deps.customerRepository, input.actor, input.customerId);
  if (!access.ok) return access;
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo do PR7B addresses', outOfScopeField);
  const normalized = normalizeCustomerAddressPayload(input.payload, true);
  if (!normalized.ok) return normalized;

  const address = await deps.customerAddressRepository.create({
    id: stringOptional(input.payload.id) ?? randomUUID(),
    tenantId: input.actor.actorTenantId,
    customerId: input.customerId,
    addressType: normalized.data.addressType ?? 'main',
    zipcode: normalized.data.zipcode,
    street: normalized.data.street,
    number: normalized.data.number,
    complement: normalized.data.complement,
    district: normalized.data.district,
    city: normalized.data.city,
    state: normalized.data.state,
    country: normalized.data.country ?? 'BR',
    isPrimary: normalized.data.isPrimary ?? false,
    status: normalized.data.status ?? 'active',
    now: input.now,
  });
  return applicationSuccess(toCustomerAddressResponse(address));
}

export async function updateCustomerAddressUseCase(
  deps: { customerRepository: CustomerRepository; customerAddressRepository: CustomerAddressRepository },
  input: { actor: AccessContext; customerId: string; addressId: string; payload: CustomerAddressPayload; now?: Date }
): Promise<ApplicationResult<CustomerAddressResponse>> {
  const access = await ensureCustomerAccess(deps.customerRepository, input.actor, input.customerId);
  if (!access.ok) return access;
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo do PR7B addresses', outOfScopeField);
  const normalized = normalizeCustomerAddressPayload(input.payload, false);
  if (!normalized.ok) return normalized;
  const address = await deps.customerAddressRepository.update({
    tenantId: input.actor.actorTenantId,
    customerId: input.customerId,
    addressId: input.addressId,
    patch: normalized.data,
    now: input.now,
  });
  if (!address) return addressNotFound(input.addressId);
  return applicationSuccess(toCustomerAddressResponse(address));
}

function normalizeCustomerAddressPayload(payload: CustomerAddressPayload, requireCore: true): ApplicationResult<CustomerAddressPatchPayload & Pick<CustomerAddressRecord, 'street' | 'city' | 'state'>>;
function normalizeCustomerAddressPayload(payload: CustomerAddressPayload, requireCore: false): ApplicationResult<CustomerAddressPatchPayload>;
function normalizeCustomerAddressPayload(payload: CustomerAddressPayload, requireCore: boolean): ApplicationResult<CustomerAddressPatchPayload> {
  const unknownField = findUnknownField(payload);
  if (unknownField) return validationError('Campo fora do escopo do PR7B addresses', unknownField);
  const street = stringOptional(payload.street);
  const city = stringOptional(payload.city);
  const state = stringOptional(payload.state);
  if (requireCore && !street) return validationError('street é obrigatório', 'street');
  if (requireCore && !city) return validationError('city é obrigatório', 'city');
  if (requireCore && !state) return validationError('state é obrigatório', 'state');

  const status = stringOptional(payload.status);
  if (status !== undefined && status !== 'active' && status !== 'inactive') return validationError('status inválido', 'status');
  const addressType = stringOptional(payload.addressType ?? payload.address_type ?? payload.type ?? payload.label);
  if (addressType !== undefined && !ADDRESS_TYPES.has(addressType)) return validationError('address_type inválido', 'address_type');
  const isPrimary = booleanOptional(payload.isPrimary ?? payload.is_primary);
  if ((payload.isPrimary ?? payload.is_primary) !== undefined && isPrimary === undefined) return validationError('is_primary inválido', 'is_primary');

  const normalized: CustomerAddressPatchPayload = {};
  if (addressType !== undefined) normalized.addressType = addressType as CustomerAddressType;
  const zipcode = stringOptional(payload.zipcode ?? payload.postalCode ?? payload.postal_code);
  if (zipcode !== undefined) normalized.zipcode = zipcode;
  if (street !== undefined) normalized.street = street;
  const number = stringOptional(payload.number);
  if (number !== undefined) normalized.number = number;
  const complement = stringOptional(payload.complement);
  if (complement !== undefined) normalized.complement = complement;
  const district = stringOptional(payload.district);
  if (district !== undefined) normalized.district = district;
  if (city !== undefined) normalized.city = city;
  if (state !== undefined) normalized.state = state;
  const country = stringOptional(payload.country);
  if (country !== undefined) normalized.country = country;
  if (isPrimary !== undefined) normalized.isPrimary = isPrimary;
  if (status !== undefined) normalized.status = status as CustomerAddressStatus;
  return applicationSuccess(normalized);
}

async function ensureCustomerAccess(customerRepository: CustomerRepository, actor: AccessContext, customerId: string): Promise<ApplicationResult<true>> {
  if (!isSupportedCustomerRole(actor.role)) return forbidden();
  const customer = await customerRepository.getById({ tenantId: actor.actorTenantId, actorId: actor.actorId, role: actor.role, customerId });
  if (customer) return applicationSuccess(true);
  const exists = await customerRepository.findStatusByTenantAndId({ tenantId: actor.actorTenantId, customerId });
  return exists ? forbidden() : customerNotFound(customerId);
}

function toCustomerAddressResponse(address: CustomerAddressRecord): CustomerAddressResponse {
  return {
    id: address.id,
    tenantId: address.tenantId,
    customerId: address.customerId,
    addressType: address.addressType,
    zipcode: address.zipcode,
    street: address.street,
    number: address.number,
    complement: address.complement,
    district: address.district,
    city: address.city,
    state: address.state,
    country: address.country,
    isPrimary: address.isPrimary,
    status: address.status,
    createdAt: address.createdAt.toISOString(),
    updatedAt: address.updatedAt.toISOString(),
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

function findOutOfScopeField(payload: CustomerAddressPayload): string | null {
  for (const field of Object.keys(payload)) {
    if (OUT_OF_SCOPE_FIELDS.has(field)) return field;
  }
  return null;
}

function findUnknownField(payload: CustomerAddressPayload): string | null {
  for (const field of Object.keys(payload)) {
    if (!ALLOWED_FIELDS.has(field)) return field;
  }
  return null;
}

function customerNotFound(customerId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.CUSTOMER_NOT_FOUND, 'Cliente não encontrado', { customerId });
}

function addressNotFound(addressId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.CUSTOMER_ADDRESS_NOT_FOUND, 'Endereço não encontrado', { addressId });
}

function forbidden() {
  return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Operação não permitida');
}

function isSupportedCustomerRole(role: AccessContext['role']): role is 'ADMIN' | 'REPRESENTANTE' {
  return role === 'ADMIN' || role === 'REPRESENTANTE';
}
