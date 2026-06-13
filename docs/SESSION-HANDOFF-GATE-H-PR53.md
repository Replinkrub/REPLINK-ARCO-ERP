# GATE H PR53 — CUSTOMER PRODUCT PRICE OVERRIDES + PRICE RESOLUTION CORE — POST-MERGE HANDOFF

Status: **MERGED**

Data: 2026-06-13  
Branch final: `main`

## 1) PR integrado

| PR | Título | Commit técnico | Merge commit |
|---|---|---|---|
| #53 | Customer Product Price Overrides + Price Resolution Core | `9183f48` | `8b039cb` |

PR: https://github.com/Replinkrub/REPLINK-ARCO-ERP/pull/53

## 2) O que o ciclo entregou

- CRUD/API básico para `customer_product_price_overrides`.
- Port + use cases + repositórios in-memory/Postgres.
- Resolução mínima de preço antes do futuro snapshot ORC/PED.
- Garantia de no máximo 1 override ativo por `tenant_id + customer_id + represented_company_id + product_id`.
- Validação de `unit_price > 0`.
- Validação de cliente, representada ativa e produto ativo.
- Safety de `represented_company_id`: produto precisa pertencer à representada do override/resolução.

## 3) Endpoints entregues

- `GET /v1/customers/{customerId}/represented-commercial-profiles/{representedCompanyId}/product-price-overrides`
- `POST /v1/customers/{customerId}/represented-commercial-profiles/{representedCompanyId}/product-price-overrides`
- `GET /v1/customers/{customerId}/represented-commercial-profiles/{representedCompanyId}/product-price-overrides/{overrideId}`
- `PATCH /v1/customers/{customerId}/represented-commercial-profiles/{representedCompanyId}/product-price-overrides/{overrideId}`
- `GET /v1/customers/{customerId}/represented-commercial-profiles/{representedCompanyId}/products/{productId}/resolved-price`

## 4) Regra de resolução integrada

1. Se existir override ativo para `customer + represented_company + product`, usar override.
2. Se não existir override ativo, usar item ativo da tabela base/default do perfil comercial por representada.
3. Retornar preço resolvido + origem:
   - `CUSTOMER_PRODUCT_OVERRIDE`
   - `PRICE_TABLE_ITEM`
4. Se não houver preço resolvível, retornar erro explícito `PRICE_NOT_RESOLVABLE`.

## 5) Decisões técnicas integradas

- Migration `014_customer_product_price_overrides_active_unique.sql` cria unique parcial:
  - `(tenant_id, customer_id, represented_company_id, product_id) WHERE status = 'active'`.
- `priceResolution.ts` centraliza a regra mínima para evitar snapshotar regra incompleta no próximo slice.
- `priceTableItemRepository` ganhou lookup de item ativo por tabela/produto/data.
- Autorização mínima atual:
  - ADMIN cria/edita overrides;
  - ADMIN e REPRESENTANTE listam/consultam/resolvem preço conforme visibilidade do cliente.

## 6) Validação registrada

- `npm run typecheck` — PASS.
- `npm run test` — PASS, 173/173.
- `set -a && source ./.env.local && set +a && npm run db:migrate && npm run test:smoke:db` — PASS.
  - Última execução pós-merge: migrations 0 applied / 14 skipped; smoke DB 13/13.
- `git diff --check` — PASS.
- Finalizer: `npx ai-workflow collect-evidence --mode=standard --task=customer-product-price-overrides-resolution` — COMPLETED.

## 7) Fora de escopo preservado

- Frontend.
- ORC/PED snapshot.
- Promoções.
- Faixa de preço.
- Margem.
- Comissão.
- Desconto avançado.
- Edição visual de tabela.
- `erp_app_flow_map.html`.

## 8) Próximo passo recomendado

Planejar o próximo slice técnico: **ORC/PED item snapshot usando Price Resolution Core**.

Não iniciar implementação automática. O plano deve definir:

- campos de snapshot de preço e origem;
- como chamar `resolvePriceUseCase`;
- persistência de `priceSource`, `priceSourceId` e `priceTableId` quando aplicável;
- testes unitários/application, HTTP/API, repository/Postgres e smoke DB;
- limites explícitos: sem frontend, sem fiscal, sem promoções/faixas/margem/comissão/desconto avançado.
