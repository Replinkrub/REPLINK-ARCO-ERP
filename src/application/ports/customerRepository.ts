export type CustomerStatus = 'active' | 'inactive';

export interface CustomerRepository {
  findStatusByTenantAndId(input: { tenantId: string; customerId: string }): Promise<CustomerStatus | null>;
}
