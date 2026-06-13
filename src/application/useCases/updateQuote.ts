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
import type { PaymentTermRepository } from '../ports/paymentTermRepository.js';
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
  paymentTermId?: string | null;
  paymentScheduledAt?: string;
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
  paymentTermRepository?: PaymentTermRepository;
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

  if (input.paymentTermId !== undefined) {
    const paymentSnapshot = await resolvePaymentTermSnapshot(deps, nextDocument, input);
    if (!paymentSnapshot.ok) return paymentSnapshot;
    nextDocument = { ...nextDocument, ...paymentSnapshot.patch, updatedAt: new Date() };
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

async function resolvePaymentTermSnapshot(
  deps: UpdateQuoteUseCaseDeps,
  quote: CommercialDocument,
  input: UpdateQuoteUseCaseInput
): Promise<{ ok: true; patch: Pick<CommercialDocument, 'paymentTermId' | 'paymentTermSnapshot' | 'paymentSchedule'> } | ApplicationFailureResult> {
  if (input.paymentTermId === null) {
    return { ok: true, patch: { paymentTermId: undefined, paymentTermSnapshot: undefined, paymentSchedule: undefined } };
  }

  const paymentTermId = input.paymentTermId?.trim();
  if (!paymentTermId) return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'paymentTermId deve ser informado', { field: 'paymentTermId' });
  if (!input.actor) return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Ator é obrigatório para resolver condição de pagamento', { field: 'actor' });
  if (input.actor.role !== 'ADMIN' && input.actor.role !== 'REPRESENTANTE') return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Ação não permitida');
  if (!deps.paymentTermRepository) return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Dependência de condição de pagamento indisponível', { field: 'payment_term' });

  const paymentTerm = await deps.paymentTermRepository.getById({
    tenantId: quote.tenantId,
    actorId: input.actor.actorId,
    role: input.actor.role,
    paymentTermId,
  });
  if (!paymentTerm) return applicationFailure(APPLICATION_ERROR_CODES.PAYMENT_TERM_NOT_FOUND, 'Condição de pagamento não encontrada', { paymentTermId });
  if (paymentTerm.status !== 'active') return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Condição de pagamento deve estar ativa', { field: 'paymentTermId' });

  const scheduledAt = normalizePaymentScheduledAt(input.paymentScheduledAt);
  return {
    ok: true,
    patch: {
      paymentTermId,
      paymentTermSnapshot: {
        id: paymentTerm.id,
        name: paymentTerm.name,
        ...(paymentTerm.description ? { description: paymentTerm.description } : {}),
        installmentsCount: paymentTerm.installmentsCount,
        firstDueDays: paymentTerm.firstDueDays,
        intervalDays: paymentTerm.intervalDays,
        snapshottedAt: scheduledAt,
      },
      paymentSchedule: buildPaymentSchedule(quote.totals.total, paymentTerm.installmentsCount, paymentTerm.firstDueDays, paymentTerm.intervalDays, scheduledAt),
    },
  };
}

function buildPaymentSchedule(total: number, installmentsCount: number, firstDueDays: number, intervalDays: number, scheduledAt: string): CommercialDocument['paymentSchedule'] {
  const totalCents = Math.round(total * 100);
  const baseAmount = Math.floor(totalCents / installmentsCount);
  const remainder = totalCents - baseAmount * installmentsCount;
  return Array.from({ length: installmentsCount }, (_, index) => ({
    installmentNumber: index + 1,
    dueDate: addDays(scheduledAt, firstDueDays + index * intervalDays),
    amount: (baseAmount + (index < remainder ? 1 : 0)) / 100,
  }));
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizePaymentScheduledAt(paymentScheduledAt: string | undefined): string {
  return paymentScheduledAt ?? new Date().toISOString().slice(0, 10);
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
