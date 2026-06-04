# Migration Plan Ops — ARCO-ERP V1 Operacional

> Status: Gate F — Migration Plan + Test Strategy  
> Complementa: `docs/TEST-STRATEGY-OPS.md`  
> Base: `docs/DATA-MODEL-OPS.md`, `docs/RBAC-MATRIX.md`, `docs/AUDIT-MODEL-OPS.md`, `docs/API-CONTRACTS.yaml`, `docs/API-CONTRACTS-OPS.md`, `docs/FRONTEND-CONTRACT-OPS.md`  
> Escopo: plano documental de migrations; não cria migrations, não altera banco, não altera backend/API/frontend

## 1) Decisão do Gate F

A V1 operacional deve migrar da foundation atual para o modelo híbrido relacional aprovado no Gate B sem quebrar o fluxo existente.

Decisão:

- manter `commercial_documents` como núcleo de ORC/PED;
- preservar compatibilidade com a migration existente `src/infrastructure/postgres/migrations/001_init_commercial_documents.sql`;
- adicionar tabelas relacionais por fatias pequenas, com backfill/compatibilidade explícitos;
- não remover colunas JSONB existentes no primeiro ciclo de migração;
- validar tenant, ownership, RBAC, idempotência, revisão, eventos e snapshots antes de liberar slices de API/backend.

## 2) Estado atual conhecido

Migration existente:

- `001_init_commercial_documents.sql` cria `commercial_documents` com:
  - `document_type`, `number`, `tenant_id`, `owner_id`, `representative_id`, `status`;
  - `items`, `totals`, `lifecycle_events`, `output_events`, `order_revisions` em JSONB;
  - `source_quote_id` com constraint única;
  - campos básicos de confirmação, faturamento, cancelamento e índices de tenant/status.

Implicação:

- a foundation é válida como ponte técnica, mas insuficiente para V1 completa;
- a V1 precisa separar itens, parcelas, revisões, eventos, clientes, produtos, preço, pagamento, auditoria e faturamento operacional em relações consultáveis;
- migração deve ser incremental para evitar regressão em fluxos já cobertos por testes.

## 3) Princípios obrigatórios de migration

1. Nenhuma migration física é criada neste gate.
2. Toda tabela operacional deve carregar ou derivar `tenant_id`.
3. Toda FK tenant-scoped deve respeitar mesmo tenant.
4. `commercial_status` só permite `QUOTE_DRAFT`, `ORDER_CONFIRMED`, `INVOICED`, `CANCELED`.
5. Comunicação permanece em `output_events`, nunca em status.
6. ORC → PED cria novo registro de pedido vinculado ao ORC; não há mutação destrutiva do orçamento.
7. Pedido confirmado/faturado alterado exige revisão, diff, audit e motivo quando aplicável.
8. Faturamento operacional tem 1 registro ativo por pedido na V1.
9. Rollback destrutivo deve ser evitado; preferir forward-fix para migrations já aplicadas em ambiente compartilhado.
10. Dados históricos não devem ser reescritos silenciosamente por alteração de cadastro mestre.

## 4) Sequência proposta de migrations

Nomes são semânticos. Numeração final deve seguir a convenção existente no diretório de migrations.

| Ordem | Migration semântica | Objetivo | Depende de | Risco principal |
| --- | --- | --- | --- | --- |
| 002 | security_tenant_roles | roles, user roles, tenant memberships/escopo | 001 | liberar RBAC sem vínculo correto |
| 003 | customers_core | clientes, contatos, endereços, perfil comercial | 002 | snapshots sem dados suficientes |
| 004 | products_core | produtos, categorias, unidades | 002 | produto incompleto para item comercial |
| 005 | price_tables | tabelas e itens de preço com vigência | 004 | vigência conflitante/preço retroativo |
| 006 | payment_terms | condições, parcelas padrão e agenda aplicada | 003 | confundir condição com faturamento |
| 007 | commercial_document_relations | itens e parcelas relacionais do documento | 003-006 | divergência JSONB vs relacional |
| 008 | revisions_and_events | revisões, changes, lifecycle, output, audit | 007 | alteração crítica sem trilha |
| 009 | operational_invoices | registro operacional de faturamento | 008 | duplicidade de registro ativo |
| 010 | idempotency_and_action_guards | chaves de idempotência/action log | 008-009 | duplo submit criando efeito duplicado |
| 011 | indexes_constraints_rls | índices, constraints finais, RLS/policies quando aplicável | 002-010 | performance e autorização inconsistentes |
| 012 | compatibility_cleanup_plan | planejar redução de dependência JSONB, sem remoção prematura | 007-011 | remover compatibilidade cedo demais |

