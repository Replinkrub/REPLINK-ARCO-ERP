# API Contracts Ops — ARCO-ERP V1 Operacional

> Status: Gate D — API Contract Alignment
> Contrato OpenAPI: `docs/API-CONTRACTS.yaml`
> Não autoriza: banco, migrations, backend, frontend ou código

## 1) Decisão de arquitetura

A API V1 usa modelo **híbrido REST + action endpoints**:

- REST para cadastros, consultas e listagens.
- Actions para operações críticas, transições, revisões, faturamento e comunicação.
- API/backend é a fonte real de autorização; frontend apenas oculta/desabilita.

## 2) Padrões obrigatórios

### Motivo obrigatório

Payload padrão:

```json
{
  "reason_code": "CORRECAO_ERRO_OPERADOR",
  "reason_note": "Detalhe obrigatório quando reason_code=OUTROS ou ação exigir"
}
```

### Permissão negada

Resposta padrão:

```json
{
  "code": "RBAC_FORBIDDEN",
  "message": "Action not allowed for actor/profile/scope",
  "audit_event_id": "uuid",
  "details": {
    "action": "edit_confirmed_order",
    "required_scope": "owner_or_team"
  }
}
```

Toda negação relevante deve gerar `audit_event.result = denied`.

### Idempotência

`Idempotency-Key` é obrigatório para:

- `confirm_quote_to_order`;
- `cancel_quote`;
- `cancel_order`;
- `revise_confirmed_order`;
- `revise_invoiced_order`;
- `override_item_price`;
- `register_operational_invoice`;
- `correct_operational_invoice`;
- `send_output` / `generate_pdf` quando houver efeito persistente.

Comportamento obrigatório:

- mesma `Idempotency-Key` + mesmo payload retorna o mesmo resultado;
- mesma `Idempotency-Key` + payload diferente retorna `409 IDEMPOTENCY_CONFLICT`;
- ausência de `Idempotency-Key` em ação crítica retorna `422 IDEMPOTENCY_KEY_REQUIRED`;
- dupla confirmação de ORC nunca cria dois PEDs; se o ORC já foi convertido, retornar o resultado idempotente ou `409 ORC_ALREADY_CONVERTED` conforme chave/payload.

### Status vs badges

Respostas de documento devem separar:

- `commercial_status`: `QUOTE_DRAFT|ORDER_CONFIRMED|INVOICED|CANCELED`;
- `output_badges`: comunicação/PDF/impressão/link;
- `available_actions`: ações permitidas para ator atual.

Comunicação nunca altera `commercial_status`.

`available_actions` é orientativo para UI, calculado pelo backend e não substitui validação RBAC no endpoint da action. A lista pode mudar entre leitura e execução por alteração de status, perfil, ownership, revisão ou tenant.

### Concorrência e revisão

Actions que alteram dado comercial pós-confirmação/faturamento devem enviar `expected_revision_number`:

- `revise_confirmed_order`;
- `revise_invoiced_order`;
- `override_item_price`;
- `correct_operational_invoice`;
- `cancel_order` quando cancela pedido confirmado/faturado.

Conflito de revisão retorna `409 REVISION_CONFLICT`.

## 3) Actions críticas

| Action | Endpoint | Regras |
| --- | --- | --- |
| `confirm_quote_to_order` | `POST /v1/quotes/{quoteId}/actions/confirm` | Confirma orçamento; cria novo PED; preserva ORC; idempotente; audit + lifecycle. |
| `revise_confirmed_order` | `POST /v1/orders/{orderId}/actions/revise-confirmed` | Motivo + revisão + diff + audit; lifecycle quando dado comercial mudar. |
| `revise_invoiced_order` | `POST /v1/orders/{orderId}/actions/revise-invoiced` | ADMIN; confirmação forte; revisão + diff + audit. |
| `override_item_price` | `POST /v1/orders/{orderId}/actions/override-item-price` | Motivo/preço aplicado; pós-confirmação gera revisão. |
| `register_operational_invoice` | `POST /v1/orders/{orderId}/operational-invoice` | 1 registro ativo; move para `INVOICED`; audit + lifecycle. |
| `correct_operational_invoice` | `POST /v1/orders/{orderId}/operational-invoice/actions/correct` | ADMIN; correção/cancelamento operacional; revisão/audit. |
| `cancel_quote` | `POST /v1/quotes/{quoteId}/actions/cancel` | Motivo obrigatório; lifecycle. |
| `cancel_order` | `POST /v1/orders/{orderId}/actions/cancel` | Motivo + confirmação forte + revisão/audit/lifecycle. |
| `send_output` | `POST /v1/commercial-documents/{documentId}/output-events` | Gera `output_event`; nunca muda status. |

