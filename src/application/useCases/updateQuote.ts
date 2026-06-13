import {
  addItem,
  removeItem,
  updateItem,
  type AddItemInput,
  type CommercialDocument,
  type UpdateItemInput,
} from '../../domain/commercialDocument.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import { applicationFailure, applicationSuccess, type ApplicationFailureResult, type ApplicationResult } from '../result.js';
import type { AccessContext } from '../../domain/ownership.js';
import type { CustomerProductPriceOverrideRepository } from '../ports/customerProductPriceOverrideRepository.js';
import type { CustomerRepresentedCommercialProfileRepository } from '../ports/customerRepresentedCommercialProfileRepository.js';
import type { CustomerRepository } from '../ports/customerRepository.js';
import type { PriceTableItemRepository } from '../ports/priceTableItemRepository.js';
import type { PriceTableRepository } from '../ports/priceTableRepository.js';
import type { ProductRepository } from '../ports/productRepository.js';
import type { QuoteRepository } from '../ports/quoteRepository.js';
import type { RepresentedCompanyRepository } from '../ports/representedCompanyRepository.js';
import { resolvePriceUseCase } from './priceResolution.js';

export interface UpdateQuoteItemPatch {
  itemId: string;
  patch: UpdateItemInput;
}

export interface UpdateQuoteUseCaseInput {
  id: string;
  actor?: AccessContext;
  customerId?: string;
  addItems?: AddItemInput[];
  updateItems?: UpdateQuoteItemPatch[];
  removeItemIds?: string[];
  pricedAt?: string;
}

export interface UpdateQuoteUseCaseDeps {
  quoteRepository: QuoteRepository;
  customerRepository: CustomerRepository;
  representedCompanyRepository?: RepresentedCompanyRepository;
  productRepository?: ProductRepository;
  customerProductPriceOverrideRepository?: CustomerProductPriceOverrideRepository;
  customerRepresentedCommercialProfileRepository?: CustomerRepresentedCommercialProfileRepository;
  priceTableRepository?: PriceTableRepository;
  priceTableItemRepository?: PriceTableItemRepository;
}

export async function updateQuote(
  deps: UpdateQuoteUseCaseDeps,
  input: UpdateQuoteUseCaseInput
): Promise<ApplicationResult<CommercialDocument>> {
  const quote = await deps.quoteRepository.getById(input.id);
  if (!quote) {
    return applicationFailure(APPLICATION_ERROR_CODES.DOCUMENT_NOT_FOUND, 'Orçamento não encontrado', { id: input.id });
  }

  if (quote.documentType !== 'quote') {
    return applicationFailure(APPLICATION_ERROR_CODES.DOCUMENT_NOT_QUOTE, 'Repositório de orçamento aceita apenas quote', {
      id: input.id,
      documentType: quote.documentType,
    });
  }

  let nextDocument: CommercialDocument = { ...quote };

  if (input.customerId !== undefined) {
    const customerId = input.customerId.trim();
    if (!customerId) {
      return applicationFailure(
        APPLICATION_ERROR_CODES.REQUIRED_CUSTOMER_ID,
        'Cliente é obrigatório para atualizar orçamento'
      );
    }

    const customerStatus = await deps.customerRepository.findStatusByTenantAndId({
      tenantId: nextDocument.tenantId,
      customerId,
    });
    if (customerStatus !== 'active') {
      return applicationFailure(
        APPLICATION_ERROR_CODES.CUSTOMER_NOT_AVAILABLE,
        'Cliente inválido ou indisponível'
      );
    }

    if (nextDocument.customerId !== customerId) {
      nextDocument = { ...nextDocument, customerId, updatedAt: new Date() };
    }
  }

  for (const item of input.addItems ?? []) {
    const resolvedItem = await resolveQuoteItemSnapshot(deps, nextDocument, input, item);
    if (!resolvedItem.ok) return resolvedItem;
    const result = addItem(nextDocument, resolvedItem.item);
    if (!result.ok) {
      return applicationFailure(APPLICATION_ERROR_CODES.DOMAIN_OPERATION_FAILED, 'Falha ao adicionar item no orçamento', {
        domainError: result.error,
      });
    }
    nextDocument = result.document;
  }

  for (const itemPatch of input.updateItems ?? []) {
    const currentItem = nextDocument.items.find((item) => item.id === itemPatch.itemId);
    const patch = await resolveQuoteItemPatchSnapshot(deps, nextDocument, input, currentItem, itemPatch.patch);
    if (!patch.ok) return patch;
    const result = updateItem(nextDocument, itemPatch.itemId, patch.patch);
    if (!result.ok) {
      return applicationFailure(APPLICATION_ERROR_CODES.DOMAIN_OPERATION_FAILED, 'Falha ao atualizar item no orçamento', {
        domainError: result.error,
      });
    }
    nextDocument = result.document;
  }

  for (const itemId of input.removeItemIds ?? []) {
    const result = removeItem(nextDocument, itemId);
    if (!result.ok) {
      return applicationFailure(APPLICATION_ERROR_CODES.DOMAIN_OPERATION_FAILED, 'Falha ao remover item do orçamento', {
        domainError: result.error,
      });
    }
    nextDocument = result.document;
  }

  await deps.quoteRepository.save(nextDocument);
  return applicationSuccess(nextDocument);
}

