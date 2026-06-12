# GATE H PAYMENT TERMS + CUSTOMER DEFAULT PAYMENT TERMS + REPRESENTED COMMERCIAL PROFILE — POST-MERGE HANDOFF

Status: **MERGED**

Data: 2026-06-12  
Branch final: `main`

## 1) PRs integrados

| PR | Título | Commit técnico | Merge commit |
|---|---|---|---|
| #50 | Payment Terms Foundation | `d956fc5` | `d956fc5` |
| #51 | Customer Default Payment Terms Link | `7fc788d` | `7fc788d` |
| #52 | Customer Represented Commercial Profile | `d0c444b` | `2fb945a` |

## 2) O que o ciclo entregou

### PR #50 — Payment Terms Foundation

- Migration `010_payment_terms.sql`: `payment_terms(tenant_id, id, name, description, due_days, discount_percentage, discount_days, installment_count, installment_interval_days, is_active)`.
- Port `PaymentTermRepository`.
- Use cases `listPaymentTermsUseCase`, `createPaymentTermUseCase`, `getPaymentTermUseCase`, `updatePaymentTermUseCase`.
- Repositório in-memory + Postgres.
- Endpoints: `GET/POST/PATCH /v1/payment-terms` + `GET /v1/payment-terms/:paymentTermId`.
- Erros: `PAYMENT_TERM_NOT_FOUND`.

### PR #51 — Customer Default Payment Terms Link

- Migration `011_customer_default_payment_term.sql`: `customer_commercial_profiles.default_payment_term_id` com FK tenant-safe e índice.
- FK: `(tenant_id, default_payment_term_id) -> payment_terms(tenant_id, id)`.
- `GET/PATCH /v1/customers/{customerId}/commercial-profile` estendido com `defaultPaymentTermId`.
- `defaultPaymentTermId = null` limpa vínculo.
- Omitted fields in PATCH preserved (not cleared).

### PR #52 — Customer Represented Commercial Profile

- Migration `012_customer_represented_commercial_profile.sql`: `customer_represented_commercial_profiles(tenant_id, id, customer_id, represented_company_id, default_price_table_id, default_payment_term_id)`.
- Partial unique `(tenant_id, customer_id, represented_company_id)`.
- FK composta tenant-safe com `represented_company_id`, `default_price_table_id`, `default_payment_term_id`.
- `default_price_table_id` com `represented_company_id IS NULL` (apenas tabela global permitida).
- Migration `013_customer_represented_commercial_profile_guards.sql`: triggers de guarda para representada-mismatch entre perfil, tabela de preço e condição de pagamento.
- Ports: `CustomerRepresentedCommercialProfileRepository`, `RepresentedCompanyRepository`.
- Use cases: `getCustomerRepresentedCommercialProfileUseCase`, `updateCustomerRepresentedCommercialProfileUseCase`.
- Repositórios in-memory + Postgres para ambos os ports.
- Endpoints: `GET/PATCH /v1/customers/{customerId}/represented-commercial-profiles/{profileId}`.
- Omitted fields in PATCH preserved (not cleared).

## 3) Endpoints entregues neste ciclo

- `GET /v1/payment-terms`
- `POST /v1/payment-terms`
- `GET /v1/payment-terms/:paymentTermId`
- `PATCH /v1/payment-terms/:paymentTermId`
- `GET /v1/customers/{customerId}/commercial-profile` (extendido com `defaultPaymentTermId`)
- `PATCH /v1/customers/{customerId}/commercial-profile` (extendido com `defaultPaymentTermId`)
- `GET /v1/customers/{customerId}/represented-commercial-profiles/{profileId}`
- `PATCH /v1/customers/{customerId}/represented-commercial-profiles/{profileId}`

## 4) Decisões técnicas integradas

- Price tables são globais/base; customer + `represented_company_id` define defaults.
- Per-product overrides (`customer_product_price_overrides`) existe como foundation de dados/modelo mas **ainda não há CRUD, API, motor de preço ou ORC/PED snapshot**.
- Omitted fields em PATCH são preservados (não limpos) tanto para default price table quanto para payment term no represented profile.
- Representada da tabela de preço no represented profile deve ser `NULL` (apenas tabela global permitida).
- Representada-mismatch entre perfil, tabela de preço e condição de pagamento bloqueada por trigger (migration 013).

## 5) Validação registrada (PR #52 — último do ciclo)

- `npm run typecheck` — PASS
- `npm run test` — PASS, 168/168
- `npm run db:migrate` — PASS (010–013 applied)
- `npm run test:smoke:db` — PASS, 13/13
- `git diff --check` — PASS
- QA review (Sage independent validation) — PASS

## 6) Fora de escopo preservado

- Aplicação automática de preço em ORC/PED.
- CRUD/API/motor de preço para `customer_product_price_overrides` — existe apenas como base de dados/modelo.
- ORC/PED snapshot.
- Frontend.
- RBAC runtime completo.
- Estoque.
- Fiscal/NF-e/SEFAZ.
- Comissões.
- Margem/desconto avançado.
- Price tiers/faixas.
- Promoção/campanha.
- `commercial_status`.
- `erp_app_flow_map.html`.

## 7) Próximo passo recomendado

Escolher e planejar o próximo slice com autorização explícita, sem iniciar implementação automática.

Opções naturais para decisão:

1. ORC/PED item snapshot com price table + payment terms;
2. Override CRUD/API para `customer_product_price_overrides`;
3. Frontend shell inicial;
4. RBAC runtime completo;
5. Outro slice aprovado pelo roadmap.
