export interface CustomerRepresentedCommercialProfileRecord {
  tenantId: string;
  customerId: string;
  representedCompanyId: string;
  defaultPriceTableId?: string;
  defaultPaymentTermId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerRepresentedCommercialProfileGetInput {
  tenantId: string;
  customerId: string;
  representedCompanyId: string;
}

export interface CustomerRepresentedCommercialProfileUpsertInput extends CustomerRepresentedCommercialProfileGetInput {
  defaultPriceTableId?: string | null;
  defaultPaymentTermId?: string | null;
  now?: Date;
}

export interface CustomerRepresentedCommercialProfileRepository {
  getByCustomerAndRepresented(input: CustomerRepresentedCommercialProfileGetInput): Promise<CustomerRepresentedCommercialProfileRecord | null>;
  upsertDefaults(input: CustomerRepresentedCommercialProfileUpsertInput): Promise<CustomerRepresentedCommercialProfileRecord>;
}
