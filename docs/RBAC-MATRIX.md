# RBAC Matrix — ARCO-ERP V1 Operacional

> Status: Gate C — RBAC + Audit Model
> Base: `docs/SPEC.md`, `docs/DECISION-DATA-MODEL-OPS.md`, `docs/DATA-MODEL-OPS.md`, `ROADMAP.md`
> Não autoriza: banco, migrations, API contracts, frontend ou código

## 1) Decisão do Gate C

A V1 usa RBAC operacional com decisão por:

- perfil;
- tenant;
- ownership/carteira;
- status do documento;
- criticidade da ação;
- escopo de valor/preço/desconto quando aplicável.

UI pode ocultar botão, mas a autorização real deve ocorrer no backend/API.

## 2) Perfis oficiais

| Perfil | Status V1 | Escopo |
| --- | --- | --- |
| `ADMIN` | Oficial | Visão e operação global dentro do tenant. |
| `REPRESENTANTE` | Oficial | Opera clientes/documentos próprios dentro do tenant. |
| `GESTOR_COMERCIAL` | Oficial condicionado | Opera equipe/subordinados somente quando vínculo explícito existir. |

Regras:

- `OWNER`, se existir na foundation, herda `ADMIN` para este gate.
- `VISUALIZADOR`, `SUPORTE` e perfis externos ficam bloqueados para gate futuro.
- Exceções temporárias exigem `audit_event`, motivo, escopo e expiração.

## 3) Escopo obrigatório

### Tenant

- Toda leitura/escrita exige `tenant_id` válido.
- FK tenant-scoped deve respeitar o mesmo `tenant_id`.
- Acesso cross-tenant é sempre `Deny` + `audit_event.result = denied`.

### Ownership/carteira

- Documento próprio: `commercial_documents.owner_id` ou `representative_id` igual ao usuário autenticado.
- Cliente da carteira: `customers.owner_id`/`representative_id` ou vínculo de carteira equivalente aponta para o usuário autenticado.
- Equipe/subordinação: relação explícita entre `GESTOR_COMERCIAL` e representantes subordinados no mesmo tenant.
- `REPRESENTANTE` só acessa clientes/documentos próprios ou da própria carteira.
- `GESTOR_COMERCIAL` acessa próprios + equipe subordinada explicitamente cadastrada.
- Sem carteira/equipe modelada ou sem vínculo explícito, o fallback é `Deny` para `REPRESENTANTE`/`GESTOR_COMERCIAL` fora do próprio `owner_id`/`representative_id`.
- `ADMIN` acessa todos os registros do tenant.
- Alterar ownership/carteira é ação administrativa.

## 4) Matriz por ação

Legenda: `Allow`, `Deny`, `Conditional`.