async function resolveQuoteItemSnapshot(
  deps: UpdateQuoteUseCaseDeps,
  quote: CommercialDocument,
  input: UpdateQuoteUseCaseInput,
  item: AddItemInput
): Promise<{ ok: true; item: AddItemInput } | ApplicationFailureResult> {
  if (!item.productId) return { ok: true, item };
  const resolution = await resolvePriceForQuoteItem(deps, quote, input, item.productId);
  if (!resolution.ok) return resolution;
  return {
    ok: true,
    item: {
      ...item,
      representedCompanyId: quote.representedCompanyId,
      unitPrice: resolution.data.unitPrice,
      priceSource: resolution.data.source,
      priceSourceId: resolution.data.sourceId,
      priceTableId: resolution.data.priceTableId,
      priceResolvedAt: normalizePricedAt(input.pricedAt),
    },
  };
}

async function resolveQuoteItemPatchSnapshot(
  deps: UpdateQuoteUseCaseDeps,
  quote: CommercialDocument,
  input: UpdateQuoteUseCaseInput,
  currentItem: CommercialDocument['items'][number] | undefined,
  patch: UpdateItemInput
): Promise<{ ok: true; patch: UpdateItemInput } | ApplicationFailureResult> {
  const productId = patch.productId ?? currentItem?.productId;
  if (!patch.productId || !productId) return { ok: true, patch };
  const resolution = await resolvePriceForQuoteItem(deps, quote, input, productId);
  if (!resolution.ok) return resolution;
  return {
    ok: true,
    patch: {
      ...patch,
      representedCompanyId: quote.representedCompanyId,
      unitPrice: resolution.data.unitPrice,
      priceSource: resolution.data.source,
      priceSourceId: resolution.data.sourceId,
      priceTableId: resolution.data.priceTableId,
      priceResolvedAt: normalizePricedAt(input.pricedAt),
    },
  };
}

async function resolvePriceForQuoteItem(
  deps: UpdateQuoteUseCaseDeps,
  quote: CommercialDocument,
  input: UpdateQuoteUseCaseInput,
  productId: string
): Promise<ApplicationResult<import('./priceResolution.js').ResolvedPriceResponse>> {
  if (!input.actor) return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Ator é obrigatório para resolver preço do item', { field: 'actor' });
  if (!quote.customerId) return applicationFailure(APPLICATION_ERROR_CODES.REQUIRED_CUSTOMER_ID, 'Cliente é obrigatório para resolver preço do item');
  if (!quote.representedCompanyId) return applicationFailure(APPLICATION_ERROR_CODES.REQUIRED_REPRESENTED_COMPANY, 'Representada é obrigatória para resolver preço do item');
  if (!deps.representedCompanyRepository || !deps.productRepository || !deps.customerProductPriceOverrideRepository || !deps.customerRepresentedCommercialProfileRepository || !deps.priceTableRepository || !deps.priceTableItemRepository) {
    return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Dependências de resolução de preço indisponíveis', { field: 'price_resolution' });
  }
  return resolvePriceUseCase(
    {
      customerRepository: deps.customerRepository,
      representedCompanyRepository: deps.representedCompanyRepository,
      productRepository: deps.productRepository,
      customerProductPriceOverrideRepository: deps.customerProductPriceOverrideRepository,
      customerRepresentedCommercialProfileRepository: deps.customerRepresentedCommercialProfileRepository,
      priceTableRepository: deps.priceTableRepository,
      priceTableItemRepository: deps.priceTableItemRepository,
    },
    {
      actor: input.actor,
      customerId: quote.customerId,
      representedCompanyId: quote.representedCompanyId,
      productId,
      onDate: input.pricedAt ?? new Date().toISOString().slice(0, 10),
    }
  );
}

function normalizePricedAt(pricedAt: string | undefined): string {
  return pricedAt ?? new Date().toISOString().slice(0, 10);
}
