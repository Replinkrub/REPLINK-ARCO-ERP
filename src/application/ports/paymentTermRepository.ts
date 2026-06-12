export type PaymentTermStatus = 'active' | 'inactive';

export interface PaymentTermRecord {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  installmentsCount: number;
  firstDueDays: number;
  intervalDays: number;
  status: PaymentTermStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentTermVisibilityScope {
  tenantId: string;
  actorId: string;
  role: 'ADMIN' | 'REPRESENTANTE';
}

export interface PaymentTermListInput extends PaymentTermVisibilityScope {
  page: number;
  pageSize: number;
  q?: string;
}

export interface PaymentTermListResult {
  items: PaymentTermRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PaymentTermCreateInput {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  installmentsCount: number;
  firstDueDays: number;
  intervalDays: number;
  status: PaymentTermStatus;
  now?: Date;
}

export interface PaymentTermUpdateInput extends PaymentTermVisibilityScope {
  paymentTermId: string;
  patch: Partial<Omit<PaymentTermRecord, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>;
  now?: Date;
}

export interface PaymentTermRepository {
  list(input: PaymentTermListInput): Promise<PaymentTermListResult>;
  getById(input: PaymentTermVisibilityScope & { paymentTermId: string }): Promise<PaymentTermRecord | null>;
  create(input: PaymentTermCreateInput): Promise<PaymentTermRecord>;
  update(input: PaymentTermUpdateInput): Promise<PaymentTermRecord | null>;
}
