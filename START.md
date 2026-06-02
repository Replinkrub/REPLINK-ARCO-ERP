# ARCO-ERP — START

## Estado atual

- Projeto: ARCO-ERP
- Estado: **P1.5 Supabase Runtime Readiness concluído e mergeado em `main`**
- Sprint 0: concluída
- Sprint 1: concluída
- Sprint 2: concluída
- Sprint 3 (Slices 1–5): concluída e mergeada
- P0+P1 (persistência real + API HTTP mínima): concluído e mergeado (PR #25)
- P1.5 (Supabase runtime readiness / DB smoke): ✅ **concluído e mergeado** (PR #28)
- `main` em: `4b0d322` (squash merge PR #28)
- Typecheck: ✅ PASS
- Tests: ✅ PASS — 89/89 (8 test files)
- Smoke DB real contra Supabase dev: ✅ PASS (635ms)
- Próximo passo registrado: P2 Frontend/UX (planning-only, sem implementação)

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

## Primeiro comando da próxima sessão

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

## Gate seguinte

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
