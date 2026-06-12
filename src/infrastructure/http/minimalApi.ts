import { APPLICATION_ERROR_CODES } from '../../application/errors.js';
import type { ApplicationResult } from '../../application/result.js';
import { createCustomerAddressUseCase, listCustomerAddressesUseCase, updateCustomerAddressUseCase } from '../../application/useCases/customerAddresses.js';
import { getCustomerCommercialProfileUseCase, updateCustomerCommercialProfileUseCase } from '../../application/useCases/customerCommercialProfiles.js';
import { getCustomerRepresentedCommercialProfileUseCase, updateCustomerRepresentedCommercialProfileUseCase } from '../../application/useCases/customerRepresentedCommercialProfiles.js';
import { createCustomerContactUseCase, listCustomerContactsUseCase, updateCustomerContactUseCase } from '../../application/useCases/customerContacts.js';
import { createCustomerUseCase, getCustomerUseCase, listCustomersUseCase, updateCustomerUseCase } from '../../application/useCases/customers.js';
import { createPriceTableUseCase, getPriceTableUseCase, listPriceTablesUseCase, updatePriceTableUseCase } from '../../application/useCases/priceTables.js';
import { createPriceTableItemUseCase, getPriceTableItemUseCase, listPriceTableItemsUseCase, updatePriceTableItemUseCase } from '../../application/useCases/priceTableItems.js';
import { createPaymentTermUseCase, getPaymentTermUseCase, listPaymentTermsUseCase, updatePaymentTermUseCase } from '../../application/useCases/paymentTerms.js';
import { createProductUseCase, getProductUseCase, listProductsUseCase, updateProductUseCase } from '../../application/useCases/products.js';
import { adjustOrderUseCase, cancelOrderUseCase } from '../../application/useCases/closeOrder.js';
import { confirmQuoteUseCase } from '../../application/useCases/confirmQuote.js';
import { createQuoteUseCase } from '../../application/useCases/createQuote.js';
import { registerDocumentCommunicationUseCase } from '../../application/useCases/registerDocumentCommunication.js';
import { registerSimpleInvoiceUseCase } from '../../application/useCases/registerSimpleInvoice.js';
import { updateQuote } from '../../application/useCases/updateQuote.js';
import type { CustomerRepository } from '../../application/ports/customerRepository.js';
import type { CustomerCommercialProfileRepository } from '../../application/ports/customerCommercialProfileRepository.js';
import type { CustomerRepresentedCommercialProfileRepository } from '../../application/ports/customerRepresentedCommercialProfileRepository.js';
import type { CustomerContactRepository } from '../../application/ports/customerContactRepository.js';
import type { CustomerAddressRepository } from '../../application/ports/customerAddressRepository.js';
import type { ProductRepository } from '../../application/ports/productRepository.js';
import type { PriceTableRepository } from '../../application/ports/priceTableRepository.js';
import type { PriceTableItemRepository } from '../../application/ports/priceTableItemRepository.js';
import type { PaymentTermRepository } from '../../application/ports/paymentTermRepository.js';
import type { RepresentedCompanyRepository } from '../../application/ports/representedCompanyRepository.js';
import type { OrderRepository } from '../../application/ports/orderRepository.js';
import type { QuoteRepository } from '../../application/ports/quoteRepository.js';
import type { AccessContext } from '../../domain/ownership.js';
import type { CommercialDocument } from '../../domain/commercialDocument.js';
import { getRequiresRepresentedCompany, requireEnvironmentTenantId } from '../config/runtimeConfig.js';

interface ApiDeps {
  quoteRepository: QuoteRepository;
  orderRepository: OrderRepository;
  customerRepository: CustomerRepository;
  customerCommercialProfileRepository?: CustomerCommercialProfileRepository;
  customerRepresentedCommercialProfileRepository?: CustomerRepresentedCommercialProfileRepository;
  customerContactRepository?: CustomerContactRepository;
  customerAddressRepository?: CustomerAddressRepository;
  productRepository?: ProductRepository;
  priceTableRepository?: PriceTableRepository;
  priceTableItemRepository?: PriceTableItemRepository;
  paymentTermRepository?: PaymentTermRepository;
  representedCompanyRepository?: RepresentedCompanyRepository;
}

