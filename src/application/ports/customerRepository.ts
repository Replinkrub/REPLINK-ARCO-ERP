export type CustomerStatus = 'active' | 'inactive';

export interface CustomerRecord {
  id: string;
  tenantId: string;
  legalName: string;
  tradeName?: string;
  documentType: string;
  documentNumber: string;
  status: CustomerStatus;
  segment?: string;
  notes?: string;
  ownerId?: string;
  representativeId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerVisibilityScope {
  tenantId: string;
  actorId: string;
  role: 'ADMIN' | 'REPRESENTANTE';
}

export interface CustomerListInput extends CustomerVisibilityScope {
  page: number;
  pageSize: number;
  q?: string;
}

export interface CustomerListResult {
  items: CustomerRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CustomerCreateInput {
  id: string;
  tenantId: string;
  legalName: string;
  tradeName?: string;
  documentType: string;
  documentNumber: string;
  status: CustomerStatus;
  segment?: string;
  notes?: string;
  ownerId?: string;
  representativeId?: string;
  now?: Date;
}

export interface CustomerUpdateInput extends CustomerVisibilityScope {
  customerId: string;
  patch: Partial<Pick<CustomerRecord, 'legalName' | 'tradeName' | 'documentType' | 'documentNumber' | 'status' | 'segment' | 'notes'>>;
  now?: Date;
}

export interface CustomerRepository {
  findStatusByTenantAndId(input: { tenantId: string; customerId: string }): Promise<CustomerStatus | null>;
  list(input: CustomerListInput): Promise<CustomerListResult>;
  getById(input: CustomerVisibilityScope & { customerId: string }): Promise<CustomerRecord | null>;
  create(input: CustomerCreateInput): Promise<CustomerRecord>;
  update(input: CustomerUpdateInput): Promise<CustomerRecord | null>;
}