| Área | Ação canônica | ADMIN | GESTOR_COMERCIAL | REPRESENTANTE | Condições obrigatórias |
| --- | --- | --- | --- | --- | --- |
| Auth | `authenticate` | Allow | Allow | Allow | Credenciais válidas; tenant ativo. |
| Usuários/Roles | `manage_roles` | Allow | Deny | Deny | Audit obrigatório. |
| Usuários/Roles | `grant_temporary_exception` | Allow | Deny | Deny | Motivo + expiração + escopo + audit. |
| Clientes | `view_customer` | Allow | Conditional | Conditional | Gestor: vínculo de equipe; Rep: carteira própria. |
| Clientes | `create_customer` | Allow | Conditional | Conditional | Tenant obrigatório; owner definido; audit allowed para criação. |
| Clientes | `edit_customer` | Allow | Conditional | Conditional | Gestor: vínculo de equipe; Rep: carteira própria; mudança crítica gera audit. |
| Clientes | `edit_customer_contact_address` | Allow | Conditional | Conditional | Mesmo escopo do cliente; snapshots antigos não mudam. |
| Clientes | `change_customer_owner` | Allow | Conditional | Deny | Gestor apenas dentro da equipe, se política futura permitir; audit obrigatório. |
| Clientes | `delete_customer` | Deny | Deny | Deny | Exclusão física bloqueada na V1; usar status/inativação futura. |
| Produtos | `view_product` | Allow | Allow | Allow | Mesmo tenant. |
| Produtos | `create_product` | Allow | Conditional | Deny | Gestor somente se receber permissão explícita; audit obrigatório. |
| Produtos | `edit_product` | Allow | Conditional | Deny | Gestor somente se receber permissão explícita; audit obrigatório. |
| Produtos | `deactivate_product` | Allow | Conditional | Deny | Não altera documentos confirmados. |
| Tabela de preço | `view_price_table` | Allow | Allow | Allow | Mesmo tenant; Rep visualiza tabelas aplicáveis. |
| Tabela de preço | `create_price_table` | Allow | Conditional | Deny | Gestor somente com permissão explícita; audit obrigatório. |
| Tabela de preço | `edit_price_table` | Allow | Conditional | Deny | Proibir vigência conflitante; audit obrigatório. |
| Tabela de preço | `edit_price_table_item` | Allow | Conditional | Deny | Proibir vigência conflitante; audit obrigatório. |
| Condições pagamento | `view_payment_term` | Allow | Allow | Allow | Mesmo tenant. |
| Condições pagamento | `create_payment_term` | Allow | Conditional | Deny | Gestor somente com permissão explícita; audit obrigatório. |
| Condições pagamento | `edit_payment_term` | Allow | Conditional | Deny | Gestor somente com permissão explícita; audit obrigatório. |
| Orçamento | `create_quote` | Allow | Conditional | Conditional | Cliente no escopo; documento nasce no tenant. |
| Orçamento | `edit_quote` | Allow | Conditional | Conditional | Gestor: vínculo de equipe; Rep: próprio; sem afetar PED já criado. |
| Orçamento | `override_item_price` | Allow | Conditional | Conditional | Exige `price_override_reason`; audit allowed; limites por Gate D. |
| Orçamento | `cancel_quote` | Allow | Conditional | Conditional | Motivo obrigatório; Rep apenas próprio. |
| Orçamento | `confirm_order` | Allow | Conditional | Conditional | Cliente/documento no escopo; gera novo PED; idempotência; audit + lifecycle. |
| Pedido confirmado | `view_confirmed_order` | Allow | Conditional | Conditional | Gestor: vínculo de equipe; Rep: próprio. |
| Pedido confirmado | `edit_confirmed_order` | Allow | Conditional | Deny | Permissão + motivo + revisão + diff estruturado + audit + lifecycle se dado comercial mudar. |
| Pedido confirmado | `override_item_price` | Allow | Conditional | Deny | Motivo + ator + revisão; limite de desconto por Gate D. |
| Pedido confirmado | `cancel_order` | Allow | Conditional | Deny | Motivo obrigatório; lifecycle; audit. |
| Pedido confirmado | `register_operational_invoice` | Allow | Conditional | Deny | 1 registro ativo; audit + lifecycle; Rep bloqueado. |
| Pedido faturado | `view_invoiced_order` | Allow | Conditional | Conditional | Gestor: vínculo de equipe; Rep: próprio, leitura apenas. |
| Pedido faturado | `edit_invoiced_order` | Allow | Deny | Deny | ADMIN somente; motivo forte + revisão + diff estruturado + audit + lifecycle se dado comercial mudar + confirmação forte. |
| Pedido faturado | `correct_operational_invoice` | Allow | Deny | Deny | ADMIN somente; revisão/audit; não usar `commercial_status=CANCELED` sozinho. |
| Comunicação | `send_output` | Allow | Conditional | Conditional | Mesmo escopo; gera `output_event`; nunca muda `commercial_status`. |
| Comunicação | `generate_pdf` | Allow | Conditional | Conditional | Mesmo escopo; gera `output_event`; nunca muda `commercial_status`. |
| Auditoria | `view_audit_timeline` | Allow | Conditional | Conditional | Timeline filtrada por tenant + escopo; Rep só próprio. |
| Relatórios | `view_operational_reports` | Allow | Conditional | Conditional | Filtro por tenant; Gestor equipe; Rep próprio. |
| Relatórios | `export_report` | Allow | Conditional | Conditional | Audit para exportação sensível; limites por Gate D. |

## 5) Política por status comercial

| Status | Ações permitidas | Ações bloqueadas |
| --- | --- | --- |
| `QUOTE_DRAFT` | editar, cancelar, comunicar, confirmar conforme escopo | faturar; gerar PED por mutação destrutiva do ORC |
| `ORDER_CONFIRMED` | visualizar, comunicar, faturar, cancelar/admin, revisar/admin/gestor autorizado | edição livre; alteração sem motivo/revisão |
| `INVOICED` | visualizar, comunicar, corrigir por ADMIN | alteração por REPRESENTANTE/GESTOR; correção sem revisão/audit |
| `CANCELED` | visualizar histórico/comunicação permitida | editar dados comerciais; faturar; confirmar |

## 6) Ações críticas

Toda ação crítica deve validar permissão no backend/API e registrar auditoria.

