import type {
  PriceTableCreateInput,
  PriceTableListInput,
  PriceTableListResult,
  PriceTableRecord,
  PriceTableRepository,
  PriceTableStatus,
  PriceTableUpdateInput,
  PriceTableVisibilityScope,
} from '../../application/ports/priceTableRepository.js';

export interface InMemoryPriceTableRecord {
  id: string;
  tenantId: string;
  representedCompanyId?: string;
  name: string;
  currency?: string;
  validFrom: string;
  validUntil?: string;
  status?: PriceTableStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export class InMemoryPriceTableRepository implements PriceTableRepository {
  private readonly items = new Map<string, PriceTableRecord>();

  constructor(priceTables: InMemoryPriceTableRecord[] = []) {
    for (const priceTable of priceTables) this.save(priceTable);
  }

  save(priceTable: InMemoryPriceTableRecord): void {
    const now = new Date();
    this.items.set(key(priceTable.tenantId, priceTable.id), {
      ...priceTable,
      currency: priceTable.currency ?? 'BRL',
      status: priceTable.status ?? 'active',
      createdAt: priceTable.createdAt ? new Date(priceTable.createdAt) : now,
      updatedAt: priceTable.updatedAt ? new Date(priceTable.updatedAt) : now,
    });
  }

  async list(input: PriceTableListInput): Promise<PriceTableListResult> {
    const visible = [...this.items.values()]
      .filter((priceTable) => isVisible(priceTable, input))
      .filter((priceTable) => !input.q || priceTable.name.toLowerCase().includes(input.q.toLowerCase()))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const start = (input.page - 1) * input.pageSize;
    return { items: visible.slice(start, start + input.pageSize).map(clonePriceTable), page: input.page, pageSize: input.pageSize, total: visible.length };
  }

  async getById(input: PriceTableVisibilityScope & { priceTableId: string }): Promise<PriceTableRecord | null> {
    const priceTable = this.items.get(key(input.tenantId, input.priceTableId));
    return priceTable && isVisible(priceTable, input) ? clonePriceTable(priceTable) : null;
  }

  async create(input: PriceTableCreateInput): Promise<PriceTableRecord> {
    if (this.hasDuplicateName(input.tenantId, input.name, input.representedCompanyId)) throw uniqueViolation();
    const now = input.now ?? new Date();
    const priceTable: PriceTableRecord = { ...input, createdAt: now, updatedAt: now };
    this.items.set(key(priceTable.tenantId, priceTable.id), clonePriceTable(priceTable));
    return clonePriceTable(priceTable);
  }

  async update(input: PriceTableUpdateInput): Promise<PriceTableRecord | null> {
    const current = this.items.get(key(input.tenantId, input.priceTableId));
    if (!current || !isVisible(current, input)) return null;
    const next = { ...current, ...input.patch, updatedAt: input.now ?? new Date() };
    if (next.validUntil !== undefined && next.validUntil < next.validFrom) throw checkViolation();
    if (this.hasDuplicateName(next.tenantId, next.name, next.representedCompanyId, current.id)) throw uniqueViolation();
    this.items.set(key(next.tenantId, next.id), clonePriceTable(next));
    return clonePriceTable(next);
  }

  private hasDuplicateName(tenantId: string, name: string, representedCompanyId?: string, ignoreId?: string): boolean {
    return [...this.items.values()].some((priceTable) => priceTable.tenantId === tenantId
      && priceTable.id !== ignoreId
      && priceTable.name === name
      && priceTable.representedCompanyId === representedCompanyId);
  }
}

function key(tenantId: string, priceTableId: string): string {
  return `${tenantId}:${priceTableId}`;
}

function isVisible(priceTable: PriceTableRecord, scope: PriceTableVisibilityScope): boolean {
  return priceTable.tenantId === scope.tenantId;
}

function clonePriceTable(priceTable: PriceTableRecord): PriceTableRecord {
  return { ...priceTable, createdAt: new Date(priceTable.createdAt), updatedAt: new Date(priceTable.updatedAt) };
}

function uniqueViolation(): Error & { code?: string } {
  const error = new Error('duplicate price table') as Error & { code?: string };
  error.code = '23505';
  return error;
}

function checkViolation(): Error & { code?: string } {
  const error = new Error('invalid price table') as Error & { code?: string };
  error.code = '23514';
  return error;
}
