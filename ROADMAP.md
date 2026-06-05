# ROADMAP — ARCO-ERP V1 Operacional

> Última atualização: 2026-06-03  
> Dono operacional: Atlas  
> Dono da prioridade executiva: Toni  
> Fonte funcional canônica: `docs/SPEC.md` + `docs/DECISION-FLOW-CANON.md`  
> Fonte de descoberta visual local: `erp_app_flow_map.html` (não versionar neste gate)

## 0) Papel deste arquivo

Este `ROADMAP.md` é o mecanismo canônico de **slicing, sequência, gates e controle de risco** da V1 do ARCO-ERP.

Ele não substitui a SPEC e não é diário de sessão:

- contrato de produto e invariantes: `docs/SPEC.md`;
- decisão de direção da V1: `docs/DECISION-FLOW-CANON.md`;
- estado de retomada de sessão: `START.md`;
- evidências de validação/release: `docs/TEST-AND-RELEASE-GATE.md`.

## 1) Decisão de produto vigente

A V1 do ARCO-ERP é **operacional completa**, não MVP mínimo e não “pedido simples”.

Fluxo comercial alvo da V1:

```txt
cliente completo
-> produto completo
-> tabela de preço
-> condições de pagamento
-> orçamento salvo e numerado
-> pedido confirmado e numerado
-> emissão visual/imprimível/compartilhável
-> comunicação registrada como evento/badge
-> Registro Operacional de Faturamento
-> alteração auditada por perfil
-> relatórios/listagens operacionais
```

Escopo obrigatório da V1:

- cadastro completo de clientes, incluindo contatos e endereços;
- cadastro completo de produtos;
- tabela de preços;
- condições de pagamento;
- orçamento salvo e numerado (`ORC-####`);
- pedido confirmado e numerado (`PED-####`);
- emissão visual/imprimível/compartilhável;
- comunicação como evento/badge, nunca `commercial_status`;
- Registro Operacional de Faturamento manual;
- alteração de pedido confirmado por perfil autorizado;
- alteração de pedido faturado por `ADMIN`;
- revisão/auditoria obrigatória;
- RBAC operacional;
- relatórios/listagens operacionais.

Fora de escopo da V1 sem decisão futura explícita:

- NF-e;
- SEFAZ;
- gateway de pagamento;
- boleto automático;
- conciliação automática;
- emissão fiscal real;
- integrações externas obrigatórias;
- CRM avançado/agenda;
- fluxo de caixa avançado;
- perfil `VISUALIZADOR`.

## 2) Desalinhamentos corrigidos por este roadmap

O roadmap anterior estava desalinhado com o Gate 0 por quatro motivos:

1. falava em “MVP operacional” e “P2 Frontend/UX” de forma vaga;
2. tratava a próxima fase como evolução visual após backend, sem consolidar cliente/produto/preço/pagamento;
3. não bloqueava explicitamente implementação antes de Data Model + RBAC/Audit + API Contracts;
4. usava “faturamento simples” em vez de **Registro Operacional de Faturamento**.

Correção adotada:

- manter a ambição funcional completa da V1;
- fatiar execução por dependências reais;
- bloquear implementação técnica até contratos documentais passarem pelos gates corretos;
- separar visão de produto de slices de execução.

## 3) Estado factual já entregue

### Já concluído e mergeado em `main`

