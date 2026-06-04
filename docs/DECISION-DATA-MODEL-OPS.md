# DECISION — Data Model Ops (ARCO-ERP V1)

> Status: Gate B — decisão estrutural documental
> Escopo: arquitetura operacional de dados da V1 completa
> Base normativa: `docs/SPEC.md`, `docs/DECISION-FLOW-CANON.md`, `docs/SCREEN-FLOW-MAP.md`, `ROADMAP.md`
> Não autoriza: migrations, código, API contracts, frontend ou alteração de banco

## 1) Objetivo do Gate B

Este documento decide a arquitetura de dados que sustenta a V1 operacional completa do ARCO-ERP.

Gate B não desenha migrations finais e não autoriza implementação. Ele fixa as escolhas estruturais que os próximos gates devem respeitar:

- Gate C — RBAC + Audit Model;
- Gate D — API Contract Alignment;
- Gate F — Migration Plan + Test Strategy;
- implementação futura de backend/API/frontend.

## 2) Decisão resumida

Arquitetura escolhida: **modelo híbrido relacional**.

Decisão:

- manter `commercial_documents` como núcleo comum para orçamento e pedido;
- modelar itens, parcelas/vencimentos, eventos, revisões, faturamento operacional e cadastros mestres em tabelas relacionais;
- usar snapshots explícitos nos documentos/itens/parcelas para preservar a verdade comercial;
- permitir alteração de pedido confirmado/faturado apenas por revisão auditável;
- impedir que alterações futuras de cliente, produto, preço ou condição alterem documentos já confirmados retroativamente;
- manter comunicação como `output_events`, não como `commercial_status`;
- tratar estoque como **informativo na V1 comercial**, não bloqueante, salvo gate futuro específico de estoque.

## 3) Alternativas avaliadas

### Alternativa A — `commercial_documents` expandido com JSONB amplo

Descrição:
- manter quase tudo dentro de `commercial_documents`, com itens, parcelas, eventos e revisões em JSONB.

Vantagens:
- menor esforço inicial;
- compatível com a foundation técnica atual;
- menos tabelas no curto prazo.

Rejeitada porque:
- dificulta filtros/listagens operacionais da V1;
- fragiliza auditoria de antes/depois;
- dificulta RBAC por ação/campo;
- dificulta relatórios por produto, cliente, preço, vencimento e faturamento;
- aumenta risco de mutações silenciosas em snapshots.

### Alternativa B — separar `quotes` e `orders` como agregados distintos

Descrição:
- criar entidades separadas para orçamento e pedido, com tabelas próprias para itens/eventos.

Vantagens:
- semântica explícita;
- facilita regras específicas de pedido;
- pode simplificar alguns contratos de API.

Rejeitada como caminho primário porque:
- duplica campos e tabelas parecidas;
- aumenta custo de conversão ORC -> PED;
- torna mais difícil manter histórico comum de documento comercial;
- pode gerar divergência entre orçamento e pedido em fases futuras.

### Alternativa C — modelo híbrido relacional

Descrição:
- `commercial_documents` representa o documento comercial comum (`quote` ou `order`);
- itens, parcelas, eventos, revisões e faturamento operacional ficam relacionais;
- snapshots são explícitos e versionáveis.

Escolhida porque:
- preserva a fundação atual;
- evita JSONB excessivo onde há consulta, auditoria e relatório;
- suporta ORC/PED no mesmo núcleo sem duplicar tudo;
- permite revisão/auditoria robusta;
- prepara API, RBAC, frontend e testes sem reduzir a V1.

## 4) Entidades propostas

### 4.1 Segurança, tenant e usuários

- `users` / `profiles`
- `roles`
- `user_roles`
- `tenant_memberships` ou equivalente

Finalidade:
- escopo por `tenant_id`;
- perfis `ADMIN` e `REPRESENTANTE` na V1;
- base para Gate C.

### 4.2 Clientes completos

- `customers`
- `customer_contacts`
- `customer_addresses`
- `customer_commercial_profiles`