## 5) Plano por migration

### 002 — Segurança, tenant e roles

Escopo:

- `roles`;
- `user_roles`;
- `tenant_memberships` ou equivalente;
- vínculo de usuário/perfil/tenant.

Constraints mínimas:

- perfil permitido: `ADMIN`, `REPRESENTANTE`, `GESTOR_COMERCIAL` condicionado;
- bloquear `VISUALIZADOR`, `SUPORTE` e perfis futuros sem gate;
- unicidade por usuário + tenant + role conforme regra física final.

Forward-fix:

- se role errada for criada, inativar/corrigir por migration posterior; não apagar histórico de permissão usado em audit.

### 003 — Clientes completos

Escopo:

- `customers`;
- `customer_contacts`;
- `customer_addresses`;
- `customer_commercial_profiles`.

Constraints mínimas:

- `tenant_id` obrigatório;
- FK de contatos/endereços para customer do mesmo tenant;
- endereço com `address_type` canônico;
- contato/endereço principal por regra futura de unicidade parcial quando suportada.

Compatibilidade:

- documentos existentes sem cliente completo continuam válidos, mas novos fluxos V1 devem exigir cliente operacional suficiente antes de salvar ORC.

### 004 — Produtos completos

Escopo:

- `products`;
- `product_categories`;
- `product_units`.

Constraints mínimas:

- SKU único por tenant quando aplicável;
- status de produto;
- disponibilidade informativa, sem estoque bloqueante na V1.

### 005 — Tabela de preços

Escopo:

- `price_tables`;
- `price_table_items`.

Constraints mínimas:

- vigência obrigatória quando preço estiver ativo;
- evitar vigência conflitante para `tenant_id + price_table_id + product_id`, salvo faixa/volume formal;
- preço aplicado em documento deve ser snapshot, não lookup mutável.

Forward-fix:

- conflito de vigência detectado depois deve ser corrigido por nova migration/patch transacional, não por edição manual silenciosa.

### 006 — Condições de pagamento

Escopo:

- `payment_terms`;
- `payment_term_installments`;
- base para `commercial_document_payment_schedule`.

Regra:

- condição de pagamento não é faturamento operacional;
- parcelas aplicadas ao documento são snapshot relacional.

### 007 — Documento comercial relacional

Escopo:

- `commercial_document_items`;
- `commercial_document_payment_schedule`;
- possíveis colunas novas em `commercial_documents` para `current_revision_number`, snapshots e nomes canônicos.

Compatibilidade com 001:

- manter `items`, `totals`, `lifecycle_events`, `output_events`, `order_revisions` JSONB durante transição;
- implementar backfill futuro de JSONB para tabelas relacionais quando os dados forem compatíveis;
- enquanto houver dupla fonte, backend deve definir uma fonte primária por slice e testes devem detectar divergência.

Risco:

- leitura mista pode gerar inconsistência. Mitigação: API slice deve retornar uma origem controlada e coberta por testes.

### 008 — Revisões, eventos e auditoria

Escopo:

- `commercial_document_revisions`;
- `commercial_document_revision_changes`;
- `lifecycle_events`;
- `output_events`;
- `audit_events`.

Constraints mínimas:

- revision number único por documento;
- `audit_events.result` em `allowed|denied|failed`;
- lifecycle/output/audit não podem alterar `commercial_status` sozinhos;
- `ORDER_ADJUSTED` só como lifecycle, nunca status.

### 009 — Registro operacional de faturamento

Escopo:

- `invoice_operational_records`;
- índice/constraint para no máximo 1 registro ativo por pedido.

Constraints mínimas:

- pedido deve ser `ORDER_CONFIRMED` para registrar faturamento inicial;
- sucesso move documento para `INVOICED` pelo serviço/API, não por edição manual direta;
- correção/cancelamento operacional depende de revisão/audit.

Fora de escopo:

- faturamento parcial;
- NF-e;
- SEFAZ;
- gateway;
- boleto automático.

### 010 — Idempotência e action guards

Escopo:

- tabela ou mecanismo equivalente para registrar `Idempotency-Key`, action, payload hash, resultado e actor/tenant.

Actions cobertas:

- `confirm_quote_to_order`;
- `cancel_quote`;
- `cancel_order`;
- `revise_confirmed_order`;
- `revise_invoiced_order`;
- `override_item_price`;
- `register_operational_invoice`;
- `correct_operational_invoice`;
- `send_output`/`generate_pdf` quando persistente.

Regra:

- mesma chave + mesmo payload retorna mesmo resultado;
- mesma chave + payload diferente retorna 409 `IDEMPOTENCY_CONFLICT`.

### 011 — Índices, constraints e RLS/policies

Escopo:

- índices por `tenant_id`, owner/representative, status, document_type, datas, cliente/produto;
- constraints de status/document_type/action result;
- RLS/policies quando o runtime adotado exigir.

Regra:

- autorização final continua no backend/API; RLS é camada adicional, não substituto de RBAC de aplicação.

### 012 — Plano de cleanup de compatibilidade

Escopo:

- documentar quando JSONB legado deixa de ser fonte primária;
- planejar remoção/aposentadoria apenas após testes e ambiente confirmarem backfill.

Bloqueio:

- não remover `items`, `totals`, `lifecycle_events`, `output_events` ou `order_revisions` da foundation na primeira onda sem prova de compatibilidade.

## 6) Backfill e compatibilidade

Backfill futuro deve seguir esta ordem:

1. inventariar documentos existentes por tenant/status/type;
2. validar que JSONB legado possui dados mínimos para itens/totais/eventos/revisões;
3. backfill para tabelas relacionais em transação por lote seguro;
4. comparar contagens e checksums funcionais por documento;
5. manter fallback controlado até API/backend passar smoke real;
6. só então considerar cleanup em gate posterior.

Dados incompletos:

- devem ser marcados como risco/pendência operacional;
- não devem ser corrigidos silenciosamente com dados inventados;
- correção exige owner e decisão documentada.

## 7) Rollback / forward-fix

| Tipo de mudança | Estratégia preferida | Observação |
| --- | --- | --- |
| Tabela nova sem uso produtivo | rollback possível por migration reversa local | só antes de ambiente compartilhado |
| Constraint nova causando bloqueio | forward-fix ajustando constraint/dados | preservar histórico |
| Backfill parcial | forward-fix idempotente por lote | registrar contagem antes/depois |
| Índice problemático | rollback/drop index seguro | não altera dado |
| RLS/policy incorreta | forward-fix imediato + testes negativos | risco de segurança alto |
| Cleanup de coluna legado | bloquear até gate futuro | não fazer na primeira onda |

## 8) Riscos de dados existentes

| Risco | Severidade | Mitigação |
| --- | --- | --- |
| JSONB legado incompleto para backfill relacional | High | inventário + backfill validado + sem remoção prematura |
| `number` vs `document_number` divergente | Medium | mapear nomenclatura em Gate G antes de migration física |
| `status` vs `commercial_status` divergente | High | constraint/adapter deve preservar enum canônico |
| ORC já convertido sem vínculo suficiente | High | validar `source_quote_id` e uniqueness antes de backfill |
| Revisões em JSONB sem diff estruturado | Medium | migrar como resumo quando possível e marcar lacuna |
| Faturamento simples legado sem registro operacional relacional | Medium | backfill para `invoice_operational_records` quando dados mínimos existirem |
| Tenant/ownership ausente em cadastro mestre novo | High | `tenant_id` obrigatório e testes cross-tenant |

## 9) Critério de entrada para Gate G

Gate G só deve iniciar quando este plano estiver aprovado e o PR técnico futuro puder declarar:

- quais migrations serão criadas;
- qual ordem será aplicada;
- quais tabelas terão backfill;
- quais constraints serão adicionadas;
- quais testes cobrem cada migration;
- como validar Supabase/dev DB com `npm run db:migrate` e `npm run test:smoke:db`.

## 10) Bloqueios mantidos

- Não criar migration neste gate.
- Não alterar `001_init_commercial_documents.sql` neste gate.
- Não alterar banco, backend, API contracts ou frontend.
- Não versionar `erp_app_flow_map.html`.
- Não reduzir V1 para MVP mínimo.
- Não introduzir fiscal real, NF-e, SEFAZ, gateway, boleto automático ou faturamento parcial.

## 11) Próximo gate

Próximo gate recomendado: **Gate G — Backend/Data Foundation Implementation**, somente após revisão/commit do Gate F e autorização explícita.

Motivo: Gate F fecha ordem de migration, compatibilidade, riscos e suíte mínima; Gate G pode então implementar fundação de dados/backend sem improvisar estrutura.
