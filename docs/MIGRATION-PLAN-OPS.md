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

Gate G foi iniciado após revisão/commit do Gate F.

Status atualizado:

- PR #31 mergeado em `main` (`6d7cd19`) com fundação inicial ORC→PED e migration runner controlado.
- Próximo slice recomendado: **Gate G PR 3 — security/tenant/roles/audit base**.
- A primeira migration funcional nova deve partir da sequência deste plano, com `schema_migrations` já ativo e validação de skip/checksum/advisory lock.

## 12) IPRO 019 — reprocessamento controlado

`019_ipro_controlled_reprocessing.sql` permite uma nova geração de processamento para o mesmo conteúdo imutável sem duplicar a origem:

- `ipro.source_files` permanece globalmente deduplicada por `content_hash`; uma nova geração reutiliza o mesmo `source_file_id`;
- `ipro.ingestion_batches.processing_fingerprint` passa a ser obrigatório e não vazio após `BTRIM`; linhas anteriores recebem primeiro o valor não vazio de `metadata.processing_fingerprint` e, na ausência dele, o fallback determinístico `legacy:idempotency:<idempotency_key>` antes de `NOT NULL` e do `CHECK` serem aplicados;
- `ipro.product_entities`, `ipro.product_aliases` e `ipro.product_resolutions` recebem `represented_company_id TEXT` como escopo estável de máquina, sem tabela mestre, FK ou mudança no modelo de cliente; `ipro.canonical_represented_company_id(text)` remove POSIX whitespace/controle somente das bordas, converte resultado vazio em `NULL` e também retorna `NULL` para valor que ainda contenha whitespace/controle internamente;
- IDs preexistentes são normalizados por essa função antes das constraints; depois do rollout, cada coluna aceita somente `NULL` ou valor não vazio idêntico ao seu resultado canônico, portanto espaço, tab, newline, carriage return, form feed, vertical tab e controles internos/bordas são rejeitados;
- o ID estável é recuperado de `metadata.represented_company_stable_id` quando disponível; aliases sem valor próprio podem herdá-lo da entidade de produto;
- `represented_company` continua preservado como snapshot textual de exibição e fallback de compatibilidade; nenhum texto histórico é reescrito;
- os índices unique de SKU, código e lookup de alias usam `COALESCE(ipro.canonical_represented_company_id(represented_company_id), represented_company, '')`, a mesma semântica defensiva das constraints e da preflight, sem permitir que ID vazio, whitespace/control ou padded contorne o fallback textual;
- a unicidade de `ipro.transactions` passa de global para o escopo do lote: `(batch_id, source_file_id, source_row_hash)` e `(batch_id, business_event_hash)`;
- a chave primária da transação não muda; o IPRO deve gerar IDs distintos e conscientes da geração;
- a idempotência da geração continua em `ipro.ingestion_batches.idempotency_key`; a aplicação deriva essa chave do conteúdo e do `processing_fingerprint`, fazendo a mesma combinação reencontrar o mesmo lote e uma combinação nova criar outro lote;
- não há unique ou índice somente em `processing_fingerprint`: o mesmo fingerprint de transformação pode ser válido para conteúdos, períodos e escopos distintos;
- a migration não supersede lotes, não cria triggers e não reescreve clientes. O cutover do repositório IPRO deve continuar em uma transação: marcar a geração anterior `SUPERSEDED` com `superseded_at`, marcar a nova `READY` com `completed_at` e então fazer `COMMIT`;
- `ipro.active_canonical_transactions` não é recriada porque a definição de `017` já exige lote `READY` e preserva os filtros de `data_scope`, resolução de cliente, resolução de produto, status canônico e status da origem. Antes do commit, leitores continuam vendo a geração anterior; depois do commit, veem somente a nova, sem janela de dupla contagem.

### Preflight obrigatório de colisões

Antes do rollout, executar estas consultas sobre o estado pós-`018`. Todas devem retornar zero linhas. Elas projetam o mesmo escopo que o backfill da `019` usará:

```sql
WITH projected_products AS (
  SELECT pe.*,
         REGEXP_REPLACE(
           REGEXP_REPLACE(metadata->>'represented_company_stable_id', '^[[:space:][:cntrl:]]+', ''),
           '[[:space:][:cntrl:]]+$', ''
         ) AS candidate_id
  FROM ipro.product_entities AS pe
), canonical_products AS (
  SELECT pp.*,
         CASE
           WHEN candidate_id = '' OR candidate_id ~ '[[:space:][:cntrl:]]' THEN NULL
           ELSE candidate_id
         END AS stable_id
  FROM projected_products AS pp
), product_keys AS (
  SELECT key_type, key_value,
         COALESCE(stable_id, represented_company, '') AS stable_scope
  FROM canonical_products
  CROSS JOIN LATERAL (
    VALUES ('sku', sku), ('product_code', product_code)
  ) AS keys(key_type, key_value)
  WHERE key_value IS NOT NULL
)
SELECT key_type, key_value, stable_scope, COUNT(*) AS collision_count
FROM product_keys
GROUP BY key_type, key_value, stable_scope
HAVING COUNT(*) > 1;

WITH projected_aliases AS (
  SELECT pa.*,
         REGEXP_REPLACE(
           REGEXP_REPLACE(pa.metadata->>'represented_company_stable_id', '^[[:space:][:cntrl:]]+', ''),
           '[[:space:][:cntrl:]]+$', ''
         ) AS alias_candidate_id,
         REGEXP_REPLACE(
           REGEXP_REPLACE(pe.metadata->>'represented_company_stable_id', '^[[:space:][:cntrl:]]+', ''),
           '[[:space:][:cntrl:]]+$', ''
         ) AS entity_candidate_id
  FROM ipro.product_aliases AS pa
  JOIN ipro.product_entities AS pe ON pe.id = pa.product_entity_id
), canonical_aliases AS (
  SELECT projected_aliases.*,
         CASE
           WHEN alias_candidate_id = '' OR alias_candidate_id ~ '[[:space:][:cntrl:]]' THEN NULL
           ELSE alias_candidate_id
         END AS alias_stable_id,
         CASE
           WHEN entity_candidate_id = '' OR entity_candidate_id ~ '[[:space:][:cntrl:]]' THEN NULL
           ELSE entity_candidate_id
         END AS entity_stable_id
  FROM projected_aliases
)
SELECT source_type, alias_type,
       COALESCE(alias_stable_id, entity_stable_id, represented_company, '') AS stable_scope,
       COALESCE(normalized_value, '') AS normalized_value,
       COALESCE(safe_hash, '') AS safe_hash,
       COUNT(*) AS collision_count
FROM canonical_aliases
GROUP BY source_type, alias_type, stable_scope,
         COALESCE(normalized_value, ''), COALESCE(safe_hash, '')
HAVING COUNT(*) > 1;
```

Se houver resultado, pausar o rollout e resolver a divergência de identidade com evidência de domínio; não mesclar nem apagar linhas automaticamente. A própria migration define uma única função canônica imutável, normaliza IDs com controles apenas nas bordas e valores compostos somente por whitespace/controle antes das constraints, repete a preflight e cria os índices com essa mesma função. Whitespace/controle interno preexistente permanece inválido e faz a constraint abortar a migration em vez de alterar identidade silenciosamente. Colisão levanta `IPRO_019_STABLE_SCOPE_COLLISION` antes de remover os índices legados. Como o runner canônico executa cada arquivo em transação, a falha reverte função, colunas, backfills, constraints e alterações de índice e não registra a `019` em `schema_migrations`.

### Rollout, compatibilidade e forward-fix

1. Usar somente `npm run db:migrate`; não aplicar o SQL manualmente em ambiente compartilhado.
2. Confirmar backup/restore e executar a preflight acima.
3. Aplicar em janela controlada e confirmar `019_ipro_controlled_reprocessing.sql` em `schema_migrations`.
4. Executar `npm run db:migrate` novamente; o resultado esperado com esta árvore é `0 applied, 19 skipped`.
5. Fazer o primeiro reprocessamento com a aplicação IPRO usando seu cutover transacional já existente; não adicionar trigger de banco.
6. Reconciliar contagens da view antes/depois: apenas uma geração `READY` deve contribuir para `active_canonical_transactions`.

Em ambiente compartilhado, preferir forward-fix. Restaurar a unicidade global após existirem gerações repetidas bloquearia ou exigiria apagar histórico válido. A coluna e a constraint de fingerprint, os campos estáveis e os índices nomeados são reaplicáveis, mas o checksum do runner impede editar silenciosamente uma migration já registrada. Qualquer correção futura deve preservar `source_files`, IDs históricos e lotes `SUPERSEDED`; não fazer deduplicação destrutiva para simular rollback.

### Prova PostgreSQL descartável

```bash
IPRO_REPROCESSING_TEST_DATABASE_URL=postgresql://test_user:test_password@127.0.0.1:5432/ipro_reprocessing_test \
  npx vitest run tests/iproReprocessingMigration.integration.spec.js
```

