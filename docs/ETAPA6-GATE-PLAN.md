# ETAPA 6 — Gate Plan (Conversão Orçamento -> Pedido)

Status: **Reviewed — Ready for Approval Gate**  
Data: 2026-06-01  
Referências: `docs/SPEC.md`, `ROADMAP.md` (Etapa 6), `docs/SPEC-OPS-ADDENDUM.md` (F-03/F-04), `docs/API-CONTRACTS.yaml`, `docs/DATA-MODEL-OPS.md`, `docs/RBAC-MATRIX.md`.

---

## 1) Requirement

### Título
Etapa 6 P0 — Conversão canônica de orçamento para pedido com integridade de concorrência.

### Problema
O domínio já possui regras de conversão (`quote -> order`), mas a camada de aplicação ainda não possui fluxo operacional completo e validável para confirmação com proteção de concorrência e persistência consistente de conversão única.

### Objetivo
Disponibilizar o fluxo operacional canônico de confirmação de orçamento para pedido, mantendo invariantes da SPEC e bloqueando duplicidade sob concorrência.

### Usuários afetados
- ADMIN
- REPRESENTANTE
- Time de engenharia (consumidores da camada de aplicação)

### Escopo incluído
- Use case de confirmação (`confirmQuote`) na camada de aplicação.
- Persistência atômica da conversão de quote em order, sem efeito parcial, mantendo vínculo único via `source_quote_id` (sem introduzir cancelamento automático do quote como regra desta etapa).
- Enforcements de conversão única (`source_quote_id` único em nível de regra de aplicação/repositório in-memory).
- Mapeamento de erro consistente para `403/409/422` em termos de contrato de aplicação.
- Testes positivos e negativos de F-03/F-04.

### Escopo excluído
- Frontend/UI.
- API HTTP/controller.
- Banco real/migrations.
- Fiscal/NF-e/gateway/boleto.
- Envio/WhatsApp/e-mail/impressão como frente de implementação.
- Qualquer alteração de status comercial por comunicação/output_event.
- Etapas 7 e 8 (comunicação ampla, fechamento administrativo e faturamento completo).
- Refactor amplo fora do necessário para o gate da Etapa 6.
- Fluxos de cancelamento/faturamento/ajuste fora do que for estritamente necessário para conversão.
- `erp_app_flow_map.html` (permanece fora do escopo e sem versionamento neste ciclo).

### Critérios de aceite (Requirement)
1. Confirmar orçamento válido em `QUOTE_DRAFT` gera pedido `ORDER_CONFIRMED` com `PED-####`, `source_quote_id`, snapshot e `confirmedAt`.
2. Duas confirmações concorrentes do mesmo orçamento não geram dois pedidos; uma falha com conflito.
3. Ação de comunicação não altera estado comercial.
4. RBAC de confirmação mantém `Allow` para ADMIN/REPRESENTANTE conforme matriz.
5. `npm run typecheck` e `npm run test` passam sem regressão.

---

## 2) Functional Specification (Etapa 6)

### Resumo funcional
Ao confirmar um orçamento válido, o sistema converte exatamente uma vez para pedido confirmado e impede duplicidade mesmo com corrida de requisições.

### User stories
- Como representante autorizado, quero confirmar um orçamento para gerar um pedido oficial rastreável.
- Como operação, quero garantir que confirmações duplicadas não criem pedidos duplicados.

### Requisitos funcionais
1. Entrada: `quoteId`, contexto de ator (role/id), sequência de número do pedido, timestamp opcional.
2. Pré-condições: documento existe, é `quote`, está em `QUOTE_DRAFT`, ator autorizado para `CONFIRM_ORDER`.
2.1. Pré-condição de autorização inclui escopo de `tenant_id` + ownership/carteira para REPRESENTANTE; acesso fora de escopo deve falhar com `FORBIDDEN` (403).
3. Efeito principal: converter para `order`, status `ORDER_CONFIRMED`, preencher `source_quote_id`, snapshot e `confirmedAt`.
4. Concorrência: se orçamento já convertido/confirmado por chamada paralela, retornar conflito sem efeito parcial.
5. Observabilidade de domínio: manter eventos/lifecycle coerentes do objeto convertido.

### Erros esperados
- `FORBIDDEN` (ator sem permissão ou fora de escopo tenant/ownership).
- `CONFLICT_ALREADY_CONFIRMED` (dupla confirmação/race condition).
- `DOMAIN_OPERATION_FAILED` (violação de regra de domínio/conversão).
- `VALIDATION_ERROR` (entrada inválida).

Observação: manter mapeamento compatível com contrato atual (`403/409/422`), sem introduzir novo status HTTP nesta etapa.

### Edge cases
- Quote já em `ORDER_CONFIRMED` por corrida de requisição.
- Repositório retorna quote válido, mas persistência de order falha (exigir operação atômica no contrato in-memory).
- Entrada com `quoteId` válido porém fora do `tenant_id` ou da carteira do REPRESENTANTE deve retornar `FORBIDDEN` (403), conforme RBAC e contrato multi-tenant.

### Fora de escopo funcional
- Idempotência HTTP por `Idempotency-Key` em camada API (neste ciclo, apenas contrato de aplicação preparado).
- Implementar canais de comunicação (WhatsApp/e-mail/impressão) ou qualquer regra de transição por comunicação.

---

## 3) Technical Plan

### Arquitetura resumida
Adicionar use case de conversão na aplicação, separando responsabilidades de leitura/atualização de quote e gravação de order, com interface de repositório que impeça duplicidade por `source_quote_id` e preserve atomicidade no in-memory.

