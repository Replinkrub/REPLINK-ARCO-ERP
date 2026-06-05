# Data Model Ops — ARCO-ERP V1 Operacional

> Status: Gate B — modelo lógico aprovado para planejamento
> Decisão estrutural: `docs/DECISION-DATA-MODEL-OPS.md`
> Escopo: modelo lógico/operacional; não é migration final
> Não autoriza: banco, migrations, código, API contracts ou frontend

## 1) Princípios canônicos

- A V1 é operacional completa, não MVP mínimo.
- Modelo escolhido: **híbrido relacional**.
- `commercial_documents` é o núcleo comum para orçamento/pedido.
- Itens, parcelas, revisões, eventos e faturamento operacional devem ser relacionais.
- Comunicação é `output_event`, nunca `commercial_status`.
- `ORDER_ADJUSTED` é revisão/evento, nunca status comercial.
- Pedido confirmado/faturado pode ser alterado apenas com permissão e revisão auditável.
- Snapshot preserva histórico, mas não bloqueia correção autorizada.
- Cliente/produto/preço/condição alterados depois não mudam documento confirmado retroativamente.
- Escopo multi-tenant: toda entidade operacional deve carregar ou derivar `tenant_id`.

## 2) Estados comerciais

Estados permitidos:

- `QUOTE_DRAFT`
- `ORDER_CONFIRMED`
- `INVOICED`
- `CANCELED`

Interpretação de `CANCELED`:

- cancela o documento comercial atual, interpretado junto com `document_type`, `canceled_at`, `cancel_reason`, `cancel_note` e `lifecycle_events`;
- não representa, sozinho, cancelamento/correção de faturamento operacional;
- cancelamento/correção de faturamento operacional deve ocorrer por revisão/auditoria do registro operacional de faturamento.

Proibidos como `commercial_status`:

- `COMUNICADO`
- `COMPARTILHADO`
- `ENVIADO`
- `IMPRESSO`
- `PDF_GERADO`
- `ORDER_ADJUSTED`

## 3) Entidades lógicas da V1

### Segurança / tenant

- `users` / `profiles`
- `roles`
- `user_roles`
- `tenant_memberships`

### Clientes

- `customers`
- `customer_contacts`
- `customer_addresses`
- `customer_commercial_profiles`

### Representadas (Arco Representações)

- `represented_companies`

### Produtos

- `products`
- `product_categories`
- `product_units`

### Preços

- `price_tables`
- `price_table_items`
- vínculo de tabela padrão por cliente no `customer_commercial_profiles`

### Pagamento

- `payment_terms`
- `payment_term_installments`
- `commercial_document_payment_schedule`

### Documentos comerciais

- `commercial_documents`
- `commercial_document_items`
- `commercial_document_revisions`
- `commercial_document_revision_changes`

### Eventos e auditoria

- `lifecycle_events`
- `output_events`
- `audit_events`

### Faturamento operacional

- `invoice_operational_records`
- vínculo com `commercial_document_payment_schedule` ou agenda própria operacional

## 4) Relações principais

- `customers` 1:N `customer_contacts`
- `customers` 1:N `customer_addresses`
- `customers` 1:1 `customer_commercial_profiles`
- `products` N:1 `product_categories`
- `products` N:1 `product_units`
- `price_tables` 1:N `price_table_items`
- `products` 1:N `price_table_items`
- `payment_terms` 1:N `payment_term_installments`
- `customers` 1:N `commercial_documents`
- `represented_companies` 1:N `commercial_documents` no ambiente Arco Representações
- `represented_companies` 1:N `products` no ambiente Arco Representações
- `represented_companies` 1:N `price_tables` no ambiente Arco Representações
- `commercial_documents` 1:N `commercial_document_items`
- `commercial_documents` 1:N `commercial_document_payment_schedule`
- `commercial_documents` 1:N `commercial_document_revisions`
- `commercial_document_revisions` 1:N `commercial_document_revision_changes`
- `commercial_documents` 1:N `lifecycle_events`
- `commercial_documents` 1:N `output_events`
- `commercial_documents` 1:N `audit_events`
- `commercial_documents` 0..1 `invoice_operational_records` ativo na V1

Invariante multi-tenant:

- toda FK entre entidades tenant-scoped deve respeitar o mesmo `tenant_id`;
- documento não pode referenciar cliente, produto, tabela de preço, condição de pagamento, item ou faturamento operacional de outro tenant;
- esse invariante deve ser validado em migrations/RLS/API, não apenas por filtro de tela.

Invariante de representada:

- representada não é tenant;
- no banco/tenant Arco Representações, cada documento comercial deve pertencer a uma única representada;
- ORC/PED não pode misturar representadas;
- produtos, tabelas de preço e condições comerciais devem ser validados contra a mesma representada do documento quando essas entidades forem implementadas;
- Sagrado não usa representadas no fluxo inicial; `represented_company_id` pode ser não aplicável/nulo conforme decisão física do gate de implementação.

