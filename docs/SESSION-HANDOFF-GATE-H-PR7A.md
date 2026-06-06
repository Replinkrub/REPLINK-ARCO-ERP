# Session Handoff — Gate H PR7A

Data: 2026-06-06
Branch: `feat/gate-h-pr7a-customer-api-core`
Status: **Customer API Core implementado para validação/revisão**

## 1) Escopo entregue

- Customer API Core em `/v1/customers`:
  - `GET /v1/customers`;
  - `POST /v1/customers`;
  - `GET /v1/customers/{customerId}`;
  - `PATCH /v1/customers/{customerId}`.
- Use cases de customer core:
  - `listCustomersUseCase`;
  - `createCustomerUseCase`;
  - `getCustomerUseCase`;
  - `updateCustomerUseCase`.
- `CustomerRepository` expandido para list/get/create/update.
- Implementações in-memory e Postgres atualizadas.
- Tenant guard preservado via `APP_TENANT_ID` + `x-tenant-id`.
- Ownership mínimo:
  - `ADMIN`: clientes do tenant;
  - `REPRESENTANTE`: somente `owner_id` ou `representative_id` igual ao ator.
- Duplicidade por `tenant_id + document_type + document_number` mapeada para `422 DUPLICATE_CUSTOMER_DOCUMENT`.

## 2) Bloqueio anti-dívida

PR7A **não libera clientes completos**.

PR7B permanece obrigatório antes de declarar o slice de clientes completo:

- `POST /v1/customers/{customerId}/contacts`;
- `PATCH /v1/customers/{customerId}/contacts/{contactId}`;
- `POST /v1/customers/{customerId}/addresses`;
- `PATCH /v1/customers/{customerId}/addresses/{addressId}`.

Até PR7B:

- não afirmar “clientes completos”;
- não avançar para products/prices/payment terms como se customer API estivesse completa;
- não mudar quote para exigir contato/endereço.

## 3) Fora de escopo preservado

- Sem contacts API.
- Sem addresses API.
- Sem frontend.
- Sem products/prices/payment terms.
- Sem RBAC runtime completo.
- Sem `GESTOR_COMERCIAL`.
- Sem audit events de denied.
- Sem ownership transfer.
- Sem delete físico.
- Sem commercial profile/default payment/default price table.
- Sem nova migration.
- Sem mudança em lifecycle/status/ORC→PED.
- `erp_app_flow_map.html` permanece fora do PR.

## 4) Validações registradas nesta implementação

- `npm run typecheck` — PASS.
- `npm run test` — PASS, 127/127.
- `npm run db:migrate` com `.env.local` carregado — PASS, 0 applied / 5 skipped.
- `npm run test:smoke:db` com `.env.local` carregado — PASS, 6/6.

## 5) Próximo passo recomendado

Revisar e mergear PR7A. Não iniciar PR7B antes do PR7A ser revisado/mergeado.
