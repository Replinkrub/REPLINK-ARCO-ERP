# Test Strategy Ops — ARCO-ERP V1 Operacional

> Status: Gate F — Migration Plan + Test Strategy  
> Complementa: `docs/MIGRATION-PLAN-OPS.md`  
> Base: `docs/SPEC.md`, `docs/DATA-MODEL-OPS.md`, `docs/RBAC-MATRIX.md`, `docs/AUDIT-MODEL-OPS.md`, `docs/API-CONTRACTS.yaml`, `docs/API-CONTRACTS-OPS.md`, `docs/FRONTEND-CONTRACT-OPS.md`  
> Escopo: estratégia documental de testes; não cria testes, código, migrations, backend/API/frontend

## 1) Objetivo

Definir a suíte mínima de validação para implementar a V1 operacional completa sem regressão.

Gate F não executa nem cria testes. Ele define o que Gate G/H/I devem provar antes de avançar.

## 2) Comandos existentes de validação

Conforme `package.json`:

```bash
npm run typecheck
npm run test
npm run db:migrate
npm run test:smoke:db
```

Uso esperado:

- `npm run typecheck`: obrigatório em PRs técnicos.
- `npm run test`: obrigatório em PRs técnicos; exclui smoke DB.
- `npm run db:migrate`: obrigatório quando houver migration planejada/aprovada.
- `npm run test:smoke:db`: obrigatório quando ambiente `DATABASE_URL` estiver disponível; caso contrário registrar `Not run` com motivo.

## 3) Pirâmide mínima de testes

| Camada | Objetivo | Quando obrigatória |
| --- | --- | --- |
| Unit/domain | regras puras de status, snapshot, valores, reason, idempotência | todo slice com regra de negócio |
| Application/service | use cases, RBAC, tenant, ownership, revisão, eventos | Gate G/H |
| Repository/integration | persistência relacional, constraints, backfill, queries | migrations e adapters |
| API contract | endpoints, payloads, erros 401/403/404/409/422 | Gate H |
| DB smoke | migration + fluxo real em Supabase/dev DB | Gate G/H quando DB disponível |
| Frontend smoke | rotas, estados e actions por contrato | Gate I quando UI iniciar |
| Regression docs/spec | diff contra SPEC/RBAC/API/Frontend contract | todo gate técnico |

## 4) Matriz de cobertura por área V1

| Área | Testes mínimos |
| --- | --- |
| Clientes completos | criar/editar cliente, contatos, endereços, perfil comercial; tenant/ownership; snapshot não retroativo |
| Produtos completos | criar/editar produto; status/disponibilidade informativa; SKU por tenant |
| Tabela de preços | criar/editar tabela/item; vigência conflitante 409; preço aplicado vira snapshot |
| Condições de pagamento | criar/editar condição; simular/aplicar parcelas; não confundir com faturamento |
| Orçamento | criar ORC numerado, editar steps, validar cliente/itens/pagamento, cancelar com motivo |
| ORC → PED | confirmação cria novo PED, preserva ORC, vínculo `source_quote_id`, idempotência e concorrência |
| Pedido confirmado | edição só por perfil autorizado, motivo, revisão, diff, audit, lifecycle |
| Pedido faturado | edição/correção só ADMIN, motivo forte, revisão, audit, lifecycle |
| Override de preço | motivo obrigatório, audit, revisão se pós-confirmação, deny por perfil |
| Comunicação/output | output event/badge sem alterar `commercial_status` |
| Faturamento operacional | 1 registro ativo, transição para `INVOICED`, duplicidade 409, correção por action própria |
| Cancelamento | ORC próprio por representante quando permitido; pedido por ADMIN/gestor autorizado; motivo e audit |
| Timeline/revisão | lifecycle/output/revision/audit separados; `ORDER_ADJUSTED` nunca status |
| Listagens/relatórios | filtros, paginação, tenant/ownership, status e output badges separados |

## 5) Testes de RBAC e negação obrigatórios

Cobrir casos positivos e negativos por perfil:

- `ADMIN` opera todos os registros do tenant conforme action permitida.
- `REPRESENTANTE` acessa apenas carteira/próprios.
- `GESTOR_COMERCIAL` acessa somente equipe explicitamente vinculada.
- cross-tenant sempre `Deny`/403 ou 404 conforme visibilidade.
- `REPRESENTANTE` não edita pedido confirmado.
- `REPRESENTANTE` não edita pedido faturado.
- `REPRESENTANTE` não cancela pedido confirmado.
- `REPRESENTANTE` não registra/corrige faturamento operacional.
- perfil sem permissão não executa `override_item_price`.
- perfil sem permissão não altera tabela de preço/vigência.
- documento `CANCELED` não recebe edição comercial.
- ORC já convertido não confirma novamente fora de idempotência válida.

Cada negação relevante deve validar resposta esperada e geração de `audit_event.result = denied` quando aplicável.

## 6) Testes de erro e concorrência