## 5) ORC -> PED

Decisão canônica:

- ORC e PED usam o mesmo aggregate lógico `commercial_documents`;
- a confirmação cria um novo registro `commercial_documents` com `document_type = order`, `document_number = PED-####` e `source_quote_id` apontando para o orçamento original;
- o orçamento original preserva `document_type = quote`, `document_number = ORC-####` e histórico próprio;
- no ambiente Arco Representações, o PED herda `represented_company_id` do ORC;
- o orçamento original recebe `lifecycle_event` de convertido quando aplicável;
- é proibida mutação destrutiva do ORC para transformá-lo em PED;
- Gate F define detalhes físicos/transacionais, sem substituir essa regra.

## 6) Campos lógicos mínimos por entidade

### `customers`

- `id`
- `tenant_id`
- `legal_name`
- `trade_name`
- `document_type`
- `document_number`
- `state_registration` quando aplicável
- `municipal_registration` quando aplicável
- `tax_regime` quando aplicável
- telefone/e-mail/WhatsApp principal ou contato principal relacionado
- `status`
- `segment`
- `notes`
- `created_at`, `updated_at`

### `customer_contacts`

- `id`
- `tenant_id`
- `customer_id`
- `name`
- `role/title`
- `phone`
- `whatsapp`
- `email`
- `is_primary`
- `status`

### `customer_addresses`

- `id`
- `tenant_id`
- `customer_id`
- `address_type` (`main|delivery|billing|other`)
- `zipcode`
- `street`
- `number`
- `complement`
- `district`
- `city`
- `state`
- `country`
- `is_primary`
- `status`

### `customer_commercial_profiles`

- `customer_id`
- `default_payment_term_id`
- `default_price_table_id`
- `credit_limit` (informativo na V1, salvo decisão futura)
- `notes`

### `products`

- `id`
- `tenant_id`
- `sku`
- `name`
- `description`
- `commercial_name` / `short_name` quando aplicável
- `barcode` opcional
- `brand`
- `category_id`
- `unit_id`
- `package_info`
- `minimum_order_quantity` quando aplicável
- `multiple_order_quantity` quando aplicável
- `gross_weight` / `net_weight` opcionais
- `dimensions` opcionais
- `availability_status` (informativo)
- `status`

### `price_tables`

- `id`
- `tenant_id`
- `name`
- `status`
- `valid_from`
- `valid_until`
- `currency`

### `price_table_items`

- `id`
- `tenant_id`
- `price_table_id`
- `product_id`
- `unit_price`
- faixa/volume quando aplicável
- margem/limite operacional quando aplicável
- `valid_from`, `valid_until`

Regra de vigência:

- vigências conflitantes para o mesmo `tenant_id + price_table_id + product_id` são proibidas, salvo regra explícita de faixa/volume.

### `payment_terms`

- `id`
- `tenant_id`
- `name`
- `payment_method`
- `term_type`
- `status`

### `payment_term_installments`

- `id`
- `payment_term_id`
- `installment_number`
- `days_offset`
- `percentage`

### `commercial_documents`

- `id`
- `tenant_id`
- `document_type` (`quote|order`)
- `document_number` (`ORC-####|PED-####`)
- `commercial_status`
- `source_quote_id`
- `customer_id`
- `represented_company_id` quando aplicável ao ambiente Arco Representações
- `owner_id`
- `representative_id`
- `current_revision_number`
- `created_at`, `updated_at`
- `confirmed_at`, `invoiced_at`, `canceled_at`
- `customer_snapshot`
- `contact_snapshot`
- `address_snapshot`
- `payment_snapshot`
- `confirmation_snapshot`
- `cancel_reason`, `cancel_note`

### `commercial_document_items`

- `id`
- `tenant_id`
- `commercial_document_id`
- `product_id`
- produto deve pertencer à mesma representada do documento quando `represented_company_id` for aplicável
- `quantity`
- `unit`
- `base_unit_price`
- `applied_unit_price`
- `price_override_reason` quando diferente do preço da tabela
- `price_override_actor_id` ou revisão estruturada equivalente quando houver override
- `discount_amount` / `discount_percent`
- `price_table_id`
- `price_table_item_id`
- `product_snapshot`
- `price_snapshot`
- `line_total`

### `commercial_document_payment_schedule`

- `id`
- `tenant_id`
- `commercial_document_id`
- `installment_number`
- `due_date`
- `amount`
- `payment_method`
- `source_payment_term_id`
- `payment_snapshot`

### `commercial_document_revisions`

