# ARCO-ERP — START

## Estado atual

- Projeto: ARCO-ERP
- Estado: **Gates A–F documentais mergeados; Gate G integrado até PR5B**
- Sprint 0: concluída
- Sprint 1: concluída
- Sprint 2: concluída
- Sprint 3 (Slices 1–5): concluída e mergeada
- P0+P1 (persistência real + API HTTP mínima): concluído e mergeado (PR #25)
- P1.5 (Supabase runtime readiness / DB smoke): ✅ **concluído e mergeado** (PR #28)
- `main` em: `3224458` (merge PR #39)
- Frente documental V1 operacional: ✅ **Gates A–F fechados**
- Gate F — Migration Plan + Test Strategy: ✅ **PASS**
- Commit Gate F: `406e043 docs(erp): define migration plan and test strategy`
- Gate G inicial — ORC→PED canônico + migration runner controlado: ✅ **mergeado**
- Gate G PR5A — represented companies foundation: ✅ **mergeado**
- Gate G PR5B — represented company enforcement/config: ✅ **mergeado**
- PR documental A–F: #30 — merge commit `0962558`
- PR Gate G inicial: #31 — merge commit `6d7cd19`
- PR Gate G PR5A: #37 — merge commit `ccb1c82`
- PR Gate G PR5B: #39 — merge commit `3224458`
- Typecheck: ✅ PASS
- Tests: ✅ PASS — 112/112 (10 test files)
- Smoke DB real contra Supabase dev: ✅ PASS
- Próximo ponto: **planejar próximo slice técnico com autorização explícita**
- Regra: não iniciar products/prices/payment terms, frontend ou RBAC/auth runtime sem plano/review próprio.

## Checkpoint da sessão (2026-06-05 pós-PR5B)

### PR5B integrado

- PR #39 — `Gate G: add represented company enforcement config`
- Merge commit: `3224458`
- Commit técnico: `b479fdf feat(erp): add represented company enforcement config`

### Estado técnico pós-PR5B

- `APP_REQUIRES_REPRESENTED_COMPANY` documentado em `.env.example`.
- Enforcement ativo somente com valor exato `"true"`.
- Enforcement fica em `createQuoteUseCase`.
- API passa `requiresRepresentedCompany` para o use case.
- `representedCompanyId` é normalizado com `trim`.
- Valor vazio/espaço vira ausente.
- `REQUIRED_REPRESENTED_COMPANY` mapeia HTTP `422`.
- Representada continua opcional quando enforcement está desabilitado.

### Validações registradas

| Validação | Resultado |
|---|---|
| `npm run typecheck` | ✅ PASS |
| `npm run test` | ✅ PASS — 112/112 |
| `git diff --check` | ✅ PASS |
| `npm run db:migrate` | ✅ PASS — 0 applied / 4 skipped |
| `npm run test:smoke:db` | ✅ PASS — 4/4 |

### Fora de escopo mantido

- Nenhuma migration `005` criada.
- Migrations `001`, `002`, `003` e `004` preservadas.
- Sem DB enforcement / `NOT NULL` / trigger / check constraint.
- Sem products/prices/payment terms.
- Sem frontend.
- Sem RBAC/auth runtime.
- `erp_app_flow_map.html`: continua untracked e fora dos PRs.

### Handoff oficial

Ler `docs/SESSION-HANDOFF-GATE-G-POST-PR5B.md` antes de planejar o próximo slice.

## Checkpoint da sessão (2026-06-05)

### PRs Gate G integrados até PR5A

| PR | Entrega | Status |
|---|---|---|
| #32 | Gate G initial handoff | ✅ mergeado |
| #33 | security tenant roles audit foundation | ✅ mergeado |
| #34 | represented companies decision | ✅ mergeado |
| #35 | environment tenant runtime | ✅ mergeado |
| #36 | commercial documents tenant FK/integrity | ✅ mergeado |
| #37 | represented companies foundation | ✅ mergeado em `ccb1c82` |

### Estado técnico pós-PR5A

- Migration `004` integrada.
- Migrations `001`, `002` e `003` preservadas.
- Nenhuma migration `005` criada.
- Foundation de `represented_companies` criada.
- `commercial_documents.represented_company_id` nullable.
- FK composta tenant-safe.
- API aceita `representedCompanyId` opcional.
- PED herda `representedCompanyId` do ORC quando presente.
- Fluxo Sagrado/null preservado.

### Fora de escopo mantido

- Sem enforcement.
- Sem `APP_REQUIRES_REPRESENTED_COMPANY`.
- Sem products/prices/payment terms.
- Sem frontend.
- Sem RBAC/auth runtime.
- Sem PR5B iniciado.
- `erp_app_flow_map.html`: continua untracked e fora dos PRs.

### Handoff oficial

Ler `docs/SESSION-HANDOFF-GATE-G-POST-PR5A.md` antes de planejar PR5B.

## Checkpoint da sessão (2026-06-04)

### PRs mergeados neste ciclo

| PR | Título | Merge commit |
|---|---|---|
| #30 | `Gate A-F: document canonical ERP foundation and Gate G handoff` | `0962558` |
| #31 | `Gate G: backend/data foundation for quote-to-order and migrations` | `6d7cd19` |

### Gate G inicial entregue

- ORC→PED canônico alinhado:
  - orçamento permanece `document_type=quote`;
  - pedido nasce como novo `document_type=order`;
  - pedido referencia orçamento por `source_quote_id`;
  - dupla confirmação não cria dois pedidos.
- Migration runner corrigido:
  - cria `schema_migrations`;
  - registra filename + checksum SHA-256;
  - pula migration já aplicada com mesmo checksum;
  - bloqueia checksum divergente;
  - usa advisory lock para evitar concorrência entre runners.

### Validações finais registradas

| Validação | Resultado |
|---|---|
| `npm run typecheck` | ✅ PASS |
| `npm run test` | ✅ PASS — 94/94 |
| `npm run db:migrate` | ✅ PASS — `001` skipped |
| 2ª execução `npm run db:migrate` | ✅ PASS — `001` skipped |
| `npm run test:smoke:db` | ✅ PASS |
| `git diff --check` | ✅ PASS |

### Fora de escopo mantido

- `erp_app_flow_map.html`: continua untracked e fora dos PRs.
- Nenhuma migration `002+` criada.
- `001_init_commercial_documents.sql` intacta.
- Frontend não iniciado.
- RBAC não implementado.
- `GESTOR_COMERCIAL` não ativado como produto.

### Próximo passo recomendado

Preparar escopo técnico do **Gate G PR 3 — security/tenant/roles/audit base**, usando `docs/MIGRATION-PLAN-OPS.md`, `docs/RBAC-MATRIX.md`, `docs/AUDIT-MODEL-OPS.md` e `docs/TEST-STRATEGY-OPS.md`.

## Checkpoint da sessão (2026-06-03)

### Gates documentais fechados nesta frente

| Gate | Status | Artefatos principais |
|---|---|---|
| Gate A — Screen Flow Canon + SPEC Consolidation | ✅ PASS | `docs/SCREEN-FLOW-MAP.md`, `docs/DECISION-FLOW-CANON.md`, `docs/SPEC.md` |
| Gate B — Data Model Decision | ✅ PASS | `docs/DATA-MODEL-OPS.md`, `docs/DECISION-DATA-MODEL-OPS.md` |
| Gate C — RBAC + Audit Model | ✅ PASS | `docs/RBAC-MATRIX.md`, `docs/AUDIT-MODEL-OPS.md` |
| Gate D — API Contract Alignment | ✅ PASS | `docs/API-CONTRACTS.yaml`, `docs/API-CONTRACTS-OPS.md` |
| Gate E — Frontend Contract + Shell Plan | ✅ PASS | `docs/FRONTEND-CONTRACT-OPS.md`, `docs/FRONTEND-SHELL-PLAN.md` |
| Gate F — Migration Plan + Test Strategy | ✅ PASS | `docs/MIGRATION-PLAN-OPS.md`, `docs/TEST-STRATEGY-OPS.md` |

### Gate F fechado

- Commit: `406e043 docs(erp): define migration plan and test strategy`
- Handoff oficial da sessão: `docs/SESSION-HANDOFF-GATE-F.md`
- Registro histórico: naquele checkpoint, Gate G era o próximo ponto e ainda não havia sido iniciado.

### Fora de escopo mantido

- `erp_app_flow_map.html`: continua untracked e **não deve ser incluído** em commits de Gate F/G.
- Nenhuma migration real foi criada no Gate F.
- Banco, API contracts, backend, frontend e código de produto não foram alterados no Gate F.

## Primeiro comando da próxima sessão

```bash
git status -sb
```

Depois ler:

1. `START.md` (este arquivo)
2. `ROADMAP.md`
3. `docs/SESSION-HANDOFF-GATE-G-POST-PR5B.md`
4. `docs/SESSION-HANDOFF-GATE-G-POST-PR5A.md`
5. `docs/SESSION-HANDOFF-GATE-G-INITIAL.md`
6. `docs/SESSION-HANDOFF-GATE-F.md`
7. `docs/MIGRATION-PLAN-OPS.md`
8. `docs/TEST-STRATEGY-OPS.md`
9. `docs/DATA-MODEL-OPS.md`
10. `docs/RBAC-MATRIX.md`
11. `docs/AUDIT-MODEL-OPS.md`
12. `docs/API-CONTRACTS.yaml`
13. `docs/API-CONTRACTS-OPS.md`

## Gate seguinte

Gate F — Migration Plan + Test Strategy: **✅ PASS e mergeado**.

Gate G inicial — ORC→PED + migration runner: **✅ mergeado em `6d7cd19`**.

Gate G PR5A — represented companies foundation: **✅ mergeado em `ccb1c82`**.

Gate G PR5B — represented company enforcement/config: **✅ mergeado em `3224458`**.

Próximo ponto: **planejar próximo slice técnico com autorização explícita**.

Regra: não iniciar products/prices/payment terms, frontend ou RBAC/auth runtime sem plano/review próprio.

## Checkpoint da sessão (2026-06-01)

### PRs mergeados neste ciclo

| PR | Título | Merge commit |
|---|---|---|
| #28 | `feat(p1.5): supabase runtime readiness with real db smoke and upsert fix` | `4b0d322` |

### Escopo técnico entregue no P1.5

- **README.md**: bootstrap migrado de Postgres local → Supabase
- **.gitignore**: `.env.local` e `.env.*.local` adicionados (proteção de credenciais)
- **.env.example**: template DATABASE_URL para Supabase dev (sem segredo)
- **docs/TEST-AND-RELEASE-GATE.md**: gate P1.5 atualizado com evidências PASS
- **postgresOrderRepository.ts**: expansão do `ON CONFLICT DO UPDATE SET` — agora sobrescreve `document_type`, `source_quote_id`, `source_quote_snapshot` e demais campos de conversão na confirmação quote→order
- **tests/postgresRepositories.spec.ts**: teste unitário validando upsert sobrescreve campos da quote ao salvar order
- **tests/smokeDb.spec.ts**: numberSequence dinâmico + asserts de `document_type` mudando de `'quote'` para `'order'` após confirmação

### Bug corrigido (crítico)

**Problema**: `PostgresOrderRepository.save` usava `ON CONFLICT (id) DO UPDATE SET` parcial — não sobrescrevia `document_type`, `source_quote_id` e campos de conversão. Ao confirmar uma quote (mesmo id), o registro permanecia como `document_type='quote'` no banco.

**Correção**: upsert expandido para incluir todos os campos de conversão (`document_type`, `tenant_id`, `customer_id`, `owner_id`, `representative_id`, `status`, `items`, `totals`, `created_at`, `updated_at`, `confirmed_at`, `invoiced_at`, `invoice_manual_reference`, `source_quote_id`, `source_quote_number`, `source_quote_revision`, `converted_at`, `source_quote_snapshot`, `canceled_at`, `cancel_reason`, `cancel_note`).

### Evidências de validação pós-merge em `main`

| Validação | Resultado |
|---|---|
| `npm run typecheck` | ✅ PASS |
| `npm run test` (89/89) | ✅ PASS |
| `npm run test:smoke:db` (Supabase dev real) | ✅ PASS (635ms) |

### Fora de escopo mantido

- `erp_app_flow_map.html`: untracked, fora de commits
- `.env.local`: não versionado, DATABASE_URL nunca exposta
- P2 Frontend/UX: não iniciado (apenas planning registrado em `docs/NEXT-PHASE-GATE-PLAN.md`)

### Ambiente

- **Base de dados**: Supabase dev (PostgreSQL via Session pooler)
- **Role**: `arco_app`
- **DATABASE_URL**: definida apenas localmente em `.env.local` (nunca versionada)
- **Migration**: `001_init_commercial_documents.sql` aplicada
- **Runtime**: `pg` client com `sslmode=require`

## Primeiro comando da próxima sessão P1.5 histórica

```bash
git checkout main
git pull --ff-only origin main
git status -sb
npm run typecheck
npm run test
```

Depois ler:

1. `START.md` (este arquivo)
2. `docs/SPEC.md`
3. `docs/SPEC_REVIEW.md`
4. `docs/SPEC-OPS-ADDENDUM.md`
5. `docs/RBAC-MATRIX.md`
6. `docs/TEST-AND-RELEASE-GATE.md` (seção P1.5)
7. `docs/NEXT-PHASE-GATE-PLAN.md` (P2 planning)
8. `docs/DECISION_SPEC_APPROVAL.md`
9. `src/domain`
10. `tests`

## Gate seguinte histórico P1.5

P1.5 Supabase Runtime Readiness: **✅ PASS e mergeado**.
Próximo passo: **P2 Frontend/UX inicial (planning-only)** — não implementar sem autorização explícita.

### Para rodar validações do gate P1.5

```bash
# Configurar ambiente (primeira vez)
cp .env.example .env.local
# Editar .env.local com DATABASE_URL real do Supabase dev

# Carregar env
set -a; source .env.local; set +a

# Aplicar migration
npm run db:migrate

# Rodar smoke DB real
npm run test:smoke:db
```