| Código | Casos mínimos |
| --- | --- |
| 401 | token ausente/inválido/expirado em endpoints protegidos |
| 403 | ação negada em recurso visível; audit denied quando relevante |
| 404 | recurso inexistente ou fora do escopo de visibilidade sem vazar existência |
| 409 `IDEMPOTENCY_CONFLICT` | mesma chave + payload diferente |
| 409 `REVISION_CONFLICT` | `expected_revision_number` defasado |
| 409 `ACTIVE_OPERATIONAL_INVOICE_EXISTS` | registrar segundo faturamento ativo |
| 409 `ORC_ALREADY_CONVERTED` | confirmar ORC já convertido sem idempotência válida |
| 409/422 `INVALID_STATE_TRANSITION` | action incompatível com status atual |
| 422 | payload inválido, motivo ausente, `Idempotency-Key` ausente, regra de negócio violada |

Concorrência obrigatória:

- dupla confirmação de ORC não cria dois PEDs;
- duas revisões simultâneas geram conflito por revision number;
- dois registros de faturamento simultâneos não criam dois ativos;
- retry idempotente retorna mesmo resultado para mesmo payload.

## 7) Testes de migration e DB smoke

Para cada migration futura:

1. aplicar em DB limpo;
2. aplicar em DB com dados da `001_init_commercial_documents.sql`;
3. validar constraints, índices e FKs;
4. validar backfill quando existir;
5. validar que `npm run db:migrate` é idempotente ou falha de modo controlado conforme script atual;
6. executar `npm run test:smoke:db` quando `DATABASE_URL` existir;
7. registrar `Not run` quando ambiente DB não existir.

Casos smoke mínimos:

- criar cliente completo;
- criar produto e tabela de preço;
- criar condição de pagamento;
- criar ORC com item/parcela;
- confirmar ORC → PED;
- registrar output event sem mudar status;
- registrar faturamento operacional;
- revisar/corrigir conforme perfil;
- validar timeline/eventos;
- validar cross-tenant deny.

## 8) Testes de API contract

Gate H deve cobrir os endpoints de `docs/API-CONTRACTS.yaml` com:

- payload válido e inválido;
- responses 200/201 esperadas;
- 401/403/404/409/422;
- headers obrigatórios, especialmente `Idempotency-Key`;
- `available_actions`, `output_badges`, `commercial_status` e timeline no shape esperado;
- nenhuma comunicação alterando status;
- PED vinculado a ORC.

Contrato não pode ser alterado silenciosamente. Mudança de contrato exige novo gate/revisão documental.

## 9) Testes frontend futuros

Gate I deve validar, no mínimo:

- shell/login/home;
- nav por perfil e `available_actions`;
- listas com loading/empty/error/pagination/filter;
- criação de ORC por steps;
- confirmação ORC → PED com botão idempotente;
- pedido detalhe separando status, badges e timeline;
- motivo obrigatório em ações críticas;
- 403 sem bypass visual;
- 409 com refetch/compare/abrir recurso existente;
- 422 preservando formulário;
- comunicação sem alteração de status;
- faturamento operacional/correção por action própria.

Frontend smoke não substitui testes de API/RBAC/backend.

## 10) Regressões proibidas

Qualquer PR técnico futuro deve falhar revisão se:

- transformar comunicação em `commercial_status`;
- transformar ORC em PED por mutação destrutiva;
- permitir dois PEDs para o mesmo ORC por duplo submit;
- permitir edição de pedido confirmado/faturado sem revisão/audit;
- permitir `REPRESENTANTE` operar fora da carteira;
- permitir acesso cross-tenant;
- permitir segundo faturamento ativo;
- introduzir NF-e, SEFAZ, gateway, boleto automático ou faturamento parcial sem decisão futura;
- remover compatibilidade JSONB antes de backfill validado;
- alterar API contract sem gate.

## 11) Evidência mínima por PR técnico futuro

Cada PR de Gate G/H/I deve reportar:

- arquivos alterados;
- migrations criadas/aplicadas;
- comandos executados e resultado;
- testes adicionados/alterados;
- cenários não executados e motivo;
- riscos residuais;
- confirmação de que `commercial_status`, ORC/PED, RBAC, audit, idempotência e output events não regrediram.

## 12) Critério de aceite Gate F

Gate F passa se:

- sequência de migrations está definida;
- compatibilidade com `001_init_commercial_documents.sql` está registrada;
- rollback/forward-fix está definido;
- riscos de dados existentes estão documentados;
- suíte mínima cobre unit, integration, smoke DB, API contract, RBAC negative e frontend smoke futuro;
- nenhuma migration, código, backend, frontend ou API contract foi alterado.

## 13) Próximo gate

Gate G foi iniciado após aprovação e commit do Gate F.

Status atualizado:

- PR #31 mergeado em `main` (`6d7cd19`) com ORC→PED canônico e migration runner controlado.
- Próximo slice recomendado: **Gate G PR 3 — security/tenant/roles/audit base**.
- Todo próximo PR técnico deve manter a evidência mínima desta estratégia: comandos executados, resultado, smoke DB quando `DATABASE_URL` existir e confirmação explícita de não regressão em `commercial_status`, ORC/PED, RBAC, audit, idempotência e output events.
