export interface CustomerCommercialProfileRecord {
  tenantId: string;
  customerId: string;
  defaultPriceTableId?: string;
  defaultPaymentTermId?: string;
  creditLimit?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerCommercialProfileGetInput {
  tenantId: string;
  customerId: string;
}

export interface CustomerCommercialProfileUpsertDefaultPriceTableInput {
  tenantId: string;
  customerId: string;
  defaultPriceTableId: string | null;
  now?: Date;
}

export interface CustomerCommercialProfileRepository {
  getByCustomer(input: CustomerCommercialProfileGetInput): Promise<CustomerCommercialProfileRecord | null>;
  upsertDefaultPriceTable(input: CustomerCommercialProfileUpsertDefaultPriceTableInput): Promise<CustomerCommercialProfileRecord>;
}
