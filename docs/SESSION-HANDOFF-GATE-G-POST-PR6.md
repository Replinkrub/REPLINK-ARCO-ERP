# Session Handoff — Gate G pós-PR6

Data: 2026-06-06
Branch: `feat/gate-g-pr6-customers-foundation`
Status: **Gate G PR6 — Customers Foundation pronto para revisão**

## 1) Escopo entregue

- Migration `005_customers_core.sql` com fundação relacional de clientes.
- Tabelas adicionadas: `customers`, `customer_contacts`, `customer_addresses`, `customer_commercial_profiles`.
- FKs tenant-safe para contatos, endereços e perfil comercial.
- `CustomerRepository` mínimo com adapters in-memory e Postgres.
- `createQuoteUseCase` exige cliente ativo no mesmo tenant antes de criar ORC.
- `updateQuote` valida troca de `customerId`.
- Erro canônico `CUSTOMER_NOT_AVAILABLE` mapeado como HTTP `422`.

## 2) Justificativa para tocar quote create/update

O PR6 toca `createQuoteUseCase` e `updateQuote` apenas para conectar a nova fundação de clientes ao ponto onde o orçamento referencia `customerId`.

Isto não introduz regra comercial nova: operacionaliza a regra já canônica da SPEC de que o orçamento nasce quando um **cliente válido é selecionado e salvo**. Antes do PR6, o sistema aceitava qualquer string não vazia como `customerId`; depois do PR6, novos ORCs e trocas de cliente em ORC exigem cliente ativo no mesmo tenant.

Limites preservados:

- sem CRUD/API pública de clientes;
- sem lifecycle/status comercial novo;
- sem alteração no fluxo ORC→PED;
- sem mudança na regra de representada do PR5B;
- sem FK hard em `commercial_documents.customer_id`, preservando compatibilidade com dados/documentos existentes;
- sem validar produto, preço, condição de pagamento, snapshot completo ou RBAC runtime neste PR.

## 3) Fora de escopo preservado

- Sem PR7 iniciado.
- Sem CRUD/API pública de clientes.
- Sem frontend.
- Sem products/prices/payment terms.
- Sem RBAC/auth runtime.
- Sem FK hard de `commercial_documents.customer_id` para `customers`.
- Sem alteração nas migrations `001`–`004`.
- `erp_app_flow_map.html` permanece fora do PR.

## 4) Validações registradas

- `npm run typecheck` — PASS.
- `npm run test` — PASS, 118/118.
- `npm run db:migrate` com `.env.local` carregado — PASS, `005` aplicada.
- `npm run db:migrate` com `.env.local` carregado — PASS, 0 applied / 5 skipped.
- Smoke DB com `.env.local` carregado — PASS, 5/5.
- `git diff --check` — PASS.

## 5) Próximo passo recomendado

Abrir PR do PR6 para revisão. Não iniciar PR7 até o PR6 ser revisado/mergeado.