Decisão:
- V1 deve suportar múltiplos contatos e múltiplos endereços.
- Deve haver indicação de contato principal e endereço principal/entrega.
- Condição comercial padrão e tabela de preço padrão ficam em perfil comercial do cliente.
- Cliente completo mínimo deve incluir tipo de documento, inscrição estadual quando aplicável, contato principal por campos diretos ou `customer_contacts`, e endereço estruturado para snapshot/faturamento operacional.

Risco mitigado:
- cliente completo sem contatos/endereços quebra comunicação, entrega e snapshot.

### 4.3 Produtos completos

- `products`
- `product_categories`
- `product_units`
- `product_statuses` ou enum equivalente

Decisão:
- produto deve ter SKU/código, descrição, marca, categoria, unidade/embalagem e status.
- produto deve prever atributos comerciais quando aplicáveis: código de barras, nome comercial/curto, quantidade mínima, múltiplo de venda, peso e dimensões.
- disponibilidade/estoque na V1 é informação comercial, não bloqueio transacional.

Estoque:
- status no Gate B: **informativo**;
- não modelar reserva, movimentação, inventário, produção ou expedição neste gate;
- se estoque bloqueante for desejado, abrir gate/módulo específico.

### 4.4 Tabela de preços

- `price_tables`
- `price_table_items`
- `customer_default_price_tables` ou vínculo no `customer_commercial_profiles`

Decisão:
- tabela de preço entra na V1;
- tabela deve ter vigência, status ativo/inativo e itens por produto;
- item de preço deve preservar valor base, moeda/unidade e metadados de aplicação;
- preço aplicado ao documento fica em snapshot no item comercial.

Regra crítica:
- alteração de tabela de preço nunca altera pedido/orçamento já confirmado retroativamente.
- vigências conflitantes para o mesmo `tenant_id + price_table_id + product_id` são proibidas, salvo regra explícita de faixa/volume;
- quando `applied_unit_price` divergir do preço de tabela, deve existir `price_override_reason` e `price_override_actor_id` no item ou revisão obrigatória equivalente.

### 4.5 Condições de pagamento e parcelas

- `payment_terms`
- `payment_term_installments`
- `commercial_document_payment_schedule`

Decisão:
- `payment_terms` é cadastro da condição;
- `payment_term_installments` define regra base de parcelas/prazos;
- `commercial_document_payment_schedule` registra as parcelas reais calculadas para o documento.

Regra crítica:
- condição de pagamento não é faturamento;
- vencimentos aplicados ao pedido devem ficar congelados em snapshot/relação própria.

### 4.6 Documento comercial comum

- `commercial_documents`

Representa orçamento e pedido.

Campos/conceitos obrigatórios:
- `id`;
- `tenant_id`;
- `document_type`: `quote|order`;
- `commercial_status`: `QUOTE_DRAFT|ORDER_CONFIRMED|INVOICED|CANCELED`;
- `document_number`: `ORC-####` ou `PED-####`;
- `source_quote_id` quando pedido nascer de orçamento;
- `customer_id`;
- `owner_id` / `representative_id`;
- timestamps de criação, confirmação, faturamento e cancelamento;
- snapshots principais ou referência para snapshots relacionais;
- versão/revisão atual.

Decisão:
- ORC e PED usam sequências distintas;
- ORC e PED usam o mesmo aggregate lógico `commercial_documents`;
- a confirmação ORC -> PED deve criar um novo registro `commercial_documents` com `document_type = order`, `document_number = PED-####` e `source_quote_id` apontando para o orçamento original;
- o orçamento original preserva `document_type = quote`, `document_number = ORC-####` e histórico próprio;
- o orçamento original recebe `lifecycle_event` de convertido quando aplicável;
- é proibida mutação destrutiva do ORC para transformá-lo em PED.

Nota para Gate F:
- definir detalhes físicos/transacionais da criação do PED, sem substituir a regra canônica por `update` destrutivo no ORC.