- Sprint 0, Sprint 1 e Sprint 2.
- Sprint 3 (Slices 1–5).
- Etapa 5 — fluxo operacional inicial de orçamento.
- Etapa 6 — conversão orçamento -> pedido.
- Etapa 7 — comunicação como `output_event`.
- Etapa 8 — ciclo de pedido com revisão/cancelamento/auditoria inicial.
- Etapa 9 — Registro Operacional de Faturamento inicial / preparação fiscal sem escopo fiscal real.
- Fechamento técnico P0+P1 — persistência real + API HTTP mínima (PR #25).
- P1.5 Supabase Runtime Readiness / DB Smoke (PR #28).

### Concluído nesta frente documental

- Gate 0 — direção V1 operacional completa: `docs/DECISION-FLOW-CANON.md`.
- Reorientação mínima da SPEC para V1 operacional: `docs/SPEC.md`.
- ROADMAP Alignment: este documento.
- Gate A — Screen Flow Canon + SPEC Consolidation: PASS.
- Gate B — Data Model Decision: PASS.
- Gate C — RBAC + Audit Model: PASS.
- Gate D — API Contract Alignment: PASS.
- Gate E — Frontend Contract + Shell Plan: PASS.
- Gate F — Migration Plan + Test Strategy: **PASS**, commitado em `406e043` com:
  - `docs/MIGRATION-PLAN-OPS.md`;
  - `docs/TEST-STRATEGY-OPS.md`.

### Observação importante

As entregas técnicas anteriores continuam válidas como foundation, mas **não são suficientes** para declarar V1 operacional completa. A V1 agora exige consolidação de cliente, produto, preço, pagamento, RBAC/auditoria, data model, contratos, frontend e testes conforme as fases abaixo.

## 4) Regra de execução e bloqueio

### Regra principal

Nenhuma implementação nova de banco, migrations, API, backend, frontend ou telas pode iniciar antes do gate documental imediatamente anterior estar `PASS`.

### Bloqueios absolutos

Retornar `Blocked` se houver tentativa de:

1. alterar banco/migrations antes do **Gate B — Data Model Decision**;
2. alterar API contracts antes do **Gate D — API/RBAC Contract Alignment**;
3. iniciar frontend antes do **Gate E — Frontend Contract & Shell Plan**;
4. implementar fluxo cliente/produto/preço/pagamento antes de Data Model + API/RBAC passarem;
5. tratar comunicação como `commercial_status`;
6. tratar pedido confirmado/faturado como mutação livre sem revisão;
7. empurrar cliente completo, produto completo, tabela de preço, condições de pagamento, RBAC, auditoria ou faturamento operacional para futuro por conveniência técnica;
8. versionar ou editar `erp_app_flow_map.html` sem gate explícito.

## 5) Sequência executável da V1

## Gate A — Screen Flow Canon + SPEC Consolidation

**Tipo:** documental  
**Status:** próximo gate recomendado  
**Dependências:** Gate 0 (`docs/DECISION-FLOW-CANON.md`) + `docs/SPEC.md`

### Objetivo

Converter a descoberta visual do `erp_app_flow_map.html` em markdown canônico revisável, sem versionar nem alterar o HTML.

### Escopo

- Criar `docs/SCREEN-FLOW-MAP.md`.
- Mapear módulos, telas, ações primárias, dados obrigatórios, navegação e fora de escopo.
- Sincronizar `docs/SPEC.md` apenas onde houver regra de produto, evitando duplicidade pesada.
- Marcar explicitamente o que é V1 obrigatório e o que é futuro.

### Critério de entrada

- Gate 0 aprovado.
- `docs/SPEC.md` aponta para V1 operacional completa.
- `erp_app_flow_map.html` disponível apenas como insumo local.

### Critério de saída

- `docs/SCREEN-FLOW-MAP.md` aprovado como fonte canônica de telas/fluxos.
- Nenhum conflito com `docs/SPEC.md` e `docs/DECISION-FLOW-CANON.md`.
- Nenhuma alteração técnica.

### Bloqueios

- Não criar migrations.
- Não alterar API.
- Não implementar tela.

## Gate B — Data Model Decision

**Tipo:** decisão técnica documental  
**Dependências:** Gate A

### Objetivo

Decidir o modelo de dados da V1 operacional completa antes de qualquer migration.

### Escopo

- Atualizar `docs/DATA-MODEL-OPS.md`.
- Criar/atualizar decisão técnica de dados (ex.: `docs/DECISION-DATA-MODEL-OPS.md`).
- Comparar opções:
  1. `commercial_documents` expandido;
  2. `quotes`/`orders` separados;
  3. modelo híbrido: documento comercial + itens/parcelas/eventos relacionais.
- Definir snapshot comercial obrigatório:
  - cliente;
  - contato;
  - endereço;
  - produto;
  - preço/tabela;
  - condição de pagamento;
  - parcelas/vencimentos;
  - ator e momento da confirmação.

### Critério de entrada

- `docs/SCREEN-FLOW-MAP.md` aprovado.
- SPEC sem conflito sobre status, numeração, snapshot, faturamento operacional e editabilidade.

### Critério de saída

- modelo escolhido e justificativa registrada;
- entidades V1 listadas;
- snapshots e revisões especificados;
- riscos de migração e compatibilidade registrados;
- nenhuma migration aplicada.

### Bloqueios

- Sem decisão de dados `PASS`, qualquer migration ou persistência nova é `Blocked`.

## Gate C — RBAC + Audit Model

**Tipo:** contrato funcional/técnico documental  
**Dependências:** Gate B

### Objetivo

Fechar permissões, negações, auditoria e revisão antes de contratos de API e frontend.

### Escopo

- Atualizar `docs/RBAC-MATRIX.md`.
- Definir matriz por ação e perfil para:
  - cliente;
  - produto;
  - tabela de preço;
  - condição de pagamento;
  - orçamento;
  - pedido confirmado;
  - pedido faturado;
  - Registro Operacional de Faturamento;
  - relatórios/listagens;
  - usuários/acesso.
- Definir eventos/revisões obrigatórios:
  - antes/depois;
  - ator;
  - perfil;
  - motivo;
  - data/hora;
  - impacto em valor/vencimento/status.

### Critério de entrada

- modelo de dados decidido;
- escopo de snapshot e revisão definido.

### Critério de saída

- permissões Allow/Deny por perfil e ação;
- ações críticas com motivo obrigatório;
- negações explícitas para REPRESENTANTE;
- requisitos de auditoria validados contra SPEC.

### Bloqueios

- Sem RBAC/Audit `PASS`, API e frontend devem permanecer `Blocked` para ações críticas.

## Gate D — API Contract Alignment

**Tipo:** contrato técnico documental  
**Dependências:** Gate B + Gate C

### Objetivo

Alinhar contratos API à V1 operacional completa sem implementar código.

### Escopo

- Atualizar `docs/API-CONTRACTS.yaml`.
- Atualizar `docs/SPEC-OPS-ADDENDUM.md` com cenários GWT da V1.
- Cobrir endpoints/contratos para:
  - clientes, contatos e endereços;
  - produtos;
  - tabela de preço;
  - condições de pagamento;
  - orçamento steps 1–4;
  - confirmação de pedido;
  - comunicação/output events;
  - Registro Operacional de Faturamento;
  - alteração pós-confirmação/faturamento;
  - listagens e relatórios operacionais.

### Critério de entrada

- Data Model `PASS`;
- RBAC/Audit `PASS`.

### Critério de saída

- contratos compatíveis com modelo de dados e RBAC;
- erros 401/403/409/422 definidos;
- idempotência definida para ações críticas;
- nenhum endpoint contradiz `commercial_status` canônico.

### Bloqueios

- Sem API Contract `PASS`, backend e frontend não podem implementar fluxos novos.

## Gate E — Frontend Contract & Shell Plan

**Tipo:** plano frontend/documental  
**Dependências:** Gate A + Gate D

### Objetivo

Planejar shell, navegação e UX de V1 sem implementar telas.

### Escopo

- Definir rotas/áreas de navegação.
- Definir layout mínimo: login, home, clientes, produtos, preços, pagamento, pedidos, faturamento, relatórios, configurações.
- Definir estados visuais derivados:
  - `commercial_status` oficial;
  - badges de comunicação;
  - revisão/auditoria;
  - permissões por perfil.
- Definir estratégia de testes frontend antes de codar.

### Critério de entrada

- Screen Flow canônico aprovado;
- API/RBAC contracts aprovados.

### Critério de saída

- plano de frontend fatiado por PRs;
- nenhum estado visual contradiz SPEC;
- ações críticas com confirmação e permissão definidas.

### Bloqueios

- Sem Gate E, qualquer implementação de tela é `Blocked`.

## Gate F — Migration Plan + Test Strategy

**Tipo:** plano técnico/documental  
**Dependências:** Gate B + Gate C + Gate D  
**Status:** ✅ PASS — commit `406e043`

### Objetivo

Planejar migrations e testes antes de tocar no banco.

### Escopo

- Definir sequência de migrations.
- Definir compatibilidade com foundation atual.
- Definir rollback/forward-fix por migration.
- Definir suíte mínima:
  - unit tests;
  - integration tests;
  - smoke DB;
  - API contract tests;
  - RBAC negative tests;
  - frontend smoke quando aplicável.

### Critério de entrada

- Data Model, RBAC e API contracts aprovados.

### Critério de saída

- plano de migration revisável;
- cobertura mínima por fase definida;
- riscos de dados existentes documentados;
- nenhuma migration executada neste gate.

### Evidência de fechamento

- `docs/MIGRATION-PLAN-OPS.md`
- `docs/TEST-STRATEGY-OPS.md`
- Commit: `406e043 docs(erp): define migration plan and test strategy`

### Bloqueios

- Sem Gate F, qualquer migration é `Blocked`.

## Gate G — Backend/Data Foundation Implementation

**Tipo:** implementação técnica em andamento
**Dependências:** Gate F
**Status:** iniciado — PRs iniciais mergeados até `86836dd`

### Objetivo

Implementar fundação de dados e backend para V1 operacional, sem frontend completo.

### Escopo executivo provável

- ✅ ORC→PED canônico sem mutação destrutiva do ORC;
- ✅ migration runner com `schema_migrations`, checksum SHA-256, skip e advisory lock;
- migrations aprovadas;
- repositórios/serviços para clientes, produtos, preços, pagamentos, documentos comerciais, revisões e eventos;
- smoke DB real;
- testes de regressão para status, snapshot, revisão e RBAC.

### Evidência já mergeada

- PR #31 — `Gate G: backend/data foundation for quote-to-order and migrations`.
- Merge commit: `6d7cd19`.
- PR #33 — `Gate G: add security tenant roles audit foundation`.
- Merge commit: `86836dd`.
- Commits técnicos:
  - `e78a724 feat(erp): align quote to order conversion foundation`;
  - `13c1b5e fix(erp): track applied database migrations`;
  - `63593d0 feat(erp): add security tenant roles audit foundation`.
- Validações registradas:
  - `npm run typecheck` PASS;
  - `npm run test` PASS — 94/94;
  - `npm run db:migrate` PASS/SKIP;
  - 2ª execução `npm run db:migrate` PASS/SKIP;
  - `npm run test:smoke:db` PASS;
  - `git diff --check` PASS.

### Próximos slices recomendados

**PR documental — represented companies decision**.

Registrar a decisão canônica de representadas antes de novas mudanças estruturais de documento/produto/preço.

**Gate G PR4 — Bind commercial documents to environment tenant**.

Escopo a declarar antes de editar:

- `APP_TENANT_ID`;
- bootstrap/seed do tenant de ambiente;
- ORC nasce com tenant do ambiente;
- PED herda tenant do ORC;
- backfill/compatibilidade para `commercial_documents.tenant_id`;
- FK/índice quando seguro.

**Gate G PR5 — represented companies foundation**.

Escopo a declarar antes de editar:

- `represented_companies`;
- `represented_company_id` em documentos comerciais quando aplicável;
- ORC/PED da Arco com uma única representada;
- PED herdando representada do ORC;
- bloqueio de item/produto/tabela/condição comercial de representada diferente.

### Critério de saída

- `npm run typecheck` PASS;
- `npm run test` PASS;
- smoke DB PASS quando ambiente existir;
- revisão SPEC x diff;
- revisão da decisão `docs/DECISION-REPRESENTED-COMPANIES.md` quando representada estiver no escopo;
- nenhum escopo fiscal avançado introduzido.

## Gate H — API Implementation Slices

**Tipo:** implementação técnica futura  
**Dependências:** Gate G

### Objetivo

Implementar API por fatias funcionais sem quebrar contratos.

### Slices mínimos

1. clientes/contatos/endereços;
2. produtos/tabela de preço;
3. condições de pagamento/parcelas;
4. orçamento steps 1–4;
5. confirmação de pedido;
6. comunicação/output events;
7. Registro Operacional de Faturamento;
8. revisão/auditoria pós-confirmação/faturamento;
9. listagens/relatórios operacionais.

### Critério de saída por slice

- contrato API coberto;
- RBAC positivo e negativo;
- snapshot/revisão quando aplicável;
- testes automatizados;
- sem expansão fiscal.

## Gate I — Frontend Shell + Operational Flow Implementation

**Tipo:** implementação frontend futura  
**Dependências:** Gate E + Gate H parcial conforme slice

### Objetivo

Implementar frontend V1 por fluxo operacional, sem reduzir escopo de produto.

### Slices mínimos

1. shell/autenticação/home;
2. clientes completos;
3. produtos e tabela de preço;
4. condições de pagamento;
5. orçamento steps 1–4;
6. confirmação e detalhe do pedido;
7. emissão visual/impressão/compartilhamento;
8. Registro Operacional de Faturamento;
9. revisão/auditoria visível;
10. listagens/relatórios operacionais;
11. configurações/RBAC visível.

### Critério de saída por slice

- fluxo coerente com `docs/SCREEN-FLOW-MAP.md`;
- nenhum badge visual vira `commercial_status`;
- ações bloqueadas/permitidas conforme RBAC;
- estados loading/empty/error definidos;
- validação manual e automatizada registrada.

## Gate J — V1 Release Readiness

**Tipo:** validação/release futura  
**Dependências:** Gates G/H/I completos

### Objetivo

Validar a V1 operacional completa end-to-end antes de qualquer release/deploy.

### Critérios de aceite

- cliente completo -> orçamento -> pedido -> comunicação -> faturamento operacional funciona;
- pedido confirmado e faturado aceitam alterações apenas por perfil autorizado;
- toda alteração crítica gera revisão auditável;
- snapshot preserva verdade histórica;
- relatórios/listagens refletem estados e eventos corretos;
- comandos de validação obrigatórios PASS;
- riscos residuais registrados com owner.

## 6) Dependências por camada

| Camada | Depende de | Libera |
| --- | --- | --- |
| SPEC/Screen Flow | Gate 0 | Data Model, Frontend Plan |
| Data Model | SPEC/Screen Flow | RBAC, API, Migration Plan |
| RBAC/Audit | Data Model | API, Frontend, Tests |
| API Contracts | Data Model + RBAC | Backend/API implementation |
| Frontend Plan | Screen Flow + API/RBAC | Frontend implementation |
| Test Strategy | Data Model + API/RBAC | Migrations/backend/frontend execution |
| Migrations | Migration Plan PASS | Backend data foundation |

## 7) Gates obrigatórios por fase

Cada gate só pode passar com:

1. escopo explícito;
2. fora de escopo explícito;
3. critérios de entrada atendidos;
4. critérios de saída atendidos;
5. riscos residuais listados;
6. arquivos alterados restritos ao gate;
7. validação aplicável registrada;
8. revisão de consistência contra `docs/SPEC.md` e `docs/DECISION-FLOW-CANON.md`.

Para gates técnicos, adicionar:

- `npm run typecheck`;
- `npm run test`;
- smoke DB quando houver banco real;
- revisão SPEC/API/RBAC x diff.

## 8) Anti-escopo e proteção de no-regression

É proibido:

1. reduzir V1 para “pedido simples”;
2. empurrar cliente completo, produto completo, tabela de preço, condições de pagamento, RBAC, auditoria ou faturamento operacional para futuro;
3. implementar frontend sem API/RBAC/data model aprovado;
4. implementar migrations sem plano de migration/testes aprovado;
5. transformar comunicação em status comercial;
6. editar pedido confirmado/faturado sem revisão auditável;
7. introduzir NF-e, SEFAZ, gateway, boleto automático ou conciliação sem decisão futura explícita;
8. misturar SAGRADO-PEDIDOS como base funcional acoplada;
9. versionar `erp_app_flow_map.html` neste ciclo.

## 9) Próximo gate recomendado

Continuar **Gate G — Backend/Data Foundation Implementation** pelo próximo slice técnico.

Menor próximo passo seguro:

1. preparar escopo técnico do **Gate G PR 3 — security/tenant/roles/audit base**;
2. revisar `docs/MIGRATION-PLAN-OPS.md`, `docs/RBAC-MATRIX.md`, `docs/AUDIT-MODEL-OPS.md` e `docs/TEST-STRATEGY-OPS.md`;
3. declarar migrations, adapters, serviços e testes previstos antes de editar código;
4. manter `erp_app_flow_map.html` não versionado e fora do gate;
5. não criar migration funcional nova sem escopo e validação do migration runner.

## 10) Critério para iniciar implementação técnica

Implementação técnica só pode iniciar quando, no mínimo, estes gates estiverem `PASS`:

1. Gate A — Screen Flow Canon + SPEC Consolidation;
2. Gate B — Data Model Decision;
3. Gate C — RBAC + Audit Model;
4. Gate D — API Contract Alignment;
5. Gate F — Migration Plan + Test Strategy.

Frontend só pode iniciar quando Gate E também estiver `PASS`.

Gates A–F estão em PASS e Gate G inicial foi integrado. Próximos slices técnicos continuam exigindo escopo explícito, branch fora de `main`, validação local e smoke DB quando `DATABASE_URL` existir.
