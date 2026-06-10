export type PriceTableItemStatus = 'active' | 'inactive';

export interface PriceTableItemRecord {
  id: string;
  tenantId: string;
  priceTableId: string;
  productId: string;
  unitPrice: number;
  validFrom: string;
  validUntil?: string;
  status: PriceTableItemStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PriceTableItemVisibilityScope {
  tenantId: string;
  actorId: string;
  role: 'ADMIN' | 'REPRESENTANTE';
}

export interface PriceTableItemListInput extends PriceTableItemVisibilityScope {
  priceTableId: string;
  page: number;
  pageSize: number;
}

export interface PriceTableItemListResult {
  items: PriceTableItemRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PriceTableItemCreateInput {
  id: string;
  tenantId: string;
  priceTableId: string;
  productId: string;
  unitPrice: number;
  validFrom: string;
  validUntil?: string;
  status: PriceTableItemStatus;
  now?: Date;
}

export interface PriceTableItemUpdateInput extends PriceTableItemVisibilityScope {
  priceTableId: string;
  itemId: string;
  patch: Partial<Omit<PriceTableItemRecord, 'id' | 'tenantId' | 'priceTableId' | 'createdAt' | 'updatedAt'>>;
  now?: Date;
}

export interface PriceTableItemOverlapInput {
  tenantId: string;
  priceTableId: string;
  productId: string;
  validFrom: string;
  validUntil?: string;
  ignoreItemId?: string;
}

export interface PriceTableItemRepository {
  listByPriceTable(input: PriceTableItemListInput): Promise<PriceTableItemListResult>;
  getById(input: PriceTableItemVisibilityScope & { priceTableId: string; itemId: string }): Promise<PriceTableItemRecord | null>;
  create(input: PriceTableItemCreateInput): Promise<PriceTableItemRecord>;
  update(input: PriceTableItemUpdateInput): Promise<PriceTableItemRecord | null>;
  hasActiveOverlap(input: PriceTableItemOverlapInput): Promise<boolean>;
}