### 4.7 Itens comerciais

- `commercial_document_items`

Campos/conceitos obrigatórios:
- `commercial_document_id`;
- `product_id`;
- quantidade;
- unidade;
- preço base;
- preço aplicado;
- motivo/ator de override quando preço aplicado divergir da tabela;
- desconto/ajuste;
- motivo de ajuste quando aplicável;
- snapshot de produto;
- snapshot de preço/tabela;
- totais por item.

Decisão:
- itens são relacionais;
- snapshots de produto/preço ficam no item;
- alteração posterior de produto/preço não recalcula item confirmado sem revisão.

Regra de override:
- diferença entre preço de tabela e preço aplicado exige justificativa e ator no item ou revisão estruturada equivalente.

### 4.8 Snapshots comerciais

Snapshots mínimos:

- `customer_snapshot`;
- `contact_snapshot`;
- `address_snapshot`;
- `product_snapshot` por item;
- `price_snapshot` por item;
- `payment_snapshot`;
- `payment_schedule_snapshot`;
- `confirmation_snapshot` com ator/data.

Decisão:
- snapshot é preservação histórica;
- snapshot não impede correção posterior;
- correção posterior gera nova revisão com before/after.

Opções de persistência aceitas:
- colunas JSONB de snapshot versionado para dados congelados;
- snapshots normalizados auxiliares se Gate F justificar;
- nunca depender apenas do cadastro mestre atual.

### 4.9 Revisões administrativas

- `commercial_document_revisions`
- `commercial_document_revision_changes`

Campos/conceitos obrigatórios:
- documento;
- número sequencial da revisão;
- ator;
- perfil;
- motivo;
- observação;
- before_snapshot;
- after_snapshot;
- campos alterados;
- impacto em valor/vencimento/status;
- data/hora.

Decisão:
- pedido confirmado editável exige revisão;
- pedido faturado editável por `ADMIN` exige revisão;
- histórico não é editável.

Regra central:

```txt
Pedido é editável por permissão.
Histórico não é editável.
```

### 4.10 Eventos

#### `lifecycle_events`

Eventos de ciclo comercial:
- criado;
- confirmado;
- convertido;
- faturado operacionalmente;
- cancelado;
- revisado.

`ORDER_ADJUSTED` deve ser `lifecycle_events.event_type` quando a revisão alterar dado comercial relevante. O before/after permanece em `commercial_document_revisions` e `commercial_document_revision_changes`.

#### `output_events`

Eventos de comunicação/saída:
- `SEND_WHATSAPP`;
- `SEND_EMAIL`;
- `GENERATE_PDF`;
- `PRINT`;
- `COPY_LINK`;
- `SHARE`.

#### `audit_events`

Eventos de segurança/admin/auditoria:
- login/sessão quando relevante;
- alteração de permissão;
- tentativa negada;
- alteração crítica;
- exceção operacional.

Decisão:
- `output_events` nunca alteram `commercial_status`;
- `lifecycle_events` representam transições comerciais;
- `audit_events` representam rastreabilidade de segurança/governança;
- revisão administrativa pode gerar lifecycle event e audit event.

Fonte da verdade:
- `commercial_document_revisions` é a fonte de verdade do before/after comercial;
- `commercial_document_revision_changes` é o diff estruturado por campo;
- `audit_events` registra permissão, negação, falha e governança;
- `lifecycle_events` registra marcos narrativos do ciclo comercial;
- payloads não devem virar fonte concorrente para o mesmo fato.

### 4.11 Registro Operacional de Faturamento

- `invoice_operational_records`
- `invoice_operational_payment_schedule` ou vínculo com `commercial_document_payment_schedule`
- `invoice_operational_revisions` ou revisões via `commercial_document_revisions`

