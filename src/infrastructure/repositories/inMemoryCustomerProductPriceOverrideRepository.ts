import type {
  CustomerProductPriceOverrideActiveInput,
  CustomerProductPriceOverrideCreateInput,
  CustomerProductPriceOverrideListInput,
  CustomerProductPriceOverrideListResult,
  CustomerProductPriceOverrideRecord,
  CustomerProductPriceOverrideRepository,
  CustomerProductPriceOverrideStatus,
  CustomerProductPriceOverrideUpdateInput,
  CustomerProductPriceOverrideVisibilityScope,
} from '../../application/ports/customerProductPriceOverrideRepository.js';

export interface InMemoryCustomerProductPriceOverrideRecord {
  id: string;
  tenantId: string;
  customerId: string;
  representedCompanyId: string;
  productId: string;
  unitPrice: number;
  validFrom: string;
  validUntil?: string;
  status?: CustomerProductPriceOverrideStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export class InMemoryCustomerProductPriceOverrideRepository implements CustomerProductPriceOverrideRepository {
  private readonly overrides = new Map<string, CustomerProductPriceOverrideRecord>();

  constructor(overrides: InMemoryCustomerProductPriceOverrideRecord[] = []) {
    for (const override of overrides) this.save(override);
  }

  save(override: InMemoryCustomerProductPriceOverrideRecord): void {
    const now = new Date();
    this.overrides.set(key(override.tenantId, override.customerId, override.representedCompanyId, override.id), {
      ...override,
      status: override.status ?? 'active',
      createdAt: override.createdAt ? new Date(override.createdAt) : now,
      updatedAt: override.updatedAt ? new Date(override.updatedAt) : now,
    });
  }

  async list(input: CustomerProductPriceOverrideListInput): Promise<CustomerProductPriceOverrideListResult> {
    const visible = [...this.overrides.values()]
      .filter((override) => isVisible(override, input)
        && override.customerId === input.customerId
        && override.representedCompanyId === input.representedCompanyId
        && (input.productId === undefined || override.productId === input.productId))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const start = (input.page - 1) * input.pageSize;
    return { items: visible.slice(start, start + input.pageSize).map(cloneOverride), page: input.page, pageSize: input.pageSize, total: visible.length };
  }

  async getById(input: CustomerProductPriceOverrideVisibilityScope & { customerId: string; representedCompanyId: string; overrideId: string }): Promise<CustomerProductPriceOverrideRecord | null> {
    const override = this.overrides.get(key(input.tenantId, input.customerId, input.representedCompanyId, input.overrideId));
    return override && isVisible(override, input) ? cloneOverride(override) : null;
  }

  async create(input: CustomerProductPriceOverrideCreateInput): Promise<CustomerProductPriceOverrideRecord> {
    const now = input.now ?? new Date();
    const override: CustomerProductPriceOverrideRecord = { ...input, createdAt: now, updatedAt: now };
    this.overrides.set(key(override.tenantId, override.customerId, override.representedCompanyId, override.id), cloneOverride(override));
    return cloneOverride(override);
  }

  async update(input: CustomerProductPriceOverrideUpdateInput): Promise<CustomerProductPriceOverrideRecord | null> {
    const current = this.overrides.get(key(input.tenantId, input.customerId, input.representedCompanyId, input.overrideId));
    if (!current || !isVisible(current, input)) return null;
    const next = { ...current, ...input.patch, updatedAt: input.now ?? new Date() };
    this.overrides.set(key(next.tenantId, next.customerId, next.representedCompanyId, next.id), cloneOverride(next));
    return cloneOverride(next);
  }

  async findActive(input: CustomerProductPriceOverrideActiveInput): Promise<CustomerProductPriceOverrideRecord | null> {
    const override = [...this.overrides.values()]
      .filter((candidate) => candidate.tenantId === input.tenantId
        && candidate.customerId === input.customerId
        && candidate.representedCompanyId === input.representedCompanyId
        && candidate.productId === input.productId
        && candidate.status === 'active'
        && candidate.id !== input.ignoreOverrideId
        && candidate.validFrom <= input.onDate
        && (candidate.validUntil === undefined || candidate.validUntil >= input.onDate))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    return override ? cloneOverride(override) : null;
  }

  async hasActiveForScope(input: Omit<CustomerProductPriceOverrideActiveInput, 'onDate'>): Promise<boolean> {
    return [...this.overrides.values()].some((candidate) => candidate.tenantId === input.tenantId
      && candidate.customerId === input.customerId
      && candidate.representedCompanyId === input.representedCompanyId
      && candidate.productId === input.productId
      && candidate.status === 'active'
      && candidate.id !== input.ignoreOverrideId);
  }
}

function key(tenantId: string, customerId: string, representedCompanyId: string, overrideId: string): string {
  return `${tenantId}:${customerId}:${representedCompanyId}:${overrideId}`;
}

function isVisible(override: CustomerProductPriceOverrideRecord, scope: CustomerProductPriceOverrideVisibilityScope): boolean {
  return override.tenantId === scope.tenantId;
}

function cloneOverride(override: CustomerProductPriceOverrideRecord): CustomerProductPriceOverrideRecord {
  return { ...override, createdAt: new Date(override.createdAt), updatedAt: new Date(override.updatedAt) };
}
