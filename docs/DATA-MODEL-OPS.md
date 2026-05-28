# Data Model Ops — ARCO-ERP v0

Status: planning-only  
Objetivo: fechar modelo lógico mínimo + integridade para execução técnica futura.

## Princípios canônicos

- Estado comercial permitido: `QUOTE_DRAFT`, `ORDER_CONFIRMED`, `INVOICED`, `CANCELED`.
- Conversão orçamento->pedido ocorre apenas por confirmação.
- `ORDER_ADJUSTED` é evento/revisão administrativa (não estado).
- Comunicação é `output_event` sem efeito em `commercial_status`.
- Escopo multi-tenant: filtros obrigatórios por `tenant_id` + `owner_id/representante_id`.

## Entidades e cardinalidade (lógico)

- `users` 1:N `user_roles`
- `roles` 1:N `user_roles`
- `customers` 1:N `quotes`
- `quotes` 1:N `quote_items`
- `quotes` 0..1 : 1 `orders` (conversão única)
- `orders` 1:N `order_items`
- `orders` 1:N `order_revisions`
- `orders` 0..1 : 1 `invoices_simple`
- `orders` 1:N `lifecycle_events`
- `quotes` 1:N `lifecycle_events`
- `orders|quotes` 1:N `output_events`

## Campos mínimos obrigatórios

## quotes
- `id` (uuid, PK)
- `tenant_id` (texto/uuid, obrigatório)
- `quote_number` (texto, único, padrão `ORC-`)
- `commercial_status` (`QUOTE_DRAFT|CANCELED`)
- `customer_id` (FK)
- `representante_id` (FK users)
- `created_at`, `updated_at`, `canceled_at`

## orders
- `id` (uuid, PK)
- `tenant_id` (texto/uuid, obrigatório)
- `order_number` (texto, único, padrão `PED-`)
- `source_quote_id` (FK quotes, único)
- `commercial_status` (`ORDER_CONFIRMED|INVOICED|CANCELED`)
- `representante_id` (FK users)
- `confirmed_at`, `invoiced_at`, `canceled_at`
- `snapshot_payload` (json obrigatório no momento da confirmação)
- `created_at`, `updated_at`

## order_revisions
- `id`, `order_id` (FK)
- `tenant_id` (texto/uuid, obrigatório)
- `revision_number` (inteiro crescente por pedido)
- `reason`
- `before_payload`, `after_payload`
- `created_by`, `created_at`

## lifecycle_events
- `id`, `entity_type` (`quote|order`), `entity_id`
- `event_type` (inclui `ORDER_ADJUSTED`)
- `actor_id`, `reason_code`, `reason_note`, `event_at`, `payload`

## output_events
- `id`, `entity_type`, `entity_id`
- `tenant_id` (texto/uuid, obrigatório)
- `channel` (`SEND_WHATSAPP|SEND_EMAIL|GENERATE_PDF|PRINT|COPY_LINK|SHARE`)
- `actor_id`, `event_at`, `payload`

## invoices_simple
- `id`, `order_id` (FK único)
- `tenant_id` (texto/uuid, obrigatório)
- `invoice_date`, `amount`
- `manual_reference` (opcional)
- `notes` (opcional)
- `created_by`, `created_at`

## Regras de integridade (obrigatórias)

1. `source_quote_id` único em `orders` (um orçamento não gera dois pedidos).
2. `quote_number` e `order_number` únicos.
3. `order.commercial_status=ORDER_CONFIRMED` requer `confirmed_at` não nulo.
4. `order.commercial_status=INVOICED` requer `invoiced_at` e registro em `invoices_simple`.
5. Cancelamentos exigem motivo e `canceled_at`.
6. Todo ajuste admin exige gravação em `order_revisions` e `lifecycle_events`.
7. `output_events` não pode alterar estado comercial.
8. Ações de REPRESENTANTE só podem operar dados do próprio `representante_id` no mesmo `tenant_id`.
9. Alteração de ownership/carteira é operação administrativa e auditável.

## Concorrência e idempotência (mínimo)

- Operações críticas (`confirm`, `cancel`, `adjust`, `invoice`) exigem `Idempotency-Key`.
- Estado deve ser revalidado no servidor antes de persistir transição.
- Em conflito de estado concorrente: retornar 409 sem efeitos parciais.
- Conversão `quote->order` deve ser atômica (transação única).

## Auditoria mínima

- Toda transição de estado gera `lifecycle_event` com ator, data, motivo (quando aplicável).
- Todo ajuste admin persiste diff before/after.
- Toda comunicação gera `output_event` com canal e ator.
- Exceções operacionais temporárias devem registrar ator, motivo, período e escopo.

## Taxonomia canônica de motivos (MVP)

### reason_code (cancelamento)
- `CLIENTE_DESISTIU`
- `PRECO_CONDICAO_REPROVADA`
- `ERRO_CADASTRO_CLIENTE`
- `ERRO_ITEM_QUANTIDADE`
- `ERRO_CONDICAO_PAGAMENTO`
- `PRODUTO_INDISPONIVEL`
- `DUPLICIDADE`
- `PRAZO_ENTREGA_INVIAVEL`
- `CANCELAMENTO_INTERNO`
- `OUTROS`

### reason_code (ajuste)
- `AJUSTE_PRECO`
- `AJUSTE_DESCONTO`
- `AJUSTE_QUANTIDADE`
- `AJUSTE_ITEM`
- `AJUSTE_CONDICAO_PAGAMENTO`
- `AJUSTE_FRETE`
- `AJUSTE_DADOS_CLIENTE`
- `AJUSTE_FISCAL_OPERACIONAL`
- `CORRECAO_ERRO_OPERADOR`
- `OUTROS`

### Regra de validação
- `reason_code` obrigatório em cancelamento e ajuste relevante.
- `reason_note` obrigatório quando `reason_code = OUTROS`.
- Inclusão de novos `reason_code` apenas por decisão registrada.

## Não objetivos deste documento

- Definir engine, banco específico ou migrations finais.
- Autorizar implementação imediata.