### Arquivos em escopo (prováveis)
- `src/application/useCases/confirmQuote.ts` — novo caso de uso.
- `src/application/errors.ts` — novos códigos de erro de conflito/permissão para confirmação.
- `src/application/ports/quoteRepository.ts` — possível evolução de contrato para suportar marcação de conversão segura.
- `src/application/ports/orderRepository.ts` — novo contrato para persistência de order.
- `src/infrastructure/repositories/inMemoryQuoteRepository.ts` — adaptação para suporte ao fluxo de confirmação sem regressão.
- `src/infrastructure/repositories/inMemoryOrderRepository.ts` — novo repositório in-memory com unicidade por `source_quote_id`.
- `src/index.ts` — exports dos novos contratos/use case.
- `tests/quoteApplication.spec.ts` — ampliar com cenários F-03/F-04.

### Arquivos fora de escopo (não devem mudar)
- `docs/SPEC.md` (sem mudança de contrato de produto).
- `docs/RBAC-MATRIX.md` (já definido; só referenciado).
- `erp_app_flow_map.html` (fora do ciclo).

### Fluxo técnico alvo
1. Buscar quote por id.
2. Revalidar autorização (`tenant_id` + ownership) e estado imediatamente antes da persistência.
3. Validar existência + `documentType=quote`.
4. Chamar regra de domínio de conversão.
5. Persistir order convertido com garantia de unicidade por `source_quote_id`.
6. Não introduzir novo estado para o quote origem nesta etapa.
7. Aceitar identificador idempotente no contrato de aplicação (preparo de camada, mesmo sem API HTTP nesta etapa).
8. Retornar sucesso com order; em conflito, retornar erro explícito sem efeitos parciais.

### Decisões travadas (escopo fechado)
1. **Atomicidade:** porta transacional única no nível application/in-memory.
2. **Conflito de duplicidade:** usar `CONFLICT_ALREADY_CONFIRMED` para dupla confirmação e colisão de conversão.
3. **Quote origem:** não recebe novo estado nesta etapa.
4. **Marcador canônico da conversão:** `order` com `source_quote_id` único + snapshot.

### Riscos e mitigação
- **Risco:** quebrar contrato atual do `QuoteRepository` e regressar Etapa 5.  
  **Mitigação:** extensão mínima compatível + testes existentes obrigatórios.
- **Risco:** falso positivo de concorrência sem simulação adequada.  
  **Mitigação:** teste dedicado com chamadas paralelas no in-memory.
- **Risco:** ambiguidade entre erro de regra e erro de concorrência.  
  **Mitigação:** códigos de erro distintos e assertions explícitas nos testes.

### Trade-offs
- Sem banco real nesta etapa: concorrência simulada via in-memory, suficiente para gate de domínio/aplicação.
- Sem API neste ciclo: foca núcleo de aplicação, reduz risco e evita escopo indevido.

---

## 4) PR Breakdown (sem micro-slices)

Estratégia: **1 PR médio, único, reviewável**, com checkpoints internos de validação/revalidação.

### PR-ETAPA6-01 — Confirm quote application flow with concurrency guard

**Objetivo**  
Fechar Etapa 6 P0 com fluxo de conversão operacional em camada de aplicação e proteção contra duplicidade.

**Escopo**
- novo use case de confirmação;
- contratos/repositórios mínimos para persistir order convertido;
- erros de aplicação para conflitos/permissões;
- testes F-03/F-04 + regressão Etapa 5.

**Tamanho estimado**
- **medium**

**Dependências**
- Etapa 5 já mergeada em `main`.
- Regras canônicas da SPEC/Addendum/RBAC/Data Model já aprovadas.

**Riscos**
- alteração de contratos de repositório;
- disputa de semântica de erro.

**Validação obrigatória**
- `npm run typecheck`
- `npm run test`
- revisão de escopo SPEC x diff

---

## 5) Recommended Next PR

**Selecionado:** `PR-ETAPA6-01 — Confirm quote application flow with concurrency guard`.

### Inclui
- Tudo necessário para F-03/F-04 no nível application/domain+in-memory.

### Exclui
- API HTTP, frontend, persistência real, qualquer feature de Etapa 7+.

### Stop conditions da execução
- Se exigir mudança estrutural ampla fora de Etapa 6.
- Se não for possível garantir comportamento sem regressão da Etapa 5.

---

## 6) Validation and Revalidation Plan (plan + act)

### Pré-execução (baseline)
1. `git status -sb`
2. `npm run typecheck`
3. `npm run test`
4. Confirmar escopo deste documento contra `ROADMAP.md` Etapa 6.

### Durante execução (checkpoints internos)
1. Após criar use case e contratos: rodar cenários mínimos obrigatórios (F-03 sucesso, F-04 concorrência com 1 sucesso + 1 conflito, e negação 403 por tenant/ownership fora de escopo).
2. Após guardas de concorrência: rodar cenários de corrida.
3. Antes do PR: reexecutar suíte completa.

### Gate de PR
1. `npm run typecheck` PASS
2. `npm run test` PASS
3. Evidência de F-03/F-04 em testes
4. Sem alteração em arquivos fora de escopo

### Pós-merge (revalidação)
1. Em `main`: `git pull --ff-only origin main`
2. `npm run typecheck`
3. `npm run test`
4. Atualizar `START.md` e `docs/TEST-AND-RELEASE-GATE.md` com resultado factual.

---

## 7) Open Questions (para fechar escopo certeiro)

Sem pendências abertas para o gate documental da Etapa 6.

---

## 8) Final Recommendation

**Ready for review.**  
Escopo está fechado para Etapa 6 em 1 PR médio, sem micro-slices, com validação/revalidação obrigatórias e fronteira clara de não-escopo.