O teste aceita somente a variável dedicada, host local e database com nome `ipro_reprocessing_test`/`ipro_reprocessing_ci`; não consulta `DATABASE_URL`, remove apenas o schema `ipro` e `schema_migrations` dentro desse database descartável e permanece skipped sem a variável. Ele cobre normalização de legado com controles; rejeição de `represented_company_id` vazio, space-only, tab-only, newline-only, carriage-return-only, form-feed, vertical-tab, padded e controle interno nas três tabelas; unicidade do fallback textual por SKU e alias; fingerprint; unicidade por lote; origem imutável; rollback por colisão; e cutover observado por uma segunda conexão. O workflow `.github/workflows/ipro-migration-019.yml` provisiona PostgreSQL 16 sem secrets, executa typecheck/testes, aplica o runner canônico duas vezes e roda a integração em banco descartável.

## 13) IPRO 020 — atestação canônica de recuperação órfã

`020_ipro_orphan_recovery_audit.sql` é propriedade do ARCO-ERP e cria a trilha de auditoria imutável, o contrato de papel runtime e o único writer de recuperação. A tabela tem o contrato consumido pelo runtime IPRO: `action`, `reason`, `actor`, `request_id`, `recovery_mode`, `recovery_version`, `manifest_hash`, `object_receipt` e `eligible_at`. Permite exclusivamente `LEGACY_ORPHAN_ATTESTED`, `RECOVERY_CLAIMED`, `RECOVERY_COMPLETED`, `RECOVERY_BLOCKED` e `RECOVERY_FAILED`; resultados podem omitir os hashes, mas a atestação exige ambos. Não cria nem altera relações runtime do IPRO (`workflow_status`, objetos importados ou eventos de ativação), nem concede privilégios a papel desconhecido.

A atestação única do lote legado `import_597ce7ad1da070861b95fc7e` só ocorre quando o contrato runtime já existente é compatível e o lote está exatamente em `PROCESSING`, `AGUARDANDO_CONFIRMACAO`, `operational`, `ipro_production_upload`, com chave de confirmação válida, manifest SHA-256 e snapshot de preview de dois arquivos. Exige exatamente dois objetos `STAGED` sem `source_file_id`, bytes/hash/tamanho e metadata congruentes com o manifest, e ausência de source files, registry, transactions, resolutions, calculation, errors e ativação/rollback. A migration bloqueia o lote e os objetos antes de observar essa prova. O recibo imutável compatível com IPRO é `SHA256(UTF8('ipro.orphan_recovery.object_receipt.v1' + LF + hash1 + LF + hash2))`, com objetos ordenados por `created_at,id`.

`pgcrypto` só é criado/verificado se as condições prévias exigirem validação dos bytes e cálculo do recibo. Antes de atestar, a migration recompõe o SHA do manifesto com a serialização canônica exata de `ProductionImportService` (`json.dumps(..., ensure_ascii=True, sort_keys=True)`); hash divergente é no-op de atestação. Schema limpo sem runtime IPRO é um no-op de atestação; contrato runtime parcial ou com tipos incompatíveis falha com `IPRO_020_RUNTIME_CONTRACT_INVALID`.

O contrato `ipro.import_recovery_runtime_role_contract` começa `PENDING`. Depois de diagnóstico autorizado, um operador deve registrar um papel runtime nominal existente e não privilegiado por `ipro.register_import_recovery_runtime_role(name)`. O bind recusa superuser/roles administrativos e concede somente `USAGE` no schema, `SELECT` nos eventos para atestação/readiness e `EXECUTE` em `ipro.append_import_recovery_outcome(...)`. Não há `INSERT`, `UPDATE`, `DELETE`, DDL ou grant para `PUBLIC`; a função `SECURITY DEFINER` usa `search_path` seguro, aceita apenas os quatro outcomes e rejeita atestação legada/malformação. A migration é a única autora de `LEGACY_ORPHAN_ATTESTED`. Teste descartável: `IPRO_REPROCESSING_TEST_DATABASE_URL=postgresql://...@127.0.0.1:5432/ipro_reprocessing_test npx vitest run tests/iproOrphanRecoveryMigration.integration.spec.js`.

## 14) IPRO 021 — retirement of exceptional recovery ownership hardening

**Status: SUPERSEDED / RETIRED.** The exceptional orphan-recovery ownership-hardening path is retired because normal reimport was proven business-equivalent. `021_ipro_runtime_role_binding_hardening.sql` retains its filename and order as a deterministic `SELECT 1` no-op retirement record.

Migration 021 does not change ownership, roles, memberships, ACLs, the runtime contract, commercial data, or orphan state. Its first canonical-runner execution records only its own filename/checksum in `schema_migrations`; the second execution skips it after checksum validation. Migration 020 remains immutable and its checksum and all audit-contract coverage remain required.

**Next gate:** perform normal reimport from the preserved staged source bytes and reconcile the resulting 730 events. No exceptional recovery execution, database repair, or IPRO runtime change is authorized by this retirement.
