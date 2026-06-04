# Test and Release Gate — ARCO-ERP MVP

> Atualização operacional: a baseline mais recente em `main` inclui o PR #31 (`6d7cd19`) com Gate G inicial. Validações finais registradas: `npm run typecheck` PASS, `npm run test` PASS — 94/94, `npm run db:migrate` PASS/SKIP, 2ª execução `npm run db:migrate` PASS/SKIP, `npm run test:smoke:db` PASS e `git diff --check` PASS. A seção P1.5 abaixo permanece como histórico do gate anterior.

Status: **Sprints 0, 1 e 2 concluídas na `main` + Sprint 3 consolidada + Etapa 5 concluída (PR #14) + Etapa 6 concluída (PR #17) + Etapa 7 concluída (PR #19) + Etapa 8 concluída (PR #21) + Etapa 9 concluída (PR #23) + fechamento técnico P0+P1 (persistência real + API HTTP mínima) mergeado na `main` (PR #25)**
Objetivo: manter critérios de liberação e governança por gates explícitos, com foco em decisões de avanço por etapa sem pular gate.

## Premissas

- Este documento **não autoriza** implementação direta sem gate explícito do ciclo ativo.
- Gate de execução técnica depende do fechamento dos artefatos derivados da SPEC.
- SAGRADO-PEDIDOS permanece legado de consulta pontual.
- Hardening genérico sem requisito explícito da SPEC deve ser evitado.

## Suíte mínima de validação (documental)

1. **Fluxos críticos (GWT)**
   - Cobertura completa dos fluxos F-01..F-12 em `SPEC-OPS-ADDENDUM.md`.
2. **Contrato API MVP**
   - Endpoints críticos com erros e idempotência definidos.
3. **Integridade de dados + concorrência**
   - Regras transacionais e conflitos 409/422 explicitados.
4. **RBAC**
   - Matriz Allow/Deny fechada com casos de negação.
5. **Relatórios**
   - Dicionário dos 8 relatórios fechado com fontes/métricas/filtros.
   - Tolerância canônica e regra de exportação CSV validadas.

## Gate de prontidão para iniciar implementação

## Critérios obrigatórios (todos)
- [x] `docs/SPEC.md` atualizado com artefatos derivados.
- [x] `docs/SPEC-OPS-ADDENDUM.md` aprovado internamente.
- [x] `docs/API-CONTRACTS.yaml` aprovado internamente.
- [x] `docs/DATA-MODEL-OPS.md` aprovado internamente.
- [x] `docs/RBAC-MATRIX.md` aprovado internamente.
- [x] `docs/REPORTS-DICTIONARY.md` aprovado internamente.
- [x] Sem conflito entre estados, API, dados e RBAC.
- [x] Sem reintrodução de escopo proibido (NF-e/fiscal/gateway no MVP).
- [x] Ownership multi-tenant definido para REPRESENTANTE e exceções auditáveis.
- [x] Tolerância de divergência e classificação PASS/FAIL/BLOCKED definidas.
- [x] Taxonomia canônica de motivos de cancelamento/ajuste definida.
- [x] CSV definido como formato canônico de exportação no MVP.

## Critérios de bloqueio (qualquer um bloqueia)
- Lacuna High aberta em AC, RBAC, dados ou API.
- Falta de regra de concorrência para confirmação/cancelamento/faturamento.
- Contradição entre matriz RBAC e contratos API.
- Dependência de decisões do legado para comportamento do ARCO-ERP.

## Evidências mínimas para decisão Go/No-Go

1. Checklist preenchido com status por artefato.
2. Lista de riscos residuais com owner e prazo.
3. Registro de decisão final (Go/No-Go) em documento de decisão do projeto.

## Gate Sprint 1 Kickoff (pós-merge Sprint 0)

Status do gate: **PASS (kickoff pronto)**

### Evidências do gate

- Sprint 0 mergeada na `main` via PR `#2`.
- Validação pós-merge executada:
  - `npm run typecheck` PASS
  - `npm run test` PASS (16/16)
- Documentação de decisão e README alinhadas para o novo estado de fase.

### Limites mantidos

- Kickoff Sprint 1 **não** inicia implementação automaticamente.
- Início técnico depende de novo gate com escopo do primeiro slice, riscos e critérios de aceite.
- Sem ampliação de escopo além da SPEC v1.

## Aprovação interna por artefato (2026-05-28)

| Artefato | Status interno | Evidência resumida |
|---|---|---|
| `docs/SPEC-OPS-ADDENDUM.md` | Aprovado | Fluxos F-01..F-12 com GWT + erros esperados |
| `docs/API-CONTRACTS.yaml` | Aprovado | Endpoints críticos + erros + idempotência |
| `docs/DATA-MODEL-OPS.md` | Aprovado | Cardinalidade + integridade + concorrência |
| `docs/RBAC-MATRIX.md` | Aprovado | Matriz Allow/Deny + negações críticas |
| `docs/REPORTS-DICTIONARY.md` | Aprovado | 8 relatórios com fonte, métrica e filtros |

## Matriz de consistência cruzada

| Regra canônica | AC (GWT) | API | Dados | RBAC |
|---|---|---|---|---|
| 4 estados comerciais oficiais | F-01..F-12 | responses/status enum | princípios + constraints | mapeamento de estados |
| `ORDER_ADJUSTED` não é estado | F-08 | `/orders/{id}/adjust` | `order_revisions` + `lifecycle_events` | ação ADMIN dedicada |
| Comunicação não muda status | F-11 | `/output-events` | `output_events` | ação permitida sem transição |
| Cancelamento de pedido só ADMIN | F-06/F-07 | `/orders/{id}/cancel` | trilha de cancelamento | deny explícito para representante |
| Conversão única orçamento->pedido | F-03/F-04 | `/quotes/{id}/confirm` | `source_quote_id` único | fluxo de confirmação permitido |

## Riscos residuais (com owner e prazo)

| Risco residual | Severidade | Owner | Prazo |
|---|---|---|---|
| Decidir janela e estratégia de push/PR da sessão completa da Sprint 3 | Medium | Toni + Atlas | próxima sessão operacional |

## Histórico de fase anterior (Sprint 1 Kickoff)

- Kickoff Sprint 1 concluído => **pronto para solicitar gate do primeiro slice de implementação**.
- Implementação segue bloqueada até decisão formal subsequente em `DECISION_SPEC_APPROVAL.md`.

## Estado factual baseline (branch de trabalho)

- Sprint 1 concluída e mergeada na `main` (PRs #4, #5, #6).
- Sprint 2 concluída e mergeada na `main` (PRs #7 e #8).
- Sprint 3: Slices 1-5 concluídos localmente na branch de trabalho.
- Validação atual de baseline:
  - `npm run typecheck` PASS
  - `npm run test` PASS (50/50)

## Gate Etapa 5 — Fluxo operacional de orçamento (P0)

Status do gate: **PASS (mergeado em main)**

Evidências:
- PR de entrega: **#14**
- merge commit em `main`: **377c542c28e54865b5abd021178281d22aace7a9**
- correção de blocker de regressão (`updatedAt` em alteração isolada de `customerId`) incluída antes do merge
- validação pós-merge em `main`:
  - `npm run typecheck` PASS
  - `npm run test` PASS (58/58)

Escopo confirmado da Etapa 5:
- application use cases `createQuote` e `updateQuote`
- `QuoteRepository` + `InMemoryQuoteRepository`
- erros/result de aplicação
- testes de aplicação e fluxo in-memory

Fora de escopo mantido:
- sem conversão orçamento->pedido na nova camada
- sem criação de pedido/faturamento na Etapa 5
- sem API/frontend/banco real/migrations/integrações

Próxima regra de gate:
- **não iniciar Etapa 6 automaticamente**; avanço depende de nova autorização explícita.

## Gate Etapa 6 — Conversão orçamento -> pedido (P0)

Status do gate: **PASS (mergeado em main)**

Evidências:
- PR de entrega: **#17**
- merge commit em `main`: **25fc59ca4776b1198050ec94bbd44ff5d06f7e97**
- correção de contrato de entrada (`VALIDATION_ERROR`) incluída antes do merge final
- validação pós-merge em `main`:
  - `npm run typecheck` PASS
  - `npm run test` PASS (65/65)

Escopo confirmado da Etapa 6:
- `confirmQuoteUseCase` na camada application
- `OrderRepository` + `InMemoryOrderRepository`
- guarda de duplicidade por `source_quote_id` com `CONFLICT_ALREADY_CONFIRMED`
- negações críticas (tenant mismatch/ownership/documento inválido)
- testes F-03/F-04 e regressão

Fora de escopo mantido:
- sem frontend/API HTTP/banco real/migrations/fiscal
- sem implementação da Etapa 7/8

Próxima regra de gate:
- **não iniciar Etapa 7 automaticamente**; avanço depende de autorização explícita + gate de planejamento aprovado.

## Gate Etapa 7 — Comunicação do documento / output events (P1)

Status do gate: **PASS (mergeado em main)**

Evidências:
- PR de entrega: **#19**
- merge commit em `main`: **cd1a3d8e394659f465ca3f0612918a09402ae8f2**
- validação pós-merge em `main`:
  - `npm run typecheck` PASS
  - `npm run test` PASS (70/70)

Escopo confirmado da Etapa 7:
- `registerDocumentCommunicationUseCase` na camada application
- registro de `output_events` para quote e order
- garantias de não mutação de `commercial_status` em comunicação
- negações críticas para inexistente/tenant mismatch/entrada inválida

Fora de escopo mantido:
- sem frontend/API HTTP/banco real/migrations/fiscal
- sem integrações reais WhatsApp/e-mail/impressão/PDF
- sem implementação da Etapa 8

Próxima regra de gate:
- **não iniciar Etapa 8 automaticamente**; avanço depende de autorização explícita + gate de planejamento aprovado.

## Gate Etapa 8 — Fechamento de pedido (P0)

Status do gate: **PASS (mergeado em main)**

Evidências:
- PR de entrega: **#21**
- merge commit em `main`: **c6260de0d3ddbb5375f96ceb0cbc6ce193f551bc**
- validação pós-merge em `main`:
  - `npm run typecheck` PASS
  - `npm run test` PASS (77/77)

Escopo confirmado da Etapa 8:
- `cancelOrderUseCase` e `adjustOrderUseCase` na camada application
- fechamento de pedido com RBAC e trilha auditável
- negações críticas para inexistente/tenant mismatch/entrada inválida
- sem expansão para faturamento da Etapa 9

Fora de escopo mantido:
- sem frontend/API HTTP/banco real/migrations/fiscal
- sem implementação da Etapa 9

Próxima regra de gate:
- **não iniciar Etapa 9 automaticamente**; avanço depende de autorização explícita + gate de planejamento aprovado.

## Gate Etapa 9 — Faturamento simples (P1)

Status do gate: **PASS (mergeado em main)**

Evidências:
- PR de entrega: **#23**
- merge commit em `main`: **af75aa2164e49f22f7805317d4e50d6b6d4877a3**
- validação pós-merge em `main`:
  - `npm run typecheck` PASS
  - `npm run test` PASS (83/83)

Escopo confirmado da Etapa 9:
- `registerSimpleInvoiceUseCase` na camada application
- faturamento simples com transição controlada para `INVOICED`
- negações críticas para representante/inexistente/tenant mismatch
- sem integração fiscal real/NF-e

Fora de escopo mantido:
- sem frontend/API HTTP/banco real/migrations
- sem fiscal avançado, gateway/boleto/contas a receber completo

Próxima regra de gate:
- **não iniciar nova fase automaticamente**; avanço depende de autorização explícita + gate de planejamento da fase seguinte.

## Gate Fechamento técnico P0+P1 — Persistência real + API HTTP mínima

Status do gate: **PASS (mergeado em main)**

Evidências:
- PR de entrega: **#25**
- merge commit em `main`: **9985552**
- validação pós-merge em `main`:
  - `npm run typecheck` PASS
  - `npm run test` PASS (87/87)

Escopo confirmado:
- adapters Postgres para persistência de entidades do fluxo comercial
- migration inicial para banco real
- API HTTP mínima para operações essenciais
- cobertura de testes para persistência Postgres e API mínima

Fora de escopo mantido:
- sem frontend
- sem fiscal avançado / NF-e
- sem integrações externas reais

Próxima regra de gate:
- **não iniciar implementação P2 automaticamente**; avanço depende de autorização explícita + gate de planejamento P2 Frontend/UX.

## Gate Sprint 3 — SPEC-Led Domain Foundation Completion (fechamento)

Status do gate: **PASS_LOCAL_CLOSURE (Slice 5 concluído localmente)**

Direção canônica:
- seguir a SPEC como fonte de verdade;
- fechar apenas lacunas `REQUIRED_BY_SPEC`;
- manter escopo local ao domínio/testes;
- não avançar para fluxo operacional amplo antes da fundação exigida pela SPEC.

Próximo gate obrigatório:
- Decisão operacional de push/PR da sessão completa, mantendo governança de aprovação explícita.

## Checklist anti-overengineering (aplicado no fechamento da Sprint 3)

- [x] Somente lacunas REQUIRED_BY_SPEC e documentação de gate.
- [x] Sem expansão para frontend/API/banco/integrações.
- [x] Sem hardening genérico sem requisito explícito.
- [x] Sem criação de novos artefatos fora do escopo autorizado.
- [x] Sem inventar Slice 6 (não existe canonicamente nesta sprint).

Arquivo de retomada da próxima sessão:
- `START.md`

## Gate P1.5 — Supabase Runtime Readiness / DB Smoke (ponte P1 API -> P2 frontend)

Status do gate: **PASS** (mergeado em `main` via PR #28)

### Evidências de validação (post-merge em `main`)

| Validação | Resultado | Evidência |
|---|---|---|
| `npm run typecheck` | ✅ PASS | Branch `main` commit `4b0d322` |
| `npm run test` (89/89) | ✅ PASS | 8 test files, 89 tests, zero failures |
| `npm run test:smoke:db` (Supabase dev real) | ✅ PASS | Fluxo HTTP API → persistência Postgres Supabase real (635ms) |

### Escopo entregue

- README migrado de Postgres local → Supabase (bootstrap com env mínima)
- `.env.example` template seguro de DATABASE_URL (sem segredo)
- `.gitignore` protegendo `.env.local` e `.env.*.local`
- `npm run db:migrate` aplica migrations SQL no Supabase dev
- `npm run test:smoke:db` executa fluxo real (HTTP API + persistência Supabase)
- Contrato HTTP 503 canônico mantido para indisponibilidade de dependência
- Bug do upsert corrigido: `postgresOrderRepository.ts` agora sobrescreve `document_type`, `source_quote_id` e campos de conversão no `ON CONFLICT DO UPDATE SET`

### Fora de escopo (mantido)

- `erp_app_flow_map.html`: untracked, fora de commits
- `.env.local`: não versionado, DATABASE_URL nunca exposta
- P2 Frontend/UX: não iniciado (planning-only registrado)

### PRs do ciclo

| PR | Título | Status |
|---|---|---|
| #28 | `feat(p1.5): supabase runtime readiness with real db smoke and upsert fix` | ✅ Mergeado em `main` |

### Comandos de validação do gate

```bash
npm run typecheck
npm run test
npm run test:smoke:db    # requer DATABASE_URL no .env.local
```
