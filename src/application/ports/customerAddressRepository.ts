export type CustomerAddressStatus = 'active' | 'inactive';
export type CustomerAddressType = 'main' | 'delivery' | 'billing' | 'other';

export interface CustomerAddressRecord {
  id: string;
  tenantId: string;
  customerId: string;
  addressType: CustomerAddressType;
  zipcode?: string;
  street: string;
  number?: string;
  complement?: string;
  district?: string;
  city: string;
  state: string;
  country: string;
  isPrimary: boolean;
  status: CustomerAddressStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerAddressCreateInput {
  id: string;
  tenantId: string;
  customerId: string;
  addressType: CustomerAddressType;
  zipcode?: string;
  street: string;
  number?: string;
  complement?: string;
  district?: string;
  city: string;
  state: string;
  country: string;
  isPrimary: boolean;
  status: CustomerAddressStatus;
  now?: Date;
}

export interface CustomerAddressUpdateInput {
  tenantId: string;
  customerId: string;
  addressId: string;
  patch: Partial<Pick<CustomerAddressRecord, 'addressType' | 'zipcode' | 'street' | 'number' | 'complement' | 'district' | 'city' | 'state' | 'country' | 'isPrimary' | 'status'>>;
  now?: Date;
}

export interface CustomerAddressRepository {
  listByCustomer(input: { tenantId: string; customerId: string }): Promise<CustomerAddressRecord[]>;
  create(input: CustomerAddressCreateInput): Promise<CustomerAddressRecord>;
  getById(input: { tenantId: string; customerId: string; addressId: string }): Promise<CustomerAddressRecord | null>;
  update(input: CustomerAddressUpdateInput): Promise<CustomerAddressRecord | null>;
}
