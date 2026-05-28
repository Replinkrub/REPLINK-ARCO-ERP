# Test and Release Gate — ARCO-ERP MVP (pré-código)

Status: **Sprints 0, 1 e 2 concluídas + Sprint 3 em planejamento SPEC-led (pré-implementação)**
Objetivo: manter critérios de liberação e governança para execução técnica por gates explícitos, com foco atual na Sprint 3 SPEC-led.

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
| Definir e aprovar o primeiro slice técnico da Sprint 1 com rollback e métricas | Medium | Toni + Atlas | 2026-05-30 |

## Resultado esperado desta fase

- Kickoff Sprint 1 concluído => **pronto para solicitar gate do primeiro slice de implementação**.
- Implementação segue bloqueada até decisão formal subsequente em `DECISION_SPEC_APPROVAL.md`.

## Estado factual pós Sprint 2

- Sprint 1 concluída e mergeada na `main` (PRs #4, #5, #6).
- Sprint 2 concluída e mergeada na `main` (PRs #7 e #8).
- Validação atual de baseline:
  - `npm run typecheck` PASS
  - `npm run test` PASS (39/39)

## Gate Sprint 3 — SPEC-Led Domain Foundation Completion (planejamento)

Status do gate: **PENDING_APPROVAL_FOR_IMPLEMENTATION**

Direção canônica:
- seguir a SPEC como fonte de verdade;
- fechar apenas lacunas `REQUIRED_BY_SPEC`;
- manter escopo local ao domínio/testes;
- não avançar para fluxo operacional amplo antes da fundação exigida pela SPEC.

Próximo gate obrigatório:
- Aprovar implementação da Sprint 3 na branch:
  - `feat/sprint3-spec-led-domain-foundation`

Arquivo de retomada da próxima sessão:
- `START.md`
