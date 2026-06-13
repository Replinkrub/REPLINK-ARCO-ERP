import type { AccessContext } from '../../domain/ownership.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import type { CustomerRepresentedCommercialProfileRepository } from '../ports/customerRepresentedCommercialProfileRepository.js';
import type { CustomerProductPriceOverrideRepository } from '../ports/customerProductPriceOverrideRepository.js';
import type { CustomerRepository } from '../ports/customerRepository.js';
import type { PriceTableItemRepository } from '../ports/priceTableItemRepository.js';
import type { PriceTableRepository } from '../ports/priceTableRepository.js';
import type { ProductRepository } from '../ports/productRepository.js';
import type { RepresentedCompanyRepository } from '../ports/representedCompanyRepository.js';
import { applicationFailure, applicationSuccess, type ApplicationFailureResult, type ApplicationResult } from '../result.js';

export type ResolvedPriceSource = 'CUSTOMER_PRODUCT_OVERRIDE' | 'PRICE_TABLE_ITEM';

export interface ResolvedPriceResponse {
  tenantId: string;
  customerId: string;
  representedCompanyId: string;
  productId: string;
  unitPrice: number;
  source: ResolvedPriceSource;
  sourceId: string;
  priceTableId?: string;
}

type Deps = {
  customerRepository: CustomerRepository;
  representedCompanyRepository: RepresentedCompanyRepository;
  productRepository: ProductRepository;
  customerProductPriceOverrideRepository: CustomerProductPriceOverrideRepository;
  customerRepresentedCommercialProfileRepository: CustomerRepresentedCommercialProfileRepository;
  priceTableRepository: PriceTableRepository;
  priceTableItemRepository: PriceTableItemRepository;
};

export async function resolvePriceUseCase(
  deps: Deps,
  input: { actor: AccessContext; customerId: string; representedCompanyId: string; productId: string; onDate?: string }
): Promise<ApplicationResult<ResolvedPriceResponse>> {
  if (input.actor.role !== 'ADMIN' && input.actor.role !== 'REPRESENTANTE') return forbidden();
  const onDate = input.onDate ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(onDate)) return validationError('on_date deve usar formato YYYY-MM-DD', 'on_date');

  const customer = await deps.customerRepository.getById({ tenantId: input.actor.actorTenantId, actorId: input.actor.actorId, role: input.actor.role, customerId: input.customerId });
  if (!customer) return customerNotFound(input.customerId);
  const represented = await deps.representedCompanyRepository.getById({ tenantId: input.actor.actorTenantId, representedCompanyId: input.representedCompanyId });
  if (!represented || represented.status !== 'active') return representedCompanyNotFound(input.representedCompanyId);
  const product = await deps.productRepository.getById({ tenantId: input.actor.actorTenantId, actorId: input.actor.actorId, role: input.actor.role, productId: input.productId });
  if (!product) return productNotFound(input.productId);
  if (product.status !== 'active') return validationError('Produto deve estar ativo', 'product_id');
  if (product.representedCompanyId !== input.representedCompanyId) return validationError('Produto deve pertencer à representada informada', 'product_id');

  const override = await deps.customerProductPriceOverrideRepository.findActive({ tenantId: input.actor.actorTenantId, customerId: input.customerId, representedCompanyId: input.representedCompanyId, productId: input.productId, onDate });
  if (override) {
    return applicationSuccess({ tenantId: input.actor.actorTenantId, customerId: input.customerId, representedCompanyId: input.representedCompanyId, productId: input.productId, unitPrice: override.unitPrice, source: 'CUSTOMER_PRODUCT_OVERRIDE', sourceId: override.id });
  }

  const profile = await deps.customerRepresentedCommercialProfileRepository.getByCustomerAndRepresented({ tenantId: input.actor.actorTenantId, customerId: input.customerId, representedCompanyId: input.representedCompanyId });
  if (!profile?.defaultPriceTableId) return priceNotResolvable('Cliente não possui tabela base/default para a representada');
  const priceTable = await deps.priceTableRepository.getById({ tenantId: input.actor.actorTenantId, actorId: input.actor.actorId, role: input.actor.role, priceTableId: profile.defaultPriceTableId });
  if (!priceTable || priceTable.status !== 'active') return priceNotResolvable('Tabela base/default não encontrada ou inativa');
  const item = await deps.priceTableItemRepository.findActiveByPriceTableAndProduct({ tenantId: input.actor.actorTenantId, actorId: input.actor.actorId, role: input.actor.role, priceTableId: profile.defaultPriceTableId, productId: input.productId, onDate });
  if (!item) return priceNotResolvable('Preço não resolvível para cliente, representada e produto');
  return applicationSuccess({ tenantId: input.actor.actorTenantId, customerId: input.customerId, representedCompanyId: input.representedCompanyId, productId: input.productId, unitPrice: item.unitPrice, source: 'PRICE_TABLE_ITEM', sourceId: item.id, priceTableId: item.priceTableId });
}

function validationError(message: string, field: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, message, { field });
}

function customerNotFound(customerId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.CUSTOMER_NOT_FOUND, 'Cliente não encontrado', { customerId });
}

function representedCompanyNotFound(representedCompanyId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Representada não encontrada ou inativa', { representedCompanyId });
}

function productNotFound(productId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.PRODUCT_NOT_FOUND, 'Produto não encontrado', { productId });
}

function priceNotResolvable(message: string): ApplicationFailureResult {
  return applicationFailure(APPLICATION_ERROR_CODES.PRICE_NOT_RESOLVABLE, message);
}

function forbidden() {
  return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Ação não permitida');
}
