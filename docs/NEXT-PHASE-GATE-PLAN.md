# NEXT PHASE — Gate Plan (Pós-Etapa 9)

Status: **Planning-only (sem implementação)**  
Data: 2026-06-01  
Referências: `ROADMAP.md`, `docs/SPEC.md`, `docs/TEST-AND-RELEASE-GATE.md`.

---

## 1) Objetivo

Registrar o plano da fase seguinte após conclusão das Etapas 5-9, preservando controle de escopo e evitando início automático de novas implementações.

---

## 2) Trilhas possíveis (a definir por autorização explícita)

1. Evolução fiscal avançada (fora do MVP atual).
2. Integrações externas de comunicação/faturamento.
3. Evoluções de UX/API/persistência real.
4. Hardening operacional e observabilidade.

---

## 3) Critérios de gate para abrir nova fase

1. decisão explícita de prioridade (trilha escolhida);
2. recorte de escopo com fora de escopo formal;
3. pacote de implementação aprovado (arquivos/testes/riscos);
4. baseline em `main` validado (`npm run typecheck` + `npm run test`);
5. confirmação de no-regression e compatibilidade com SPEC.

---

## 4) Restrições mantidas até nova decisão

- Não iniciar implementação nova automaticamente.
- Não ampliar para fiscal avançado/NF-e sem autorização.
- Não abrir integração externa real sem gate dedicado.
