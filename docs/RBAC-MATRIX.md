# RBAC Matrix — ARCO-ERP v0

Status: planning-only  
Perfis oficiais MVP: `ADMIN`, `REPRESENTANTE`

## Regras base

- REPRESENTANTE opera apenas dados da própria carteira comercial.
- ADMIN/OWNER pode operar visão global.
- SAGRADO é legado de consulta pontual; não cria exceções de permissão no ARCO-ERP.
- REPRESENTANTE não pode alterar ownership/carteira de cliente.
- REPRESENTANTE não pode excluir registros comerciais.

## Matriz por ação

| Área | Ação | ADMIN | REPRESENTANTE | Condições/Observações |
|---|---|---|---|---|
| Login | Autenticar | Allow | Allow | Credenciais válidas |
| Clientes | Criar cliente | Allow | Allow | Apenas para carteira do próprio representante |
| Clientes | Editar cliente | Allow | Allow | REPRESENTANTE apenas clientes da própria carteira/ownership |
| Clientes | Alterar ownership/carteira | Allow | Deny | Mudança de carteira é ação administrativa |
| Clientes | Excluir cliente | Allow | Deny | REPRESENTANTE não pode excluir registros comerciais |
| Produtos | Visualizar | Allow | Allow | --- |
| Produtos | Criar/editar | Allow | Deny | Catálogo controlado |
| Condições pagamento | Visualizar | Allow | Allow | --- |
| Condições pagamento | Criar/editar | Allow | Deny | Governança comercial central |
| Orçamentos | Criar QUOTE_DRAFT | Allow | Allow | Cliente deve pertencer à carteira do representante |
| Orçamentos | Editar QUOTE_DRAFT | Allow | Allow | Representante apenas próprios |
| Orçamentos | Cancelar QUOTE_DRAFT | Allow | Allow | Representante apenas próprios + motivo |
| Orçamentos | Confirmar pedido | Allow | Allow | Converte para ORDER_CONFIRMED |
| Pedidos | Visualizar ORDER_CONFIRMED | Allow | Allow | Representante apenas próprios |
| Pedidos | Editar fora da própria carteira | Allow | Deny | Escopo obrigatório por ownership |
| Pedidos | Cancelar ORDER_CONFIRMED | Allow | Deny | Motivo obrigatório |
| Pedidos | Ajuste administrativo | Allow | Deny | Gera `order_revision` + `ORDER_ADJUSTED` |
| Pedidos | Registrar faturamento | Allow | Deny | Transição para `INVOICED` |
| Comunicação | Registrar output_event | Allow | Allow | Nunca altera estado comercial |
| Relatórios | Visualizar 8 relatórios MVP | Allow | Allow | Recorte obrigatório por tenant_id + representante_id para REPRESENTANTE |
| Relatórios | Exportar relatório | Allow | Allow | Formato definido em `REPORTS-DICTIONARY.md` |
| Usuários e permissões | Gerenciar perfis/roles | Allow | Deny | S-082 MVP/Foundation |

## Exceções controladas

- `GESTOR_COMERCIAL`: pode visualizar representantes subordinados **se** relação de subordinação existir no cadastro.
- `SUPORTE/OPERACAO`: visualização somente com permissão específica e trilha de auditoria.
- Exceções temporárias exigem registro de audit log com ator, motivo, período e escopo.

## Enforcement técnico obrigatório

- Toda consulta/escrita deve aplicar filtro por `tenant_id`.
- Escopo de representante deve aplicar `owner_id/representante_id`.
- Acesso fora de escopo retorna 403 e registra evento de segurança.

## Casos explícitos de negação (obrigatórios)

1. REPRESENTANTE cancelar `ORDER_CONFIRMED` => **403**.
2. REPRESENTANTE ajustar pedido confirmado => **403**.
3. REPRESENTANTE registrar faturamento => **403**.
4. REPRESENTANTE acessar carteira de outro representante => **403**.
5. REPRESENTANTE alterar ownership/carteira => **403**.
6. Qualquer perfil forçar estado não canônico => **409/422**.

## Mapeamento de estados por ação

- `confirmar pedido`: `QUOTE_DRAFT -> ORDER_CONFIRMED`
- `cancelar orçamento`: `QUOTE_DRAFT -> CANCELED`
- `cancelar pedido`: `ORDER_CONFIRMED -> CANCELED` (ADMIN)
- `faturar`: `ORDER_CONFIRMED -> INVOICED` (ADMIN)
- `ajuste admin`: `ORDER_CONFIRMED -> ORDER_CONFIRMED` + revisão/evento

## Definition of Done (RBAC)

- 100% das ações MVP com Allow/Deny explícito.
- Regras de ownership documentadas para ações de REPRESENTANTE.
- Nenhuma ação crítica sem resposta de negação definida.
