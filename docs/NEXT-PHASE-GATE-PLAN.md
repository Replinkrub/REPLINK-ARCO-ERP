# NEXT PHASE — Gate Plan (P2 Frontend/UX)

Status: **Planning-only (sem implementação)**  
Data: 2026-06-01  
Referências: `ROADMAP.md`, `docs/SPEC.md`, `docs/TEST-AND-RELEASE-GATE.md`.

---

## 1) Objetivo

Registrar somente o plano da fase P2 Frontend/UX após merge do PR #25, preservando controle de escopo e evitando início automático de implementação.

---

## 2) Recorte desta fase (planejamento apenas)

1. Planejamento de frontend operacional alinhado à SPEC.
2. Planejamento de UX mínima para fluxos já entregues no backend.
3. Definição de critérios de aceite e testes para abertura futura da implementação.

Fora deste gate de planejamento:
- implementação de frontend;
- fiscal avançado / NF-e;
- integrações externas;
- nova expansão de backend fora de ajustes de planejamento.

---

## 3) Critérios de gate para abrir nova fase

1. autorização explícita para iniciar P2 Frontend/UX;
2. recorte de escopo com fora de escopo formal;
3. pacote de implementação aprovado (arquivos/testes/riscos);
4. baseline em `main` validado (`npm run typecheck` PASS + `npm run test` PASS (87/87));
5. confirmação de no-regression e compatibilidade com SPEC.

---

## 4) Restrições mantidas até nova decisão

- Não iniciar implementação nova automaticamente.
- Não ampliar para fiscal avançado/NF-e sem autorização.
- Não abrir integração externa real sem gate dedicado.
- Não iniciar execução P2 sem decisão formal posterior.
