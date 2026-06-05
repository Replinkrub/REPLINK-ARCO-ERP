# Decision — Represented Companies

Status: **Accepted for planning**  
Scope: domain decision only; does not authorize code, migrations, API implementation, frontend, or RBAC runtime changes.

## 1) Context

ARCO-ERP is a single product with a single codebase.

The operational architecture is:

- database-per-tenant;
- environment-configured tenant;
- Sagrado has its own operational database;
- Arco Representações has its own operational database;
- Sagrado and Arco data must not coexist in the same operational database;
- `tenant_id` identifies the environment/tenant inside that database;
- runtime tenant must come from environment/configuration, not arbitrary user input.

## 2) Decision

Representada is **not** a tenant.

Representada is a commercial domain entity inside the `arco-representacoes` tenant/database and must become a future table:

```txt
represented_companies
```

## 3) Canonical rules

- An Arco quote/order must belong to exactly one represented company.
- An Arco quote/order must never mix represented companies.
- The order inherits `represented_company_id` from the quote.
- The order cannot change represented company during confirmation.
- Products, price tables and commercial/payment terms must be scoped to represented company when those foundations are implemented.
- Items in a commercial document must not reference products from a represented company different from the document represented company.

## 4) Sagrado impact

Sagrado does not use represented companies in the initial flow.

For Sagrado, `represented_company_id` is non-applicable and can be nullable/omitted from the initial runtime flow, depending on the physical model chosen in the implementation gate.

## 5) Future code impact

When implemented, the domain model should evolve toward:

```txt
CommercialDocument.representedCompanyId?: string
CreateQuoteInput.representedCompanyId?: string
sourceQuoteSnapshot.represented_company_id
```

The implementation must preserve:

- ORC gets represented company in Arco flows;
- PED inherits represented company from ORC;
- no split/mixed-representada ORC/PED in V1.

## 6) PR order

Recommended order:

1. **Gate G PR4 — Bind commercial documents to environment tenant**
   - `APP_TENANT_ID`;
   - environment bootstrap;
   - ORC uses environment tenant;
   - PED inherits tenant from ORC;
   - safe backfill/FK/index strategy for `commercial_documents.tenant_id`.
2. **Gate G PR5 — Represented companies foundation**
   - `represented_companies`;
   - `represented_company_id` on commercial documents;
   - ORC/PED same-represented-company invariant.
3. Future PRs:
   - products scoped by represented company;
   - price tables scoped by represented company;
   - commercial/payment terms scoped by represented company.

## 7) Explicit non-goals for this decision

- No migration is created by this document.
- No code is changed by this document.
- No frontend/API/RBAC runtime implementation is authorized by this document.
- No mixed cart / split multi-representada flow is allowed in V1.
