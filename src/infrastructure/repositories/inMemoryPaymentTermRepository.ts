import type {
  PaymentTermCreateInput,
  PaymentTermListInput,
  PaymentTermListResult,
  PaymentTermRecord,
  PaymentTermRepository,
  PaymentTermStatus,
  PaymentTermUpdateInput,
  PaymentTermVisibilityScope,
} from '../../application/ports/paymentTermRepository.js';

export interface InMemoryPaymentTermRecord {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  installmentsCount: number;
  firstDueDays: number;
  intervalDays: number;
  status?: PaymentTermStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export class InMemoryPaymentTermRepository implements PaymentTermRepository {
  private readonly items = new Map<string, PaymentTermRecord>();

  constructor(paymentTerms: InMemoryPaymentTermRecord[] = []) {
    for (const paymentTerm of paymentTerms) this.save(paymentTerm);
  }

  save(paymentTerm: InMemoryPaymentTermRecord): void {
    const now = new Date();
    this.items.set(key(paymentTerm.tenantId, paymentTerm.id), {
      ...paymentTerm,
      status: paymentTerm.status ?? 'active',
      createdAt: paymentTerm.createdAt ? new Date(paymentTerm.createdAt) : now,
      updatedAt: paymentTerm.updatedAt ? new Date(paymentTerm.updatedAt) : now,
    });
  }

  async list(input: PaymentTermListInput): Promise<PaymentTermListResult> {
    const visible = [...this.items.values()]
      .filter((paymentTerm) => isVisible(paymentTerm, input))
      .filter((paymentTerm) => !input.q || paymentTerm.name.toLowerCase().includes(input.q.toLowerCase()))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const start = (input.page - 1) * input.pageSize;
    return { items: visible.slice(start, start + input.pageSize).map(clonePaymentTerm), page: input.page, pageSize: input.pageSize, total: visible.length };
  }

  async getById(input: PaymentTermVisibilityScope & { paymentTermId: string }): Promise<PaymentTermRecord | null> {
    const paymentTerm = this.items.get(key(input.tenantId, input.paymentTermId));
    return paymentTerm && isVisible(paymentTerm, input) ? clonePaymentTerm(paymentTerm) : null;
  }

  async create(input: PaymentTermCreateInput): Promise<PaymentTermRecord> {
    if (this.hasDuplicateName(input.tenantId, input.name)) throw uniqueViolation();
    validatePaymentTerm(input);
    const now = input.now ?? new Date();
    const paymentTerm: PaymentTermRecord = { ...input, createdAt: now, updatedAt: now };
    this.items.set(key(paymentTerm.tenantId, paymentTerm.id), clonePaymentTerm(paymentTerm));
    return clonePaymentTerm(paymentTerm);
  }

  async update(input: PaymentTermUpdateInput): Promise<PaymentTermRecord | null> {
    const current = this.items.get(key(input.tenantId, input.paymentTermId));
    if (!current || !isVisible(current, input)) return null;
    const next = { ...current, ...input.patch, updatedAt: input.now ?? new Date() };
    validatePaymentTerm(next);
    if (this.hasDuplicateName(next.tenantId, next.name, current.id)) throw uniqueViolation();
    this.items.set(key(next.tenantId, next.id), clonePaymentTerm(next));
    return clonePaymentTerm(next);
  }

  private hasDuplicateName(tenantId: string, name: string, ignoreId?: string): boolean {
    return [...this.items.values()].some((paymentTerm) => paymentTerm.tenantId === tenantId && paymentTerm.id !== ignoreId && paymentTerm.name === name);
  }
}

function key(tenantId: string, paymentTermId: string): string {
  return `${tenantId}:${paymentTermId}`;
}

function isVisible(paymentTerm: PaymentTermRecord, scope: PaymentTermVisibilityScope): boolean {
  return paymentTerm.tenantId === scope.tenantId;
}

function validatePaymentTerm(paymentTerm: Pick<PaymentTermRecord, 'installmentsCount' | 'firstDueDays' | 'intervalDays' | 'status'>): void {
  if (!Number.isInteger(paymentTerm.installmentsCount) || paymentTerm.installmentsCount < 1) throw checkViolation();
  if (!Number.isInteger(paymentTerm.firstDueDays) || paymentTerm.firstDueDays < 0) throw checkViolation();
  if (!Number.isInteger(paymentTerm.intervalDays) || paymentTerm.intervalDays < 0) throw checkViolation();
  if (paymentTerm.status !== 'active' && paymentTerm.status !== 'inactive') throw checkViolation();
}

function clonePaymentTerm(paymentTerm: PaymentTermRecord): PaymentTermRecord {
  return { ...paymentTerm, createdAt: new Date(paymentTerm.createdAt), updatedAt: new Date(paymentTerm.updatedAt) };
}

function uniqueViolation(): Error & { code?: string } {
  const error = new Error('duplicate payment term') as Error & { code?: string };
  error.code = '23505';
  return error;
}

function checkViolation(): Error & { code?: string } {
  const error = new Error('invalid payment term') as Error & { code?: string };
  error.code = '23514';
  return error;
}
