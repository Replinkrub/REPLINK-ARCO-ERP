# NEXT PHASE — Gate Plan (P2 Frontend/UX)

> Atualização operacional: este documento é histórico do planejamento P2 pós-P1.5. A direção canônica vigente agora está em `ROADMAP.md`, com Gates A–F mergeados e Gate G inicial integrado no PR #31 (`6d7cd19`). Próximo passo recomendado: Gate G PR 3 — security/tenant/roles/audit base, antes de frontend.

Status: **Planning-only (sem implementação)**  
Data: 2026-06-01  
Última atualização: 2026-06-01 (pós P1.5 merge)  
Referências: `ROADMAP.md`, `docs/SPEC.md`, `docs/TEST-AND-RELEASE-GATE.md`, `START.md`.

---

## 1) Objetivo

Registrar somente o plano da fase P2 Frontend/UX após conclusão do P1.5 Supabase Runtime Readiness, preservando controle de escopo e evitando início automático de implementação.

---

## 2) Baseline validada para iniciar P2

- ✅ P0+P1 (persistência real + API HTTP mínima): mergeado em `main` (PR #25)
- ✅ P1.5 Supabase Runtime Readiness / DB Smoke: mergeado em `main` (PR #28)
- ✅ Supabase dev validado com smoke real (typecheck ✅, 89/89 ✅, smoke ✅)
- ✅ Bug do upsert quote→order corrigido no `postgresOrderRepository.ts`
- ✅ `.env.example` + `.gitignore` protegendo credenciais
- ✅ Camada de backend operacional e validada contra Postgres real

---

## 3) Recorte desta fase (planejamento apenas)

1. Planejamento de frontend operacional alinhado à SPEC.
2. Planejamento de UX mínima para fluxos já entregues no backend.
3. Definição de critérios de aceite e testes para abertura futura da implementação.

Fora deste gate de planejamento:
- implementação de frontend;
- fiscal avançado / NF-e;
- integrações externas;
- nova expansão de backend fora de ajustes de planejamento.

---

## 4) Critérios de gate para abrir nova fase

1. autorização explícita para iniciar P2 Frontend/UX;
2. recorte de escopo com fora de escopo formal;
3. pacote de implementação aprovado (arquivos/testes/riscos);
4. baseline em `main` validado (`npm run typecheck` PASS + `npm run test` PASS (89/89) + `npm run test:smoke:db` PASS);
5. env de desenvolvimento funcional (Supabase dev com `DATABASE_URL` em `.env.local`);
6. confirmação de no-regression e compatibilidade com SPEC.

---

## 5) Restrições mantidas até nova decisão

- Não iniciar implementação nova automaticamente.
- Não ampliar para fiscal avançado/NF-e sem autorização.
- Não abrir integração externa real sem gate dedicado.
- Não iniciar execução P2 sem decisão formal posterior.

---

## 6) Como validar ambiente antes de iniciar P2

```bash
git checkout main && git pull --ff-only origin main
set -a; source .env.local; set +a
npm run typecheck
npm run test
npm run test:smoke:db
```

Todos devem PASS antes de qualquer implementação P2.
