export type CustomerProductPriceOverrideStatus = 'active' | 'inactive';

export interface CustomerProductPriceOverrideRecord {
  id: string;
  tenantId: string;
  customerId: string;
  representedCompanyId: string;
  productId: string;
  unitPrice: number;
  validFrom: string;
  validUntil?: string;
  status: CustomerProductPriceOverrideStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerProductPriceOverrideVisibilityScope {
  tenantId: string;
  actorId: string;
  role: 'ADMIN' | 'REPRESENTANTE';
}

export interface CustomerProductPriceOverrideListInput extends CustomerProductPriceOverrideVisibilityScope {
  customerId: string;
  representedCompanyId: string;
  productId?: string;
  page: number;
  pageSize: number;
}

export interface CustomerProductPriceOverrideListResult {
  items: CustomerProductPriceOverrideRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CustomerProductPriceOverrideCreateInput {
  id: string;
  tenantId: string;
  customerId: string;
  representedCompanyId: string;
  productId: string;
  unitPrice: number;
  validFrom: string;
  validUntil?: string;
  status: CustomerProductPriceOverrideStatus;
  now?: Date;
}

export interface CustomerProductPriceOverrideUpdateInput extends CustomerProductPriceOverrideVisibilityScope {
  customerId: string;
  representedCompanyId: string;
  overrideId: string;
  patch: Partial<Omit<CustomerProductPriceOverrideRecord, 'id' | 'tenantId' | 'customerId' | 'representedCompanyId' | 'createdAt' | 'updatedAt'>>;
  now?: Date;
}

export interface CustomerProductPriceOverrideActiveInput {
  tenantId: string;
  customerId: string;
  representedCompanyId: string;
  productId: string;
  onDate: string;
  ignoreOverrideId?: string;
}

export interface CustomerProductPriceOverrideRepository {
  list(input: CustomerProductPriceOverrideListInput): Promise<CustomerProductPriceOverrideListResult>;
  getById(input: CustomerProductPriceOverrideVisibilityScope & { customerId: string; representedCompanyId: string; overrideId: string }): Promise<CustomerProductPriceOverrideRecord | null>;
  create(input: CustomerProductPriceOverrideCreateInput): Promise<CustomerProductPriceOverrideRecord>;
  update(input: CustomerProductPriceOverrideUpdateInput): Promise<CustomerProductPriceOverrideRecord | null>;
  findActive(input: CustomerProductPriceOverrideActiveInput): Promise<CustomerProductPriceOverrideRecord | null>;
  hasActiveForScope(input: Omit<CustomerProductPriceOverrideActiveInput, 'onDate'>): Promise<boolean>;
}
