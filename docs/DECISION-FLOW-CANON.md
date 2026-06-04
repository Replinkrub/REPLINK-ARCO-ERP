# DECISION — Flow Canon Gate 0 (ARCO-ERP V1)

> Status: decisão documental de direção  
> Escopo: produto e governança funcional  
> Fonte de descoberta local: `erp_app_flow_map.html` (não versionado neste gate)  
> Fonte canônica após este gate: `docs/DECISION-FLOW-CANON.md` + `docs/SPEC.md`

## 1. Objetivo do Gate

Este Gate 0 congela a direção funcional da V1 do ARCO-ERP antes de qualquer alteração em banco, migrations, contratos de API, frontend ou telas.

O objetivo é evitar que a próxima etapa técnica nasça de uma leitura fraca de “MVP mínimo”. A V1 deve ser operacional completa para o fluxo comercial essencial:

```txt
Cliente completo -> Produto completo -> Tabela de preço -> Condições de pagamento -> Orçamento numerado -> Pedido numerado -> Comunicação/saída -> Registro operacional de faturamento -> Revisão/auditoria
```

`erp_app_flow_map.html` é tratado como artefato-fonte de descoberta funcional e referência visual local. Ele não é a fonte canônica final porque mistura UI, lifecycle visual, navegação, notas futuras e regras. Neste gate, ele deve permanecer não versionado e sem alteração; a canonização ocorre neste documento e na `docs/SPEC.md`.

O `ROADMAP.md` continua sendo o mecanismo obrigatório de slicing, sequência e gates de execução. Este Gate 0 não atualiza o roadmap; ele cria a decisão que deve orientar o próximo gate documental de alinhamento do `ROADMAP.md`.

## 2. Direção da V1

A V1 do ARCO-ERP é **operacional completa**, não “pedido simples” e não MVP mínimo.

Direção aprovada:

- o produto deve suportar operação ponta a ponta de cliente, catálogo, preço, pagamento, orçamento, pedido, comunicação, faturamento operacional, alteração auditada e RBAC;
- cliente completo, produto completo, tabela de preços e condições de pagamento entram na V1;
- pedido confirmado e pedido faturado não são imutáveis absolutos: podem ser alterados conforme perfil de acesso, sempre com revisão auditável;
- snapshot comercial é obrigatório para preservar histórico, mas não bloqueia correções posteriores; correções viram novas revisões;
- comunicação/envio/impressão é evento de saída e nunca altera `commercial_status`;
- emissão fiscal real, SEFAZ, gateway e boleto automático permanecem fora até decisão futura explícita.

## 3. Decisões canônicas

1. A V1 do ARCO-ERP é operacional completa, não MVP mínimo.
2. Cliente completo entra na V1.
3. Produto completo entra na V1.
4. Tabela de preços entra na V1.
5. Condições de pagamento entram na V1.
6. Orçamento deve ser criado/salvo e numerado.
7. Pedido deve ser confirmado, numerado, emitido e compartilhável.
8. Comunicação/envio/impressão não altera `commercial_status`.
9. Pedido confirmado pode ser alterado conforme perfil de acesso.
10. Pedido faturado pode ser alterado por `ADMIN`.
11. Toda alteração pós-confirmação/faturamento deve gerar revisão auditável.
12. Snapshot comercial é obrigatório, mas não significa bloqueio absoluto; significa preservação histórica por revisão.
13. Faturamento manual/operacional entra na V1.
14. Emissão de NF-e, SEFAZ, gateway e boleto automático continuam fora, salvo decisão futura explícita.
15. RBAC e auditoria são requisitos da V1, não pós-V1.

## 4. Invariantes obrigatórios

- `commercial_status` só pode representar estado comercial do orçamento/pedido, não ação de comunicação.
- Comunicação, impressão, PDF, link e WhatsApp são `output_events` ou badges derivados de eventos.
- Todo pedido confirmado mantém vínculo com o orçamento de origem.
- Todo pedido confirmado possui snapshot comercial da confirmação.
- Toda alteração pós-confirmação/faturamento gera revisão com antes/depois, ator, motivo e data.
- Dados cadastrais atuais não podem reescrever silenciosamente a verdade histórica de pedidos já confirmados.
- RBAC deve ser aplicado no produto, nas APIs e nos documentos de aceite.
- Faturamento manual/operacional não pode ser confundido com emissão fiscal ou cobrança automática.
- ROADMAP é o mecanismo de slicing e gates; a V1 operacional completa deve ser quebrada em fases executáveis antes de qualquer implementação.