export function createMinimalHttpApi(deps: ApiDeps) {
  const environmentTenantId = requireEnvironmentTenantId();
  const requiresRepresentedCompany = getRequiresRepresentedCompany();

  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const actorResult = buildActorFromHeaders(request.headers, environmentTenantId);
      if (!actorResult.ok) {
        return actorResult.status === 403
          ? json({ code: 'TENANT_MISMATCH', message: 'Tenant header does not match environment tenant' }, 403)
          : json({ code: 'UNAUTHORIZED', message: 'Missing actor headers' }, 401);
      }
      const actor = actorResult.actor;

      const method = request.method.toUpperCase();

      if (method === 'GET' && url.pathname.match(/^\/v1\/customers\/[^/]+\/represented-commercial-profiles\/[^/]+$/)) {
        const representedCompanyRepository = deps.representedCompanyRepository;
        const customerRepresentedCommercialProfileRepository = deps.customerRepresentedCommercialProfileRepository;
        if (!representedCompanyRepository || !customerRepresentedCommercialProfileRepository) return dependencyUnavailable('Customer represented commercial profile dependencies unavailable');
        const [, , , customerId, , representedCompanyId] = url.pathname.split('/');
        const result = await getCustomerRepresentedCommercialProfileUseCase(
          { customerRepository: deps.customerRepository, representedCompanyRepository, customerRepresentedCommercialProfileRepository },
          { actor, customerId: customerId ?? '', representedCompanyId: representedCompanyId ?? '' }
        );
        return mapResult(result, 200);
      }

      if (method === 'PATCH' && url.pathname.match(/^\/v1\/customers\/[^/]+\/represented-commercial-profiles\/[^/]+$/)) {
        const representedCompanyRepository = deps.representedCompanyRepository;
        const customerRepresentedCommercialProfileRepository = deps.customerRepresentedCommercialProfileRepository;
        const priceTableRepository = deps.priceTableRepository;
        const paymentTermRepository = deps.paymentTermRepository;
        if (!representedCompanyRepository || !customerRepresentedCommercialProfileRepository || !priceTableRepository || !paymentTermRepository) return dependencyUnavailable('Customer represented commercial profile dependencies unavailable');
        const [, , , customerId, , representedCompanyId] = url.pathname.split('/');
        const body = await request.json() as Record<string, unknown>;
        const result = await updateCustomerRepresentedCommercialProfileUseCase(
          { customerRepository: deps.customerRepository, representedCompanyRepository, customerRepresentedCommercialProfileRepository, priceTableRepository, paymentTermRepository },
          { actor, customerId: customerId ?? '', representedCompanyId: representedCompanyId ?? '', payload: body }
        );
        return mapResult(result, 200);
      }

      if (method === 'GET' && url.pathname === '/v1/payment-terms') {
        const paymentTermRepository = deps.paymentTermRepository;
        if (!paymentTermRepository) return dependencyUnavailable('Payment term repository dependency unavailable');
        const result = await listPaymentTermsUseCase(
          { paymentTermRepository },
          {
            actor,
            page: Number(url.searchParams.get('page') ?? 1),
            pageSize: Number(url.searchParams.get('page_size') ?? 20),
            q: url.searchParams.get('q') ?? undefined,
          }
        );
        return mapResult(result, 200);
      }

      if (method === 'POST' && url.pathname === '/v1/payment-terms') {
        const paymentTermRepository = deps.paymentTermRepository;
        if (!paymentTermRepository) return dependencyUnavailable('Payment term repository dependency unavailable');
        const body = await request.json() as Record<string, unknown>;
        const result = await createPaymentTermUseCase(
          { paymentTermRepository },
          { actor, payload: body }
        );
        return mapResult(result, 201);
      }

      if (method === 'GET' && url.pathname.match(/^\/v1\/payment-terms\/[^/]+$/)) {
        const paymentTermRepository = deps.paymentTermRepository;
        if (!paymentTermRepository) return dependencyUnavailable('Payment term repository dependency unavailable');
        const paymentTermId = url.pathname.split('/')[3] ?? '';
        const result = await getPaymentTermUseCase(
          { paymentTermRepository },
          { actor, paymentTermId }
        );
        return mapResult(result, 200);
      }

      if (method === 'PATCH' && url.pathname.match(/^\/v1\/payment-terms\/[^/]+$/)) {
        const paymentTermRepository = deps.paymentTermRepository;
        if (!paymentTermRepository) return dependencyUnavailable('Payment term repository dependency unavailable');
        const paymentTermId = url.pathname.split('/')[3] ?? '';
        const body = await request.json() as Record<string, unknown>;
        const result = await updatePaymentTermUseCase(
          { paymentTermRepository },
          { actor, paymentTermId, payload: body }
        );
        return mapResult(result, 200);
      }

      if (method === 'GET' && url.pathname.match(/^\/v1\/customers\/[^/]+\/commercial-profile$/)) {
        const customerCommercialProfileRepository = deps.customerCommercialProfileRepository;
        if (!customerCommercialProfileRepository) return dependencyUnavailable('Customer commercial profile repository dependency unavailable');
        const customerId = url.pathname.split('/')[3] ?? '';
        const result = await getCustomerCommercialProfileUseCase(
          { customerRepository: deps.customerRepository, customerCommercialProfileRepository },
          { actor, customerId }
        );
        return mapResult(result, 200);
      }

      if (method === 'PATCH' && url.pathname.match(/^\/v1\/customers\/[^/]+\/commercial-profile$/)) {
        const customerCommercialProfileRepository = deps.customerCommercialProfileRepository;
        const priceTableRepository = deps.priceTableRepository;
        const paymentTermRepository = deps.paymentTermRepository;
        if (!customerCommercialProfileRepository || !priceTableRepository || !paymentTermRepository) return dependencyUnavailable('Customer commercial profile dependencies unavailable');
        const customerId = url.pathname.split('/')[3] ?? '';
        const body = await request.json() as Record<string, unknown>;
        const result = await updateCustomerCommercialProfileUseCase(
          { customerRepository: deps.customerRepository, customerCommercialProfileRepository, priceTableRepository, paymentTermRepository },
          { actor, customerId, payload: body }
        );
        return mapResult(result, 200);
      }

      if (method === 'GET' && url.pathname.match(/^\/v1\/price-tables\/[^/]+\/items$/)) {
        const priceTableRepository = deps.priceTableRepository;
        const priceTableItemRepository = deps.priceTableItemRepository;
        if (!priceTableRepository || !priceTableItemRepository) return dependencyUnavailable('Price table item dependencies unavailable');
        const priceTableId = url.pathname.split('/')[3] ?? '';
        const result = await listPriceTableItemsUseCase(
          { priceTableRepository, priceTableItemRepository },
          {
            actor,
            priceTableId,
            page: Number(url.searchParams.get('page') ?? 1),
            pageSize: Number(url.searchParams.get('page_size') ?? 20),
          }
        );
        return mapResult(result, 200);
      }

      if (method === 'POST' && url.pathname.match(/^\/v1\/price-tables\/[^/]+\/items$/)) {
        const priceTableRepository = deps.priceTableRepository;
        const priceTableItemRepository = deps.priceTableItemRepository;
        const productRepository = deps.productRepository;
        if (!priceTableRepository || !priceTableItemRepository || !productRepository) return dependencyUnavailable('Price table item dependencies unavailable');
        const priceTableId = url.pathname.split('/')[3] ?? '';
        const body = await request.json() as Record<string, unknown>;
        const result = await createPriceTableItemUseCase(
          { priceTableRepository, priceTableItemRepository, productRepository },
          { actor, priceTableId, payload: body }
        );
        return mapResult(result, 201);
      }

      if (method === 'GET' && url.pathname.match(/^\/v1\/price-tables\/[^/]+\/items\/[^/]+$/)) {
        const priceTableRepository = deps.priceTableRepository;
        const priceTableItemRepository = deps.priceTableItemRepository;
        if (!priceTableRepository || !priceTableItemRepository) return dependencyUnavailable('Price table item dependencies unavailable');
        const [, , , priceTableId, , itemId] = url.pathname.split('/');
        const result = await getPriceTableItemUseCase(
          { priceTableRepository, priceTableItemRepository },
          { actor, priceTableId: priceTableId ?? '', itemId: itemId ?? '' }
        );
        return mapResult(result, 200);
      }

      if (method === 'PATCH' && url.pathname.match(/^\/v1\/price-tables\/[^/]+\/items\/[^/]+$/)) {
        const priceTableRepository = deps.priceTableRepository;
        const priceTableItemRepository = deps.priceTableItemRepository;
        const productRepository = deps.productRepository;
        if (!priceTableRepository || !priceTableItemRepository || !productRepository) return dependencyUnavailable('Price table item dependencies unavailable');
        const [, , , priceTableId, , itemId] = url.pathname.split('/');
        const body = await request.json() as Record<string, unknown>;
        const result = await updatePriceTableItemUseCase(
          { priceTableRepository, priceTableItemRepository, productRepository },
          { actor, priceTableId: priceTableId ?? '', itemId: itemId ?? '', payload: body }
        );
        return mapResult(result, 200);
      }

      if (method === 'GET' && url.pathname === '/v1/price-tables') {
        const priceTableRepository = deps.priceTableRepository;
        if (!priceTableRepository) return dependencyUnavailable('Price table repository dependency unavailable');
        const result = await listPriceTablesUseCase(
          { priceTableRepository },
          {
            actor,
            page: Number(url.searchParams.get('page') ?? 1),
            pageSize: Number(url.searchParams.get('page_size') ?? 20),
            q: url.searchParams.get('q') ?? undefined,
          }
        );
        return mapResult(result, 200);
      }

      if (method === 'POST' && url.pathname === '/v1/price-tables') {
        const priceTableRepository = deps.priceTableRepository;
        if (!priceTableRepository) return dependencyUnavailable('Price table repository dependency unavailable');
        const body = await request.json() as Record<string, unknown>;
        const result = await createPriceTableUseCase(
          { priceTableRepository },
          { actor, payload: body }
        );
        return mapResult(result, 201);
      }

      if (method === 'GET' && url.pathname.match(/^\/v1\/price-tables\/[^/]+$/)) {
        const priceTableRepository = deps.priceTableRepository;
        if (!priceTableRepository) return dependencyUnavailable('Price table repository dependency unavailable');
        const priceTableId = url.pathname.split('/')[3] ?? '';
        const result = await getPriceTableUseCase(
          { priceTableRepository },
          { actor, priceTableId }
        );
        return mapResult(result, 200);
      }

      if (method === 'PATCH' && url.pathname.match(/^\/v1\/price-tables\/[^/]+$/)) {
        const priceTableRepository = deps.priceTableRepository;
        if (!priceTableRepository) return dependencyUnavailable('Price table repository dependency unavailable');
        const priceTableId = url.pathname.split('/')[3] ?? '';
        const body = await request.json() as Record<string, unknown>;
        const result = await updatePriceTableUseCase(
          { priceTableRepository },
          { actor, priceTableId, payload: body }
        );
        return mapResult(result, 200);
      }

      if (method === 'GET' && url.pathname === '/v1/products') {
        const productRepository = deps.productRepository;
        if (!productRepository) return dependencyUnavailable('Product repository dependency unavailable');
        const result = await listProductsUseCase(
          { productRepository },
          {
            actor,
            page: Number(url.searchParams.get('page') ?? 1),
            pageSize: Number(url.searchParams.get('page_size') ?? 20),
            q: url.searchParams.get('q') ?? undefined,
          }
        );
        return mapResult(result, 200);
      }

      if (method === 'POST' && url.pathname === '/v1/products') {
        const productRepository = deps.productRepository;
        if (!productRepository) return dependencyUnavailable('Product repository dependency unavailable');
        const body = await request.json() as Record<string, unknown>;
        const result = await createProductUseCase(
          { productRepository },
          { actor, payload: body }
        );
        return mapResult(result, 201);
      }

      if (method === 'GET' && url.pathname.match(/^\/v1\/products\/[^/]+$/)) {
        const productRepository = deps.productRepository;
        if (!productRepository) return dependencyUnavailable('Product repository dependency unavailable');
        const productId = url.pathname.split('/')[3] ?? '';
        const result = await getProductUseCase(
          { productRepository },
          { actor, productId }
        );
        return mapResult(result, 200);
      }

      if (method === 'PATCH' && url.pathname.match(/^\/v1\/products\/[^/]+$/)) {
        const productRepository = deps.productRepository;
        if (!productRepository) return dependencyUnavailable('Product repository dependency unavailable');
        const productId = url.pathname.split('/')[3] ?? '';
        const body = await request.json() as Record<string, unknown>;
        const result = await updateProductUseCase(
          { productRepository },
          { actor, productId, payload: body }
        );
        return mapResult(result, 200);
      }

      if (method === 'GET' && url.pathname === '/v1/customers') {
        const result = await listCustomersUseCase(
          { customerRepository: deps.customerRepository },
          {
            actor,
            page: Number(url.searchParams.get('page') ?? 1),
            pageSize: Number(url.searchParams.get('page_size') ?? 20),
            q: url.searchParams.get('q') ?? undefined,
          }
        );
        return mapResult(result, 200);
      }

      if (method === 'POST' && url.pathname === '/v1/customers') {
        const body = await request.json() as Record<string, unknown>;
        const result = await createCustomerUseCase(
          { customerRepository: deps.customerRepository },
          { actor, payload: body }
        );
        return mapResult(result, 201);
      }

      if (method === 'GET' && url.pathname.match(/^\/v1\/customers\/[^/]+$/)) {
        const customerId = url.pathname.split('/')[3] ?? '';
        const result = await getCustomerUseCase(
          { customerRepository: deps.customerRepository },
          { actor, customerId }
        );
        return mapResult(result, 200);
      }

      if (method === 'PATCH' && url.pathname.match(/^\/v1\/customers\/[^/]+$/)) {
        const customerId = url.pathname.split('/')[3] ?? '';
        const body = await request.json() as Record<string, unknown>;
        const result = await updateCustomerUseCase(
          { customerRepository: deps.customerRepository },
          { actor, customerId, payload: body }
        );
        return mapResult(result, 200);
      }

      if (method === 'GET' && url.pathname.match(/^\/v1\/customers\/[^/]+\/contacts$/)) {
        const customerId = url.pathname.split('/')[3] ?? '';
        const customerContactRepository = deps.customerContactRepository;
        if (!customerContactRepository) return dependencyUnavailable('Customer contact repository dependency unavailable');
        const result = await listCustomerContactsUseCase(
          { customerRepository: deps.customerRepository, customerContactRepository },
          { actor, customerId }
        );
        return mapResult(result, 200);
      }

      if (method === 'POST' && url.pathname.match(/^\/v1\/customers\/[^/]+\/contacts$/)) {
        const customerId = url.pathname.split('/')[3] ?? '';
        const customerContactRepository = deps.customerContactRepository;
        if (!customerContactRepository) return dependencyUnavailable('Customer contact repository dependency unavailable');
        const body = await request.json() as Record<string, unknown>;
        const result = await createCustomerContactUseCase(
          { customerRepository: deps.customerRepository, customerContactRepository },
          { actor, customerId, payload: body }
        );
        return mapResult(result, 201);
      }

      if (method === 'PATCH' && url.pathname.match(/^\/v1\/customers\/[^/]+\/contacts\/[^/]+$/)) {
        const [, , , customerId, , contactId] = url.pathname.split('/');
        const customerContactRepository = deps.customerContactRepository;
        if (!customerContactRepository) return dependencyUnavailable('Customer contact repository dependency unavailable');
        const body = await request.json() as Record<string, unknown>;
        const result = await updateCustomerContactUseCase(
          { customerRepository: deps.customerRepository, customerContactRepository },
          { actor, customerId: customerId ?? '', contactId: contactId ?? '', payload: body }
        );
        return mapResult(result, 200);
      }

      if (method === 'GET' && url.pathname.match(/^\/v1\/customers\/[^/]+\/addresses$/)) {
        const customerId = url.pathname.split('/')[3] ?? '';
        const customerAddressRepository = deps.customerAddressRepository;
        if (!customerAddressRepository) return dependencyUnavailable('Customer address repository dependency unavailable');
        const result = await listCustomerAddressesUseCase(
          { customerRepository: deps.customerRepository, customerAddressRepository },
          { actor, customerId }
        );
        return mapResult(result, 200);
      }

      if (method === 'POST' && url.pathname.match(/^\/v1\/customers\/[^/]+\/addresses$/)) {
        const customerId = url.pathname.split('/')[3] ?? '';
        const customerAddressRepository = deps.customerAddressRepository;
        if (!customerAddressRepository) return dependencyUnavailable('Customer address repository dependency unavailable');
        const body = await request.json() as Record<string, unknown>;
        const result = await createCustomerAddressUseCase(
          { customerRepository: deps.customerRepository, customerAddressRepository },
          { actor, customerId, payload: body }
        );
        return mapResult(result, 201);
      }

      if (method === 'PATCH' && url.pathname.match(/^\/v1\/customers\/[^/]+\/addresses\/[^/]+$/)) {
        const [, , , customerId, , addressId] = url.pathname.split('/');
        const customerAddressRepository = deps.customerAddressRepository;
        if (!customerAddressRepository) return dependencyUnavailable('Customer address repository dependency unavailable');
        const body = await request.json() as Record<string, unknown>;
        const result = await updateCustomerAddressUseCase(
          { customerRepository: deps.customerRepository, customerAddressRepository },
          { actor, customerId: customerId ?? '', addressId: addressId ?? '', payload: body }
        );
        return mapResult(result, 200);
      }

      if (method === 'POST' && url.pathname === '/v0/quotes') {
        const body = await request.json() as Record<string, unknown>;
        const result = await createQuoteUseCase(
          { quoteRepository: deps.quoteRepository, customerRepository: deps.customerRepository },
          {
            id: String(body.id ?? ''),
            tenantId: actor.actorTenantId,
            representedCompanyId: typeof body.representedCompanyId === 'string' ? body.representedCompanyId : undefined,
            requiresRepresentedCompany,
            customerId: String(body.customerId ?? ''),
            ownerId: String(body.ownerId ?? actor.actorId),
            representativeId: String(body.representativeId ?? actor.actorId),
            numberSequence: Number(body.numberSequence ?? 1),
          }
        );
        return mapResult(result, 201);
      }

      if (method === 'PATCH' && url.pathname.startsWith('/v0/quotes/')) {
      const quoteId = url.pathname.split('/')[3] ?? '';
      const body = await request.json() as Record<string, unknown>;
      const result = await updateQuote(
        { quoteRepository: deps.quoteRepository, customerRepository: deps.customerRepository },
        {
          id: quoteId,
          customerId: body.customerId as string | undefined,
          addItems: body.addItems as never,
          updateItems: body.updateItems as never,
          removeItemIds: body.removeItemIds as string[] | undefined,
        }
      );
      return mapResult(result, 200);
    }

      if (method === 'POST' && url.pathname.match(/^\/v0\/quotes\/[^/]+\/confirm$/)) {
      const quoteId = url.pathname.split('/')[3] ?? '';
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const result = await confirmQuoteUseCase(
        { quoteRepository: deps.quoteRepository, orderRepository: deps.orderRepository },
        { quoteId, actor, orderSequence: Number(body.orderSequence ?? 1) }
      );
      return mapResult(result, 200);
    }

      if (method === 'POST' && url.pathname.match(/^\/v0\/orders\/[^/]+\/cancel$/)) {
      const orderId = url.pathname.split('/')[3] ?? '';
      const body = await request.json() as Record<string, unknown>;
      const result = await cancelOrderUseCase(
        { orderRepository: deps.orderRepository },
        { orderId, actor, reason: String(body.reason ?? ''), note: body.note as string | undefined }
      );
      return mapResult(result, 200);
    }

      if (method === 'POST' && url.pathname.match(/^\/v0\/orders\/[^/]+\/adjust$/)) {
      const orderId = url.pathname.split('/')[3] ?? '';
      const body = await request.json() as Record<string, unknown>;
      const result = await adjustOrderUseCase(
        { orderRepository: deps.orderRepository },
        { orderId, actor, reason: String(body.reason ?? ''), note: body.note as string | undefined, changes: body.changes as never }
      );
      return mapResult(result, 200);
    }

      if (method === 'POST' && url.pathname.match(/^\/v0\/orders\/[^/]+\/invoice$/)) {
      const orderId = url.pathname.split('/')[3] ?? '';
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const result = await registerSimpleInvoiceUseCase(
        { orderRepository: deps.orderRepository },
        { orderId, actor, manualReference: body.manualReference as string | undefined }
      );
      return mapResult(result, 200);
    }

      if (method === 'POST' && url.pathname === '/v0/output-events') {
      const body = await request.json() as Record<string, unknown>;
      const result = await registerDocumentCommunicationUseCase(
        { quoteRepository: deps.quoteRepository, orderRepository: deps.orderRepository },
        {
          documentType: String(body.documentType ?? ''),
          documentId: String(body.documentId ?? ''),
          actor,
          channel: String(body.channel ?? ''),
          event: String(body.event ?? ''),
        }
      );
      return mapResult(result, 201);
    }

      return json({ code: 'NOT_FOUND', message: 'Route not found' }, 404);
    } catch (error) {
      if (isDependencyUnavailableError(error)) {
        return json({ code: 'SERVICE_UNAVAILABLE', message: 'Database dependency unavailable' }, 503);
      }
      throw error;
    }
  };
}

function isDependencyUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const pgCode = (error as { code?: string }).code;
  if (pgCode === '57P01' || pgCode === '57P03') return true;
  const message = error.message.toLowerCase();
  return message.includes('connect') || message.includes('connection terminated') || message.includes('econnrefused');
}

function dependencyUnavailable(message: string): Response {
  return json({ code: 'SERVICE_UNAVAILABLE', message }, 503);
}

type ActorBuildResult =
  | { ok: true; actor: AccessContext }
  | { ok: false; status: 401 | 403 };

function buildActorFromHeaders(headers: Headers, environmentTenantId: string): ActorBuildResult {
  const role = headers.get('x-actor-role');
  const actorId = headers.get('x-actor-id');
  const headerTenantId = headers.get('x-tenant-id')?.trim();
  if (!role || !actorId) return { ok: false, status: 401 };
  if (role !== 'ADMIN' && role !== 'REPRESENTANTE') return { ok: false, status: 401 };
  if (headerTenantId && headerTenantId !== environmentTenantId) return { ok: false, status: 403 };
  return { ok: true, actor: { role, actorId, actorTenantId: environmentTenantId } };
}

function mapResult(result: ApplicationResult<CommercialDocument | unknown>, successStatus: number): Response {
  if (result.ok) {
    return json(result.data, successStatus);
  }

  const error = result.error;
  if (error.code === APPLICATION_ERROR_CODES.DOCUMENT_NOT_FOUND) return json(error, 404);
  if (error.code === APPLICATION_ERROR_CODES.CUSTOMER_NOT_FOUND) return json(error, 404);
  if (error.code === APPLICATION_ERROR_CODES.CUSTOMER_CONTACT_NOT_FOUND) return json(error, 404);
  if (error.code === APPLICATION_ERROR_CODES.CUSTOMER_ADDRESS_NOT_FOUND) return json(error, 404);
  if (error.code === APPLICATION_ERROR_CODES.PRODUCT_NOT_FOUND) return json(error, 404);
  if (error.code === APPLICATION_ERROR_CODES.PRICE_TABLE_NOT_FOUND) return json(error, 404);
  if (error.code === APPLICATION_ERROR_CODES.PRICE_TABLE_ITEM_NOT_FOUND) return json(error, 404);
  if (error.code === APPLICATION_ERROR_CODES.PAYMENT_TERM_NOT_FOUND) return json(error, 404);
  if (error.code === APPLICATION_ERROR_CODES.FORBIDDEN) return json(error, 403);
  if (error.code === APPLICATION_ERROR_CODES.CONFLICT_ALREADY_CONFIRMED) return json(error, 409);
  if (error.code === APPLICATION_ERROR_CODES.DUPLICATE_PRICE_TABLE_ITEM_PERIOD) return json(error, 409);
  if (
    error.code === APPLICATION_ERROR_CODES.VALIDATION_ERROR
    || error.code === APPLICATION_ERROR_CODES.REQUIRED_CUSTOMER_ID
    || error.code === APPLICATION_ERROR_CODES.CUSTOMER_NOT_AVAILABLE
    || error.code === APPLICATION_ERROR_CODES.DUPLICATE_CUSTOMER_DOCUMENT
    || error.code === APPLICATION_ERROR_CODES.DUPLICATE_PRODUCT_SKU
    || error.code === APPLICATION_ERROR_CODES.DUPLICATE_PRICE_TABLE
    || error.code === APPLICATION_ERROR_CODES.DUPLICATE_PAYMENT_TERM
    || error.code === APPLICATION_ERROR_CODES.REQUIRED_REPRESENTED_COMPANY
  ) {
    return json(error, 422);
  }
  return json(error, 400);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
