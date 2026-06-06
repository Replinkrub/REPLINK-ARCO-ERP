import type { CustomerRepository, CustomerStatus } from '../../application/ports/customerRepository.js';

export interface InMemoryCustomerRecord {
  id: string;
  tenantId: string;
  status: CustomerStatus;
}

export class InMemoryCustomerRepository implements CustomerRepository {
  private readonly items = new Map<string, InMemoryCustomerRecord>();

  constructor(customers: InMemoryCustomerRecord[] = []) {
    for (const customer of customers) {
      this.save(customer);
    }
  }

  save(customer: InMemoryCustomerRecord): void {
    this.items.set(key(customer.tenantId, customer.id), { ...customer });
  }

  async findStatusByTenantAndId(input: { tenantId: string; customerId: string }): Promise<CustomerStatus | null> {
    return this.items.get(key(input.tenantId, input.customerId))?.status ?? null;
  }
}

function key(tenantId: string, customerId: string): string {
  return `${tenantId}:${customerId}`;
}