- `id`
- `tenant_id`
- `commercial_document_id`
- `revision_number`
- `reason_code`
- `reason_note`
- `actor_id`
- `actor_role`
- `before_snapshot`
- `after_snapshot`
- `created_at`

### `commercial_document_revision_changes`

- `id`
- `revision_id`
- `field_path`
- `old_value`
- `new_value`
- `impact_type` (`price|quantity|payment|customer|product|status|invoice|other`)

### `lifecycle_events`

- `id`
- `tenant_id`
- `commercial_document_id`
- `event_type`
- `actor_id`
- `reason_code`
- `reason_note`
- `event_at`
- `payload`

### `output_events`

- `id`
- `tenant_id`
- `commercial_document_id`
- `channel`
- `recipient_snapshot`
- `actor_id`
- `event_at`
- `payload`

### `audit_events`

- `id`
- `tenant_id`
- `actor_id`
- `actor_role`
- `entity_type`
- `entity_id`
- `action`
- `result` (`allowed|denied|failed`)
- `reason`
- `event_at`
- `payload`

### `invoice_operational_records`

- `id`
- `tenant_id`
- `commercial_document_id`
- `manual_reference`
- `document_label`
- `invoice_date`
- `amount`
- `operational_status` (`active|corrected|canceled`) quando necessário
- `notes`
- `created_by`
- `created_at`
- `corrected_by_revision_id` quando aplicável

Regra V1:

- um pedido pode ter um registro operacional de faturamento ativo;
- correções geram revisão/auditoria, não múltiplos faturamentos concorrentes;
- faturamento parcial fica para decisão futura, salvo necessidade operacional formal.

## 7) Snapshots obrigatórios

Snapshot comercial mínimo no pedido confirmado:

- cliente;
- contato;
- endereço;
- itens com produto, unidade, preço, desconto e totais;
- tabela de preço e regra aplicada;
- condição de pagamento;
- parcelas/vencimentos;
- ator/data de confirmação.

Regras:

- snapshots devem explicar a verdade comercial no momento;
- snapshots não substituem cadastros mestres;
- alteração posterior em cadastro mestre não altera snapshot;
- correção posterior gera revisão.

## 8) Revisões e auditoria

Toda alteração pós-confirmação/faturamento deve:

1. validar permissão;
2. exigir motivo quando crítica;
3. gerar `commercial_document_revisions`;
4. gerar `commercial_document_revision_changes`;
5. gerar `audit_events`;
6. gerar `lifecycle_events` quando afetar ciclo comercial.

Histórico não é editável.

`ORDER_ADJUSTED` deve ser `lifecycle_events.event_type` quando a revisão alterar dado comercial relevante. O before/after permanece em `commercial_document_revisions` e `commercial_document_revision_changes`.

## 9) Eventos: diferença canônica

| Tipo | Função | Altera `commercial_status`? |
| --- | --- | --- |
| `commercial_status` | Estado comercial oficial | Sim, quando transição válida |
| `lifecycle_events` | Registro de transições/revisões do ciclo | Não diretamente; documenta transição |
| `output_events` | Comunicação, envio, PDF, impressão, link | Nunca |
| `audit_events` | Segurança, permissão, alteração crítica, tentativa negada | Nunca |
| `commercial_document_revisions` | Before/after de alteração autorizada | Pode acompanhar mudança, mas não é status |

Fonte da verdade:

- `commercial_document_revisions` é a fonte de verdade do before/after comercial;
- `commercial_document_revision_changes` é o diff estruturado por campo;
- `audit_events` registra permissão, negação, falha e governança;
- `lifecycle_events` registra marcos narrativos do ciclo comercial;
- `output_events` registra comunicação/saída;
- payloads não devem virar fonte concorrente para o mesmo fato.

## 10) Estoque

Status no Gate B: **informativo**.

Na V1 comercial:
- produto pode indicar disponibilidade/status;
- disponibilidade pode exibir alerta;
- disponibilidade não bloqueia pedido por padrão.

Fora deste gate:
- reserva;
- baixa;
- movimentação;
- inventário;
- produção;
- expedição.

## 11) Comissões e metas

Status no Gate B:
- não bloqueiam o núcleo da V1;
- podem ser extensão/reporting se não contaminarem o documento comercial;
- regras formais de comissão/meta exigem gate posterior.

## 12) Bloqueios

Antes de migrations:

- Gate C — RBAC + Audit Model precisa passar;
- Gate D — API Contract Alignment precisa passar;
- Gate F — Migration Plan + Test Strategy precisa passar.

Sem esses gates, qualquer migration, API implementation ou frontend implementation deve retornar `Blocked`.

## 13) Próximo gate

Próximo gate recomendado: **Gate C — RBAC + Audit Model**.

Motivo:
- pedido confirmado/faturado editável, preço editável e faturamento operacional exigem permissões, negações e auditoria antes de API/migrations.
