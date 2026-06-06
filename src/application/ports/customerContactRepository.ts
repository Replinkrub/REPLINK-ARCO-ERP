export type CustomerContactStatus = 'active' | 'inactive';

export interface CustomerContactRecord {
  id: string;
  tenantId: string;
  customerId: string;
  name: string;
  roleTitle?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  isPrimary: boolean;
  status: CustomerContactStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerContactCreateInput {
  id: string;
  tenantId: string;
  customerId: string;
  name: string;
  roleTitle?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  isPrimary: boolean;
  status: CustomerContactStatus;
  now?: Date;
}

export interface CustomerContactUpdateInput {
  tenantId: string;
  customerId: string;
  contactId: string;
  patch: Partial<Pick<CustomerContactRecord, 'name' | 'roleTitle' | 'phone' | 'whatsapp' | 'email' | 'isPrimary' | 'status'>>;
  now?: Date;
}

export interface CustomerContactRepository {
  listByCustomer(input: { tenantId: string; customerId: string }): Promise<CustomerContactRecord[]>;
  create(input: CustomerContactCreateInput): Promise<CustomerContactRecord>;
  getById(input: { tenantId: string; customerId: string; contactId: string }): Promise<CustomerContactRecord | null>;
  update(input: CustomerContactUpdateInput): Promise<CustomerContactRecord | null>;
}
