export type RepresentedCompanyStatus = 'active' | 'inactive';

export interface RepresentedCompanyRecord {
  id: string;
  tenantId: string;
  name: string;
  status: RepresentedCompanyStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface RepresentedCompanyRepository {
  getById(input: { tenantId: string; representedCompanyId: string }): Promise<RepresentedCompanyRecord | null>;
}
