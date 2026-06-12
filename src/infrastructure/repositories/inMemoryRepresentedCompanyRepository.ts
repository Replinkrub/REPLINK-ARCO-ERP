import type { RepresentedCompanyRecord, RepresentedCompanyRepository, RepresentedCompanyStatus } from '../../application/ports/representedCompanyRepository.js';

export interface InMemoryRepresentedCompanyRecord {
  id: string;
  tenantId: string;
  name: string;
  status?: RepresentedCompanyStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export class InMemoryRepresentedCompanyRepository implements RepresentedCompanyRepository {
  private readonly items = new Map<string, RepresentedCompanyRecord>();

  constructor(representedCompanies: InMemoryRepresentedCompanyRecord[] = []) {
    for (const representedCompany of representedCompanies) this.save(representedCompany);
  }

  save(representedCompany: InMemoryRepresentedCompanyRecord): void {
    const now = new Date();
    this.items.set(key(representedCompany.tenantId, representedCompany.id), {
      ...representedCompany,
      status: representedCompany.status ?? 'active',
      createdAt: representedCompany.createdAt ? new Date(representedCompany.createdAt) : now,
      updatedAt: representedCompany.updatedAt ? new Date(representedCompany.updatedAt) : now,
    });
  }

  async getById(input: { tenantId: string; representedCompanyId: string }): Promise<RepresentedCompanyRecord | null> {
    const representedCompany = this.items.get(key(input.tenantId, input.representedCompanyId));
    return representedCompany ? { ...representedCompany, createdAt: new Date(representedCompany.createdAt), updatedAt: new Date(representedCompany.updatedAt) } : null;
  }
}

function key(tenantId: string, representedCompanyId: string): string {
  return `${tenantId}:${representedCompanyId}`;
}