Decisão:
- faturamento operacional entra na V1;
- V1 permite um registro operacional de faturamento ativo por pedido;
- pode registrar referência/documento informado manualmente, data, valor, vencimentos e observação;
- correções geram revisão/auditoria, não múltiplos faturamentos concorrentes;
- faturamento parcial fica como decisão futura, salvo necessidade operacional formal;
- correção/cancelamento operacional exige `ADMIN` e revisão/auditoria;
- não modelar NF-e real, XML, DANFE obrigatório, SEFAZ, gateway, boleto automático ou conciliação.

### 4.12 Relatórios/listagens operacionais

O modelo deve permitir consultar:
- clientes e histórico;
- produtos vendidos/orçados;
- orçamentos por status/período;
- pedidos confirmados/faturados/cancelados;
- eventos de comunicação;
- faturamento operacional;
- alterações/revisões;
- vencimentos/parcelas;
- indicadores por representante quando aplicável.

## 5) Relações principais

- `customers` 1:N `customer_contacts`
- `customers` 1:N `customer_addresses`
- `customers` 1:1 `customer_commercial_profiles`
- `price_tables` 1:N `price_table_items`
- `products` 1:N `price_table_items`
- `payment_terms` 1:N `payment_term_installments`
- `customers` 1:N `commercial_documents`
- `commercial_documents` 1:N `commercial_document_items`
- `commercial_documents` 1:N `commercial_document_payment_schedule`
- `commercial_documents` 1:N `commercial_document_revisions`
- `commercial_document_revisions` 1:N `commercial_document_revision_changes`
- `commercial_documents` 1:N `lifecycle_events`
- `commercial_documents` 1:N `output_events`
- `commercial_documents` 0..1 `invoice_operational_records` ativo na V1
- `users/profiles` 1:N eventos/revisões como ator

Invariante multi-tenant:
- toda FK entre entidades com escopo de tenant deve respeitar o mesmo `tenant_id`;
- documento não pode referenciar cliente, produto, tabela de preço, condição de pagamento, item ou faturamento operacional de outro tenant;
- RLS/migrations/API devem validar esse invariante, não apenas confiar em filtros de tela.

## 6) ORC/PED e sequências

Decisão:

- `ORC-####` e `PED-####` têm sequências separadas;
- número de orçamento nasce quando orçamento é salvo com cliente válido;
- número de pedido nasce somente na confirmação;
- pedido nasce como novo registro vinculado ao orçamento de origem por `source_quote_id`;
- orçamento original permanece preservado como ORC histórico;
- data não deve ser parte semântica do número.

Implicação para Gate F:
- definir mecanismo transacional/idempotente de geração de número;
- garantir que dupla confirmação não gere dois pedidos.

## 7) Como impedir mutação retroativa

Regras:

- cadastro mestre pode mudar;
- documento confirmado não muda retroativamente;
- item confirmado mantém snapshot de produto/preço;
- condição e parcelas aplicadas ficam congeladas no documento;
- alteração autorizada cria revisão, não mutação silenciosa;
- relatórios devem poder explicar qual versão estava vigente no momento.

Riscos mitigados:
- pedido antigo mudando quando tabela de preço muda;
- cliente antigo mudando endereço/contato histórico;
- produto alterado mudando descrição/preço do pedido emitido;
- faturamento corrigido sem histórico.

Cancelamento:
- `CANCELED` em `commercial_status` cancela o documento comercial atual, interpretado junto com `document_type`, `canceled_at`, `cancel_reason`, `cancel_note` e `lifecycle_events`;
- cancelamento/correção de faturamento operacional não deve ser representado apenas por `commercial_status = CANCELED`; deve ocorrer por revisão/auditoria do registro operacional de faturamento.

## 8) Estoque/disponibilidade

Decisão Gate B:

- estoque/disponibilidade é **informativo** na V1 comercial;
- produto pode exibir disponibilidade/status;
- disponibilidade não bloqueia pedido por padrão;
- bloqueio por estoque exige gate futuro específico.

Justificativa:
- estoque bloqueante puxaria reserva, saldo, movimentação, inventário, produção e expedição;
- isso ampliaria a V1 para um módulo operacional distinto sem decisão formal.

