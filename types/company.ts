export interface Company {
  id: string;
  name: string;
  aliases: string[];
  searchTerms: string[];
  active: boolean;
  addedAt: string;
  notes?: string;
}

export interface CompanyList {
  companies: Company[];
  updatedAt: string;
}
