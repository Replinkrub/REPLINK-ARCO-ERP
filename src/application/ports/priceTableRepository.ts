export type PriceTableStatus = 'active' | 'inactive';

export interface PriceTableRecord {
  id: string;
  tenantId: string;
  representedCompanyId?: string;
  name: string;
  currency: string;
  validFrom: string;
  validUntil?: string;
  status: PriceTableStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PriceTableVisibilityScope {
  tenantId: string;
  actorId: string;
  role: 'ADMIN' | 'REPRESENTANTE';
}

export interface PriceTableListInput extends PriceTableVisibilityScope {
  page: number;
  pageSize: number;
  q?: string;
}

export interface PriceTableListResult {
  items: PriceTableRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PriceTableCreateInput {
  id: string;
  tenantId: string;
  representedCompanyId?: string;
  name: string;
  currency: string;
  validFrom: string;
  validUntil?: string;
  status: PriceTableStatus;
  now?: Date;
}

export interface PriceTableUpdateInput extends PriceTableVisibilityScope {
  priceTableId: string;
  patch: Partial<Omit<PriceTableRecord, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>;
  now?: Date;
}

export interface PriceTableRepository {
  list(input: PriceTableListInput): Promise<PriceTableListResult>;
  getById(input: PriceTableVisibilityScope & { priceTableId: string }): Promise<PriceTableRecord | null>;
  create(input: PriceTableCreateInput): Promise<PriceTableRecord>;
  update(input: PriceTableUpdateInput): Promise<PriceTableRecord | null>;
}
