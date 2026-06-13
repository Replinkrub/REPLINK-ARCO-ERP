import type {
  PriceTableItemCreateInput,
  PriceTableItemListInput,
  PriceTableItemListResult,
  PriceTableItemOverlapInput,
  PriceTableItemRecord,
  PriceTableItemRepository,
  PriceTableItemStatus,
  PriceTableItemUpdateInput,
  PriceTableItemVisibilityScope,
} from '../../application/ports/priceTableItemRepository.js';

export interface InMemoryPriceTableItemRecord {
  id: string;
  tenantId: string;
  priceTableId: string;
  productId: string;
  unitPrice: number;
  validFrom: string;
  validUntil?: string;
  status?: PriceTableItemStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export class InMemoryPriceTableItemRepository implements PriceTableItemRepository {
  private readonly items = new Map<string, PriceTableItemRecord>();

  constructor(items: InMemoryPriceTableItemRecord[] = []) {
    for (const item of items) this.save(item);
  }

  save(item: InMemoryPriceTableItemRecord): void {
    const now = new Date();
    this.items.set(key(item.tenantId, item.priceTableId, item.id), {
      ...item,
      status: item.status ?? 'active',
      createdAt: item.createdAt ? new Date(item.createdAt) : now,
      updatedAt: item.updatedAt ? new Date(item.updatedAt) : now,
    });
  }

  async listByPriceTable(input: PriceTableItemListInput): Promise<PriceTableItemListResult> {
    const visible = [...this.items.values()]
      .filter((item) => isVisible(item, input) && item.priceTableId === input.priceTableId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const start = (input.page - 1) * input.pageSize;
    return { items: visible.slice(start, start + input.pageSize).map(clonePriceTableItem), page: input.page, pageSize: input.pageSize, total: visible.length };
  }

  async getById(input: PriceTableItemVisibilityScope & { priceTableId: string; itemId: string }): Promise<PriceTableItemRecord | null> {
    const item = this.items.get(key(input.tenantId, input.priceTableId, input.itemId));
    return item && isVisible(item, input) ? clonePriceTableItem(item) : null;
  }

  async findActiveByPriceTableAndProduct(input: PriceTableItemVisibilityScope & { priceTableId: string; productId: string; onDate: string }): Promise<PriceTableItemRecord | null> {
    const item = [...this.items.values()]
      .filter((candidate) => isVisible(candidate, input)
        && candidate.priceTableId === input.priceTableId
        && candidate.productId === input.productId
        && candidate.status === 'active'
        && candidate.validFrom <= input.onDate
        && (candidate.validUntil === undefined || candidate.validUntil >= input.onDate))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    return item ? clonePriceTableItem(item) : null;
  }

  async create(input: PriceTableItemCreateInput): Promise<PriceTableItemRecord> {
    const now = input.now ?? new Date();
    const item: PriceTableItemRecord = { ...input, createdAt: now, updatedAt: now };
    this.items.set(key(item.tenantId, item.priceTableId, item.id), clonePriceTableItem(item));
    return clonePriceTableItem(item);
  }

  async update(input: PriceTableItemUpdateInput): Promise<PriceTableItemRecord | null> {
    const current = this.items.get(key(input.tenantId, input.priceTableId, input.itemId));
    if (!current || !isVisible(current, input)) return null;
    const next = { ...current, ...input.patch, updatedAt: input.now ?? new Date() };
    this.items.set(key(next.tenantId, next.priceTableId, next.id), clonePriceTableItem(next));
    return clonePriceTableItem(next);
  }

  async hasActiveOverlap(input: PriceTableItemOverlapInput): Promise<boolean> {
    return [...this.items.values()].some((item) => item.tenantId === input.tenantId
      && item.priceTableId === input.priceTableId
      && item.productId === input.productId
      && item.status === 'active'
      && item.id !== input.ignoreItemId
      && periodsOverlap(input.validFrom, input.validUntil, item.validFrom, item.validUntil));
  }
}

function key(tenantId: string, priceTableId: string, itemId: string): string {
  return `${tenantId}:${priceTableId}:${itemId}`;
}

function isVisible(item: PriceTableItemRecord, scope: PriceTableItemVisibilityScope): boolean {
  return item.tenantId === scope.tenantId;
}

function clonePriceTableItem(item: PriceTableItemRecord): PriceTableItemRecord {
  return { ...item, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt) };
}

function periodsOverlap(aFrom: string, aUntil: string | undefined, bFrom: string, bUntil: string | undefined): boolean {
  const aEnd = aUntil ?? '9999-12-31';
  const bEnd = bUntil ?? '9999-12-31';
  return aFrom <= bEnd && bFrom <= aEnd;
}