## 5. Escopo obrigatório da V1

### Cliente completo

- lista, busca e filtros;
- cadastro e edição;
- CNPJ/documento e dados legais;
- endereços, incluindo entrega;
- contatos, incluindo responsável, WhatsApp e e-mail;
- status do cliente;
- condições comerciais padrão;
- histórico comercial.

### Produto completo

- lista e busca por nome/SKU;
- detalhe técnico/comercial;
- marca, categoria, embalagem/unidade de venda;
- disponibilidade/estoque operacional quando aplicável;
- relação com tabela de preços.

### Tabela de preços

- preço por produto ou linha;
- preço por faixa/volume quando aplicável;
- vínculo com condição de pagamento e perfil de cliente quando aplicável;
- margem/limite operacional quando definido;
- snapshot obrigatório no orçamento/pedido.

### Condições de pagamento

- forma de pagamento;
- prazo;
- tipo: à vista, faturado, parcelado ou antecipado;
- parcelas/vencimentos;
- condição padrão por cliente;
- simulação/aplicação no orçamento.

### Comercial

- orçamento criado, salvo e numerado (`ORC-####`);
- steps cliente, produtos, pagamento e revisão;
- confirmação de pedido com número próprio (`PED-####`);
- emissão/visualização operacional do pedido;
- comunicação/compartilhamento/impressão;
- cancelamento e alteração auditados.

### Faturamento manual/operacional

- registro manual de documento/referência fiscal ou comercial;
- data;
- valor;
- vencimento(s);
- observação;
- alteração por `ADMIN` com revisão auditável.

### RBAC e auditoria

- perfis e permissões mínimas da V1;
- ações críticas protegidas por perfil;
- trilha de revisão e eventos obrigatória.

## 6. Fora de escopo explícito

- emissão de NF-e;
- integração SEFAZ;
- cálculo fiscal completo;
- boleto bancário automático;
- gateway de pagamento;
- conciliação automática;
- integração externa obrigatória;
- CRM avançado/agenda comercial;
- regras automáticas de desconto;
- regras automáticas de faturamento/crédito;
- fluxo de caixa avançado;
- perfil `VISUALIZADOR`, salvo decisão posterior explícita;
- comissões, metas e lógica específica de representação como requisito bloqueante da V1 comum.

## 7. Regras de status comercial

Estados comerciais oficiais:

1. `QUOTE_DRAFT` — orçamento em rascunho.
2. `ORDER_CONFIRMED` — pedido confirmado.
3. `INVOICED` — pedido com registro operacional de faturamento.
4. `CANCELED` — orçamento ou pedido cancelado.

Regras:

- `Comunicado`, `Compartilhado`, `Enviado`, `Impresso` e `PDF gerado` são proibidos como `commercial_status`.
- Comunicação pode gerar badge derivado, por exemplo “Enviado por WhatsApp”, mas não muda o estado comercial.
- Pedido faturado (`INVOICED`) pode ser alterado por `ADMIN` com revisão; isso não autoriza fiscal real.
- Cancelamento deve exigir motivo e trilha de auditoria.

Brecha a evitar: se “Comunicado” virar status, relatórios, transições e permissões passam a confundir distribuição com ciclo comercial.

## 8. Regras de numeração ORC/PED

- Orçamento usa sequência própria `ORC-####`.
- Pedido usa sequência própria `PED-####`.
- O número de orçamento nasce quando o orçamento é criado/salvo após cliente válido.
- O número de pedido nasce apenas na confirmação do pedido.
- Um pedido confirmado deve preservar referência ao orçamento de origem.
- Número não deve carregar data como semântica principal; datas ficam em campos próprios.

Brecha a evitar: orçamento não numerado ou pedido reaproveitando número de orçamento reduz rastreabilidade e dificulta atendimento, impressão, revisão e auditoria.

## 9. Regras de cliente

Cliente completo é parte da V1.

Regras:

- cliente deve ter dados legais e operacionais suficientes para orçamento/pedido;
- contato responsável, WhatsApp/e-mail e endereço de entrega são dados operacionais críticos;
- condição padrão do cliente deve poder ser aplicada ao orçamento, mas pode ser sobrescrita com trilha/snapshot;
- cliente inativo não deve sumir do histórico;
- alteração cadastral posterior não altera pedido confirmado retroativamente.