| Ação `CRITICAL` | Motivo | Revisão | Audit | Lifecycle | Confirmação forte |
| --- | --- | --- | --- | --- | --- |
| `manage_roles` | Obrigatório | Não | `allowed/denied/failed` | Não | Sim |
| `change_customer_owner` | Obrigatório | Não | `allowed/denied/failed` | Opcional | Sim |
| `create_price_table`/`edit_price_table` | Obrigatório para mudança sensível | Não | `allowed/denied/failed` | Não | Não |
| `override_item_price` | Obrigatório | Se pós-confirmação | `allowed/denied/failed` | Se pós-confirmação | Não |
| `confirm_order` | Não, salvo exceção | Não | `allowed/denied/failed` | Sim | Não |
| `cancel_quote` | Obrigatório | Não | `allowed/denied/failed` | Sim | Não |
| `cancel_order` | Obrigatório | Sim | `allowed/denied/failed` | Sim | Sim |
| `edit_confirmed_order` | Obrigatório | Sim | `allowed/denied/failed` | Sim quando dado comercial mudar | Sim para impacto alto |
| `register_operational_invoice` | Obrigatório quando manual | Não | `allowed/denied/failed` | Sim | Não |
| `edit_invoiced_order` | Obrigatório | Sim | `allowed/denied/failed` | Sim quando dado comercial mudar | Sim |
| `correct_operational_invoice` | Obrigatório | Sim | `allowed/denied/failed` | Sim | Sim |
| `export_report` sensível | Obrigatório quando amplo | Não | `allowed/denied/failed` | Não | Não |

Confirmação forte na V1 significa confirmação explícita de UI/API e pode evoluir para reautenticação em gate futuro.

## 7) Motivo obrigatório

Motivo obrigatório para:

- cancelamento de orçamento/pedido;
- alteração de pedido confirmado/faturado;
- alteração de preço aplicado fora da tabela;
- alteração de tabela de preço/vigência;
- correção/cancelamento de faturamento operacional;
- alteração de ownership/carteira;
- exceção temporária de permissão;
- tentativa manual de operação fora do fluxo padrão.

Se `reason_code = OUTROS`, `reason_note` é obrigatório.

## 8) Negações obrigatórias

Devem retornar 403 e gerar `audit_event.result = denied`:

1. Qualquer acesso cross-tenant.
2. `REPRESENTANTE` acessar carteira/documento de outro representante.
3. `REPRESENTANTE` editar pedido confirmado.
4. `REPRESENTANTE` editar pedido faturado.
5. `REPRESENTANTE` cancelar pedido confirmado.
6. `REPRESENTANTE` registrar/corrigir faturamento operacional.
7. `REPRESENTANTE` criar/editar produto, tabela de preço ou condição de pagamento.
8. `GESTOR_COMERCIAL` operar fora da equipe.
9. Qualquer perfil sem permissão executar `override_item_price`.
10. Qualquer perfil sem permissão alterar tabela de preço/vigência.
11. Qualquer perfil sem permissão faturar, corrigir faturamento ou cancelar pedido.
12. Qualquer perfil editar `CANCELED` comercialmente.
13. Qualquer perfil confirmar ORC já convertido.

Erros de regra de estado/idempotência podem retornar 409/422, mas devem gerar audit quando relevantes.

## 9) Permissões bloqueadas para gate futuro

- `VISUALIZADOR`.
- `SUPORTE/OPERACAO`.
- Delegação temporária por representante.
- Limites numéricos de desconto por faixa/cliente/produto.
- Reautenticação real/MFA para ação sensível.
- Faturamento parcial.
- Estoque bloqueante.
- Comissões/metas formais.

## 10) Implicações para Gate D/API

Gate D deve refletir:

- resposta 403 para `Deny`;
- 409 para conflito/idempotência;
- 422 para payload inválido ou transição proibida;
- campos obrigatórios de `reason_code`, `reason_note`, `price_override_reason`;
- endpoints de revisão/eventos/auditoria;
- contratos com `actor_id`, `actor_role`, `tenant_id`, `owner_id/representative_id`;
- autorização server-side em cada ação crítica.

## 11) Implicações para migrations, frontend e testes

Migrations futuras devem prever:

- roles/perfis;
- tenant memberships;
- audit events;
- revision changes;
- campos de ator/motivo/resultado.

Frontend futuro deve:

- ocultar/desabilitar ações bloqueadas;
- exibir motivo obrigatório;
- mostrar confirmação forte em ações críticas;
- exibir timeline/revisões sem substituir autorização server-side.

Testes futuros devem cobrir:

- allow/deny por perfil;
- cross-tenant deny;
- ownership deny;
- status deny;
- revisão/audit obrigatórios;
- comunicação sem mudar `commercial_status`.

## 12) Próximo gate

Próximo gate recomendado: **Gate D — API Contract Alignment**.

Motivo: permissões, auditoria, revisão e negações agora estão definidos para derivar contratos de API sem iniciar implementação.