## 4) Motivo obrigatório por action

| Action | `reason_code` | `reason_note` |
| --- | --- | --- |
| `revise_confirmed_order` | Obrigatório | Obrigatório se `OUTROS` ou alteração sensível |
| `revise_invoiced_order` | Obrigatório | Obrigatório se `OUTROS`; recomendado sempre |
| `override_item_price` | Obrigatório | Obrigatório se `OUTROS`; recomendado sempre |
| `correct_operational_invoice` | Obrigatório | Obrigatório se `OUTROS`; recomendado sempre |
| `cancel_order` | Obrigatório | Obrigatório se `OUTROS`; recomendado sempre |
| alterar parcelas/vencimentos após confirmação | Obrigatório | Obrigatório se `OUTROS`; recomendado sempre |

## 5) Faturamento operacional

- V1 permite um registro operacional ativo por pedido.
- Novo registro ativo duplicado retorna `409 ACTIVE_OPERATIONAL_INVOICE_EXISTS`.
- Correção/cancelamento ocorre por `correct_operational_invoice` com revisão/auditoria.
- Faturamento parcial permanece decisão futura.

## 6) Cancelamento

- Cancelamento de documento comercial usa actions de `cancel_quote`/`cancel_order` e afeta `commercial_status` do documento comercial.
- Correção/cancelamento de faturamento operacional usa `correct_operational_invoice` e não deve ser tratado apenas como `commercial_status = CANCELED`.

## 7) Cobertura V1

Gate D cobre contratos para:

- clientes completos, contatos e endereços;
- produtos completos;
- tabela de preços e vigência;
- condições de pagamento e parcelas;
- orçamento salvo/numerado;
- ORC -> PED como novo documento vinculado;
- pedidos confirmados/faturados editáveis por permissão;
- revisão/auditoria/timeline;
- faturamento operacional manual e correção;
- comunicação/output events;
- relatórios/listagens operacionais.

## 8) Erros

| Código HTTP | Uso |
| --- | --- |
| 401 | não autenticado: token ausente, inválido ou expirado |
| 403 | autenticado, recurso visível, mas sem permissão para a ação; gera audit denied quando relevante |
| 404 | recurso inexistente ou fora do escopo de visibilidade do ator |
| 409 | conflito de estado, idempotência, revisão, ORC já convertido ou faturamento ativo duplicado |
| 422 | payload inválido, motivo obrigatório ausente, `Idempotency-Key` ausente em ação crítica ou regra de negócio violada |

## 9) Listagens operacionais

Listagens devem suportar filtros, paginação e ordenação conforme aplicável:

- clientes: `q`, `page`, `page_size`, `sort`;
- produtos: `q`, `page`, `page_size`, `sort`;
- orçamentos/pedidos: `document_type`, `commercial_status`, período, `page`, `page_size`, `sort`;
- faturamento operacional/vencimentos: período, status operacional, `page`, `page_size`, `sort`;
- eventos/revisões: documento, período, tipo de evento, `page`, `page_size`, `sort`.

## 10) Implicações para próximos gates

Gate E deve usar:

- `available_actions` para habilitar/desabilitar UI;
- `output_badges` separados de status;
- timeline/revisões como componentes visíveis;
- padrões de erro para mensagens e confirmação forte.

Gate F deve planejar migrations/testes para:

- idempotência;
- audit events;
- revision changes;
- RLS/tenant/ownership;
- ORC preservado + PED vinculado.

## 11) Próximo gate

Próximo gate recomendado: **Gate E — Frontend Contract & Shell Plan**.
