# Audit Model Ops — ARCO-ERP V1 Operacional

> Status: Gate C — RBAC + Audit Model
> Complementa: `docs/RBAC-MATRIX.md`
> Não autoriza: banco, migrations, API contracts, frontend ou código

## 1) Objetivo

Definir quando gerar `audit_events`, `lifecycle_events`, `output_events`, `commercial_document_revisions` e `commercial_document_revision_changes` na V1 operacional completa.

## 2) Fonte da verdade

| Registro | Fonte da verdade para | Não deve substituir |
| --- | --- | --- |
| `commercial_document_revisions` | before/after comercial de alteração autorizada | audit de permissão |
| `commercial_document_revision_changes` | diff estruturado por campo | snapshot completo |
| `audit_events` | decisão de autorização, negação, falha, governança | lifecycle comercial |
| `lifecycle_events` | marcos do ciclo comercial | diff comercial |
| `output_events` | comunicação, PDF, impressão, link, envio | status comercial |

Payloads podem carregar contexto, mas não devem criar fonte concorrente para o mesmo fato.

## 3) Escopo de acesso auditável

- Acesso de `GESTOR_COMERCIAL` depende de vínculo explícito de equipe/subordinação no mesmo tenant.
- Sem vínculo explícito de equipe, o resultado deve ser `denied`.
- Acesso de `REPRESENTANTE` depende de documento próprio ou cliente da carteira.
- Se a carteira ainda não estiver modelada, o fallback é permitir apenas `owner_id`/`representative_id` igual ao usuário autenticado; demais acessos são `denied`.

## 4) Política de `audit_events`

Gerar `audit_event` para:

- login/autenticação relevante;
- alteração de roles/perfis;
- tentativa negada (`denied`);
- falha operacional relevante (`failed`);
- ação crítica permitida (`allowed`);
- alteração de cliente crítica;
- alteração de produto/preço/condição;
- override de preço;
- confirmação ORC -> PED;
- cancelamento de ORC/PED;
- alteração de pedido confirmado/faturado;
- registro/correção/cancelamento de faturamento operacional;
- exportação sensível;
- exceção temporária de permissão.

Campos mínimos:

- `tenant_id`;
- `actor_id`;
- `actor_role`;
- `entity_type`;
- `entity_id`;
- `action`;
- `result` (`allowed|denied|failed`);
- `reason_code` quando aplicável;
- `reason_note` quando aplicável;
- `event_at`;
- `payload` com contexto não-canônico.

## 5) Política de negação

Toda negação relevante deve registrar:

- ator;
- perfil;
- tenant solicitado;
- entidade alvo;
- ação solicitada;
- motivo da negação;
- resultado `denied`;
- timestamp.

Negações obrigatórias incluem:

- acesso cross-tenant;
- acesso fora da carteira/equipe;
- `GESTOR_COMERCIAL` sem vínculo explícito de equipe;
- edição de pedido confirmado/faturado sem permissão;
- override de preço sem permissão;
- alteração de tabela de preço sem permissão;
- faturamento/correção/cancelamento sem permissão;
- status inválido;
- perfil insuficiente;
- ORC já convertido;
- tentativa de edição comercial de documento cancelado.

## 6) Política de revisão

Gerar `commercial_document_revisions` quando houver alteração comercial pós-confirmação ou pós-faturamento.

Alteração de pedido confirmado/faturado exige, cumulativamente:

1. permissão;
2. motivo;
3. `commercial_document_revisions`;
4. `commercial_document_revision_changes`;
5. `audit_event`;
6. `lifecycle_event` quando alterar dado comercial relevante.

Obrigatório em:

- alterar pedido confirmado;
- alterar item/quantidade/preço/desconto de pedido confirmado;
- alterar condição/parcelas de pedido confirmado;
- cancelar pedido confirmado com impacto comercial;
- alterar pedido faturado;
- corrigir/cancelar faturamento operacional;
- correção de snapshot comercial relevante.

Campos mínimos:

- `commercial_document_id`;
- `revision_number`;
- `reason_code`;
- `reason_note` quando aplicável;
- `actor_id`;
- `actor_role`;
- `before_snapshot`;
- `after_snapshot`;
- `created_at`.

## 7) Política de `revision_changes`

Cada revisão deve registrar diff estruturado para campos críticos:

- cliente/contato/endereço aplicado;
- item/produto/unidade;
- quantidade;
- preço base/aplicado;
- desconto;
- tabela de preço;
- condição de pagamento;
- parcelas/vencimentos;
- status;
- faturamento operacional.

Campos mínimos:

- `revision_id`;
- `field_path`;
- `old_value`;
- `new_value`;
- `impact_type` (`price|quantity|payment|customer|product|status|invoice|other`).

## 8) Política de `lifecycle_events`

Gerar lifecycle para marcos comerciais:

- `QUOTE_CREATED`;
- `QUOTE_UPDATED` quando relevante;
- `QUOTE_CANCELED`;
- `QUOTE_CONVERTED_TO_ORDER`;
- `ORDER_CONFIRMED`;
- `ORDER_ADJUSTED` quando revisão alterar dado comercial relevante;
- `ORDER_CANCELED`;
- `ORDER_INVOICED_OPERATIONALLY`;
- `INVOICE_OPERATIONAL_CORRECTED`;
- `INVOICE_OPERATIONAL_CANCELED`.

Lifecycle não substitui revisão nem audit event.

## 9) Política de `output_events`

Gerar output para:

- envio WhatsApp/e-mail;
- geração de PDF;
- impressão;
- cópia/compartilhamento de link.

Regras:

- nunca altera `commercial_status`;
- pode ser exibido como badge/timeline;
- deve registrar ator, canal, destinatário snapshot e documento;
- negação de comunicação fora de escopo gera `audit_event.denied`.

## 10) Política por ação crítica

| Ação `CRITICAL` | Audit | Revision | Revision changes | Lifecycle | Output | Confirmação forte |
| --- | --- | --- | --- | --- | --- | --- |
| `manage_roles` | `allowed/denied/failed` | Não | Não | Não | Não | Sim |
| `change_customer_owner` | `allowed/denied/failed` | Não | Não | Opcional | Não | Sim |
| `create_price_table`/`edit_price_table` | `allowed/denied/failed` | Não | Não | Não | Não | Não |
| `override_item_price` | `allowed/denied/failed` | Sim se pós-confirmação | Sim se pós-confirmação | Sim se dado comercial relevante | Não | Não |
| `confirm_order` | `allowed/denied/failed` | Não | Não | Sim | Não | Não |
| `cancel_quote` | `allowed/denied/failed` | Não | Não | Sim | Não | Não |
| `cancel_order` | `allowed/denied/failed` | Sim | Sim | Sim | Não | Sim |
| `edit_confirmed_order` | `allowed/denied/failed` | Sim | Sim | Sim se dado comercial relevante | Não | Sim se impacto alto |
| `edit_invoiced_order` | `allowed/denied/failed` | Sim | Sim | Sim se dado comercial relevante | Não | Sim |
| `register_operational_invoice` | `allowed/denied/failed` | Não | Não | Sim | Não | Não |
| `correct_operational_invoice` | `allowed/denied/failed` | Sim | Sim | Sim | Não | Sim |
| `send_output`/`generate_pdf` | `allowed/denied` | Não | Não | Não | Sim | Não |

## 11) Confirmação forte

Ações com confirmação forte:

- alterar pedido faturado;
- corrigir/cancelar faturamento operacional;
- cancelar pedido confirmado;
- alterar roles/perfis;
- alterar ownership/carteira;
- alteração de alto impacto em preço/valor/vencimento.

Na V1 documental, confirmação forte significa confirmação explícita e registrada. Reautenticação/MFA fica para gate futuro.

## 12) Implicações para Gate D/API

Gate D deve prever contratos para:

- enviar `reason_code`/`reason_note` em ações críticas;
- retornar 403/409/422 de forma consistente;
- expor timeline com lifecycle/output/revision summary;
- consultar revisões e diff estruturado;
- registrar audit no servidor, nunca confiar apenas no cliente;
- idempotência para confirmar ORC -> PED e registrar faturamento.

## 13) Critério de aceite Gate C

Gate C passa se:

- matriz RBAC cobre perfis, tenant, ownership, status e ações críticas;
- negações relevantes geram audit;
- alteração de pedido confirmado/faturado exige revisão/auditoria;
- preço/tabela de preço têm governança explícita;
- faturamento operacional tem política de correção/cancelamento;
- comunicação permanece `output_event`;
- Gate D é recomendado sem liberar implementação.

## 14) Próximo gate

Próximo gate recomendado: **Gate D — API Contract Alignment**.
