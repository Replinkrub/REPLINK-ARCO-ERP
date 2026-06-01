# ARCO-ERP — START

## Estado atual

- Projeto: ARCO-ERP
- Estado: Etapa 5 concluída e mergeada na `main` (PR #14)
- Sprint 0: concluída
- Sprint 1: concluída
- Sprint 2: concluída
- Main: sincronizada com origin/main após merge do PR #14
- Typecheck: PASS
- Tests: PASS — 58/58
- Trabalho atual: fechamento de gate documental da Etapa 5

## Checkpoint da sessão (2026-06-01)

- PR mergeado: `#14` — `feat(etapa5): add quote operational application flow`
- Merge commit em `main`: `377c542`
- Escopo entregue na Etapa 5:
  - application use cases `createQuote` e `updateQuote`
  - `QuoteRepository` + `InMemoryQuoteRepository`
  - validação de `customerId` obrigatório no nível application
  - correção de blocker (`updatedAt` em alteração isolada de `customerId`)
  - testes de aplicação e fluxo in-memory

## Decisão canônica

A Sprint 3 deve seguir a SPEC.

A prioridade é fechar lacunas estruturais exigidas pela SPEC antes de avançar para fluxos operacionais mais amplos.

Regra:
- SPEC > pressa de feature.
- Base sólida antes de camada superior.
- Não criar abstrações sem necessidade real.
- Não fazer hardening genérico.
- Só implementar o que for REQUIRED_BY_SPEC, testável e local ao domínio.

## Sprint 3 — SPEC-Led Domain Foundation Completion

Objetivo:
Fechar lacunas de fundação de domínio exigidas pela SPEC.

Lacunas REQUIRED_BY_SPEC (status):

1. Numeração canônica — ✅ concluído
- ORC-####
- PED-####

2. Conversão quote → order — ✅ concluído
- vínculo explícito source_quote_id
- snapshot mínimo dedicado

3. Ajuste administrativo — ✅ concluído
- estrutura explícita de order_revision
- evento ORDER_ADJUSTED

4. Output events — ✅ concluído
- separar semanticamente output_events de lifecycle_events
- output_event não altera status comercial

5. Dupla confirmação — ✅ concluído no escopo da Sprint 3 (código canônico mantido)
- contrato canônico de negação/conflito para confirmação duplicada
- sem modelagem distribuída/lock avançado nesta fase

6. Documentação de gate — ✅ concluído
- atualizar estado real pós Slices 1-4
- manter rastreabilidade com SPEC e baseline de validação atual

## Escopo permitido da Sprint 3

- domínio puro
- tipos de domínio
- regras comerciais exigidas pela SPEC
- testes positivos/negativos
- documentação factual de gate

## Escopo proibido

- frontend
- API/camada externa
- banco/persistência/migration
- integração fiscal real
- integração com Sagrado/legado
- importação/migração de legado
- workflow engine genérico
- abstrações futuras sem caso SPEC

## Critério anti-overengineering

Um item só entra se responder SIM para todas:

1. Está explícito na SPEC/Addendum/RBAC?
2. Protege regra comercial central?
3. Tem teste objetivo?
4. É local ao domínio?
5. Reduz ambiguidade real?

Se qualquer resposta for NÃO, deixar fora da Sprint 3.

## Plano recomendado

Slice 1: ✅ concluído
Numeração canônica ORC/PED + testes.

Slice 2: ✅ concluído
Conversão quote→order com source_quote_id e snapshot mínimo + testes.

Slice 3: ✅ concluído
order_revision explícito no ajuste administrativo + testes.

Slice 4: ✅ concluído
Separação output_events vs lifecycle_events + testes de regressão.

Slice 5: ✅ concluído
Atualização documental final, baseline factual de validação e checklist anti-overengineering aplicado.

## Checklist anti-overengineering aplicado no fechamento (Slice 5)

- [x] Item alterado está explícito na SPEC/Addendum/RBAC.
- [x] Mudança protege regra comercial central (sem ampliar escopo).
- [x] Mantido escopo documental; sem tocar código/testes/scripts.
- [x] Rastreabilidade entre `START.md`, `README.md`, `docs/TEST-AND-RELEASE-GATE.md` e `docs/DECISION_SPEC_APPROVAL.md`.
- [x] Nenhuma proposta de Slice 6 (não existe canonicamente nesta sprint).

## Stash técnico preservado

Existe stash técnico anterior:

wip/test-sprint2-commercial-flow-e2e-before-sprint3-kickoff

Regra:
Não aplicar automaticamente.
Só avaliar depois que Sprint 3 estiver aberta e se o conteúdo ajudar a validar fluxo sem contrariar a SPEC.

## Primeiro comando da próxima sessão

Validar estado:

git checkout main
git pull --ff-only origin main
git status -sb
npm run typecheck
npm run test

Se houver continuidade pós-gate, manter na branch atual de Sprint 3 (sem abrir Slice 6 sem decisão formal).

Depois ler:

1. START.md
2. docs/SPEC.md
3. docs/SPEC_REVIEW.md
4. docs/SPEC-OPS-ADDENDUM.md
5. docs/RBAC-MATRIX.md
6. docs/TEST-AND-RELEASE-GATE.md
7. docs/DECISION_SPEC_APPROVAL.md
8. src/domain
9. tests

## Gate seguinte

Etapa 5 concluída em `main`.
Próxima decisão operacional: **não iniciar Etapa 6 automaticamente**; aguardar autorização explícita para novo ciclo.