## 9) Comissões e metas

Decisão Gate B:

- comissões/metas não bloqueiam o núcleo da V1;
- podem ser previstas como extensão comercial/reporting, sem contaminar cliente -> produto -> preço -> pedido -> faturamento operacional;
- não devem dirigir o modelo central do documento comercial.

Classificação:
- núcleo V1 obrigatório: dados necessários para pedido/faturamento/listagens;
- extensão comercial V1 opcional: indicadores derivados se não exigirem cadastros complexos;
- gate futuro: regras formais de comissão/meta por representada, campanha ou fábrica.

## 10) Implicações para próximos gates

### Gate C — RBAC + Audit Model

Deve definir:
- quem cria/edita clientes, produtos, preços, condições;
- quem confirma pedido;
- quem altera pedido confirmado;
- quem altera pedido faturado;
- quem registra/corrige faturamento operacional;
- quais ações exigem motivo;
- quais alterações geram revision changes e audit events.

### Gate D — API Contract Alignment

Deve derivar endpoints e contratos para:
- cadastros mestres;
- documentos comerciais;
- itens;
- parcelas;
- revisões;
- eventos;
- faturamento operacional;
- listagens/relatórios.

### Gate E — Frontend Contract & Shell Plan

Deve refletir:
- status oficial vs badges/eventos;
- permissões por ação;
- timeline/revisões;
- snapshots visíveis quando necessário;
- bloqueios de UI sem substituir RBAC de API.

### Gate F — Migration Plan + Test Strategy

Deve definir:
- ordem de migrations;
- compatibilidade com `commercial_documents` atual;
- estratégia para migrar JSONB existente, se necessário;
- testes de snapshots, revisões, eventos e idempotência.

## 11) Bloqueios antes de migrations

Antes de qualquer migration, precisam estar `PASS`:

1. Gate B — esta decisão;
2. Gate C — RBAC + Audit Model;
3. Gate D — API Contract Alignment;
4. Gate F — Migration Plan + Test Strategy.

Sem isso:
- migrations devem retornar `Blocked`;
- API implementation deve retornar `Blocked`;
- frontend implementation deve retornar `Blocked`.

## 12) Riscos e trade-offs

| Risco / trade-off | Impacto | Mitigação |
| --- | --- | --- |
| Mais tabelas que JSONB amplo | Mais esforço de migration/API | Necessário para V1 completa, relatórios e auditoria. |
| Núcleo `commercial_documents` pode ficar genérico demais | Ambiguidade ORC/PED | Restringir por `document_type`, status e invariantes da SPEC. |
| Snapshots em JSONB podem esconder mudanças | Auditoria fraca | Usar revision_changes relacionais para campos críticos. |
| Estoque informativo pode permitir pedido sem saldo | Risco operacional | Exibir alerta; gate futuro se estoque bloqueante for exigido. |
| Comissões/metas podem contaminar core | Overengineering | Tratar como extensão/reporting, não como base do documento. |
| Pedido faturado editável por ADMIN | Risco financeiro/auditoria | Revisão obrigatória + audit event + motivo + before/after. |

## 13) Critérios de aceite do Gate B

Gate B passa se:

1. arquitetura híbrida relacional for aceita como direção da V1;
2. entidades e relações mínimas estiverem listadas;
3. snapshots, revisões, lifecycle events, output events e audit events estiverem separados;
4. cliente completo, produto completo, preço, pagamento, pedido, faturamento operacional, RBAC e relatórios permanecerem suportados;
5. não houver migration, código, API contract ou frontend alterado;
6. próximos gates C/D/E/F tiverem impactos claros.

## 14) Próximo gate recomendado

Executar **Gate C — RBAC + Audit Model**.

Justificativa:
- o modelo de dados agora define onde ficam revisões, eventos, documentos, itens e cadastros;
- antes de API/migrations, é necessário decidir permissões, negações e auditoria por ação;
- sem Gate C, pedido confirmado/faturado editável e preço editável continuam perigosos.