Brechas a corrigir na próxima PR:

- cliente “completo” sem contatos inviabiliza comunicação;
- cliente “completo” sem endereço de entrega cria pedido operacionalmente incompleto;
- cliente sem snapshot contamina pedido antigo quando cadastro muda.

## 10. Regras de produto

Produto completo é parte da V1.

Regras:

- produto deve ter SKU/código, descrição, marca, categoria, embalagem/unidade e preço aplicável;
- produto sem disponibilidade pode ser incluído com aviso se a regra operacional permitir;
- preço exibido no orçamento deve ser rastreável à tabela/preço aplicado;
- alteração futura no cadastro/produto não recalcula pedido confirmado sem revisão explícita.

Brechas a corrigir na próxima PR:

- produto sem unidade/embalagem quebra conferência física;
- produto sem snapshot de descrição/preço permite divergência entre pedido emitido e cadastro atual;
- disponibilidade sem regra clara pode gerar promessa comercial inviável.

## 11. Regras de tabela de preço

Tabela de preço entra na V1.

Regras:

- tabela deve informar preço aplicável por produto/linha e, quando necessário, por volume, condição ou perfil de cliente;
- preço final aplicado ao orçamento/pedido deve ser preservado em snapshot;
- descontos ou ajustes manuais precisam ter limite, ator e motivo quando fora da regra padrão;
- atualização de tabela de preço não altera pedidos/orçamentos já confirmados sem revisão.

Brechas a evitar:

- tabela de preço sem snapshot altera a verdade econômica do pedido antigo;
- preço editável sem RBAC/motivo cria risco de margem e auditoria;
- tabela sem vigência dificulta explicar qual preço valia na data do orçamento.

## 12. Regras de pagamento

Condições de pagamento entram na V1.

Regras:

- pagamento define forma, prazo, parcelas e vencimentos;
- condição de pagamento não é faturamento;
- condição padrão do cliente pode ser pré-carregada no orçamento;
- cronograma de vencimentos deve ser preservado no snapshot;
- alteração pós-confirmação exige revisão auditável.

Brechas a evitar:

- confundir condição de pagamento com faturamento;
- não congelar vencimentos e gerar divergência entre acordo comercial e cobrança operacional;
- permitir prazo personalizado sem ator/motivo quando afetar risco financeiro.

## 13. Regras de pedido

Regras:

- orçamento nasce com cliente válido, é salvo e recebe número `ORC-####`;
- pedido nasce somente por confirmação explícita, recebe número `PED-####` e preserva vínculo com o orçamento;
- pedido deve ser emitido/visualizável e compartilhável;
- pedido confirmado pode ser alterado conforme perfil de acesso;
- pedido faturado pode ser alterado por `ADMIN`;
- cada alteração pós-confirmação/faturamento cria revisão auditável;
- comunicação não confirma pedido e não muda status.

Brecha a corrigir na próxima PR: o flow-map usa linguagem de “imutável” em alguns pontos; a decisão canônica corrige isso para “preservado por snapshot e revisável por permissão”.

## 14. Regras de alteração pós-confirmação/faturamento

Pedido confirmado e pedido faturado não são imutáveis absolutos.

Regras:

- alteração em pedido confirmado exige perfil autorizado, motivo e revisão;
- alteração em pedido faturado exige `ADMIN`, motivo e revisão;
- a revisão deve preservar antes/depois e não apagar a versão anterior;
- alteração pode afetar itens, preço, condição de pagamento, observações ou referência operacional, conforme matriz de permissões futura;
- se a alteração afetar valor ou vencimentos, precisa ficar explícita em relatório e histórico.

Riscos:

- editar pedido faturado sem revisão pode quebrar confiança, conciliação e histórico;
- permitir edição ampla sem RBAC cria risco financeiro;
- bloquear toda edição gera operação inviável quando erro humano ocorre depois da confirmação/faturamento.

## 15. Regras de auditoria/revisão

Regras obrigatórias:

- toda revisão pós-confirmação/faturamento registra ator, perfil, data/hora, motivo, campos alterados, valor anterior e valor novo;
- motivo é obrigatório para cancelamento, alteração de valor, alteração de quantidade, alteração de pagamento, alteração de faturamento e alteração de cliente/endereço em pedido confirmado;
- histórico deve ser consultável no detalhe do pedido;
- revisão não é `commercial_status`;
- `ORDER_ADJUSTED` é evento/revisão, não estado comercial.

Brechas a evitar:

- revisão administrativa sem motivo;
- histórico que mostra só “alterado” sem antes/depois;
- alterações em JSON/snapshot sem trilha compreensível para operação.

## 16. Regras de faturamento manual

O nome canônico da V1 é **Registro Operacional de Faturamento**.

Permitido:

- informar manualmente número/documento fiscal ou referência operacional;
- registrar data;
- registrar valor;
- registrar vencimento(s);
- registrar observação;
- alterar por `ADMIN` com revisão auditável.

Proibido nesta fase:

- emitir NF-e;
- integrar SEFAZ;
- gerar boleto automático;
- integrar gateway;
- fazer conciliação automática;
- exigir anexo fiscal obrigatório como condição da V1.

Brecha a evitar: se “faturamento manual” virar promessa fiscal, o escopo passa a exigir SEFAZ, cálculo tributário, boleto, contas a receber e conciliação, o que está explicitamente fora da V1.

## 17. Regras de RBAC

RBAC é requisito da V1.

Regras mínimas:

- `ADMIN` pode configurar, alterar pedido confirmado, alterar pedido faturado, registrar/corrigir faturamento operacional, cancelar pedido e gerenciar usuários;
- `REPRESENTANTE` pode criar cliente/orçamento, montar orçamento, confirmar pedido próprio e executar comunicação conforme escopo autorizado;
- alterações críticas de preço, pagamento, pedido confirmado e pedido faturado devem respeitar perfil e registrar auditoria;
- `VISUALIZADOR` permanece fora da V1 até decisão explícita;
- exceções temporárias devem ser auditáveis.

Brechas a evitar:

- RBAC fraco permite alteração financeira indevida;
- RBAC só na UI não protege API/serviço;
- ausência de negação explícita gera permissões implícitas perigosas.

## 18. Ambiguidades ainda abertas

Estas ambiguidades não autorizam implementação; devem ser resolvidas nas próximas PRs documentais/técnicas:

1. Quais campos exatamente compõem “cliente completo” na V1?
2. Quantos endereços por cliente entram na V1: cobrança, entrega, principal?
3. Contatos múltiplos entram como obrigatório ou opcional com um contato principal obrigatório?
4. Como definir vigência de tabela de preço?
5. Quais alterações de preço exigem `ADMIN` e quais podem ser feitas por `REPRESENTANTE`?
6. Quais condições de pagamento são padrão da V1 e quais são configuráveis?
7. Pedido faturado alterado deve manter `INVOICED` sempre ou pode voltar para outro estado em casos excepcionais?
8. Como cancelar ou corrigir Registro Operacional de Faturamento sem criar fiscal real?
9. Comissões/metas aparecem no flow-map, mas devem ficar fora do núcleo comum ou entrar como relatório informativo opcional?
10. Qual nível de autenticação adicional é exigido para confirmar pedido ou alterar pedido faturado?

## 19. Critérios de aceite para a próxima PR

A próxima PR documental só é aceitável se:

1. `docs/SPEC.md` abandonar linguagem de “MVP mínimo” para a V1 e refletir V1 operacional completa.
2. Cliente completo, produto completo, tabela de preço e condições de pagamento estiverem no escopo obrigatório da V1.
3. Pedido confirmado/faturado editável estiver tratado como alteração por perfil + revisão/auditoria, não como mutação livre.
4. Comunicação continuar separada de `commercial_status`.
5. Registro Operacional de Faturamento permanecer manual/operacional, sem fiscal real.
6. Snapshot comercial aparecer como preservação histórica por revisão, não como bloqueio absoluto.
7. RBAC e auditoria aparecerem como requisitos da V1.
8. Nenhuma alteração em banco, migrations, API contracts, frontend ou `erp_app_flow_map.html` for incluída.
9. O diff da PR conter apenas documentos permitidos pelo gate.
10. O próximo gate obrigatório for alinhamento do `ROADMAP.md` para fatiar a V1 operacional completa em fases/gates executáveis.
11. As brechas deste documento forem resolvidas ou explicitamente mantidas como decisão aberta com owner/gate futuro.
