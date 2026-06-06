import { APPLICATION_ERROR_CODES } from '../../application/errors.js';
import type { ApplicationResult } from '../../application/result.js';
import { adjustOrderUseCase, cancelOrderUseCase } from '../../application/useCases/closeOrder.js';
import { confirmQuoteUseCase } from '../../application/useCases/confirmQuote.js';
import { createQuoteUseCase } from '../../application/useCases/createQuote.js';
import { registerDocumentCommunicationUseCase } from '../../application/useCases/registerDocumentCommunication.js';
import { registerSimpleInvoiceUseCase } from '../../application/useCases/registerSimpleInvoice.js';
import { updateQuote } from '../../application/useCases/updateQuote.js';
import type { CustomerRepository } from '../../application/ports/customerRepository.js';
import type { OrderRepository } from '../../application/ports/orderRepository.js';
import type { QuoteRepository } from '../../application/ports/quoteRepository.js';
import type { AccessContext } from '../../domain/ownership.js';
import type { CommercialDocument } from '../../domain/commercialDocument.js';
import { getRequiresRepresentedCompany, requireEnvironmentTenantId } from '../config/runtimeConfig.js';

interface ApiDeps {
  quoteRepository: QuoteRepository;
  orderRepository: OrderRepository;
  customerRepository: CustomerRepository;
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

function mapResult(result: ApplicationResult<CommercialDocument>, successStatus: number): Response {
  if (result.ok) {
    return json(result.data, successStatus);
  }

  const error = result.error;
  if (error.code === APPLICATION_ERROR_CODES.DOCUMENT_NOT_FOUND) return json(error, 404);
  if (error.code === APPLICATION_ERROR_CODES.FORBIDDEN) return json(error, 403);
  if (error.code === APPLICATION_ERROR_CODES.CONFLICT_ALREADY_CONFIRMED) return json(error, 409);
  if (
    error.code === APPLICATION_ERROR_CODES.VALIDATION_ERROR
    || error.code === APPLICATION_ERROR_CODES.REQUIRED_CUSTOMER_ID
    || error.code === APPLICATION_ERROR_CODES.CUSTOMER_NOT_AVAILABLE
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
