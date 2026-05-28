# SPEC OPS Addendum — AC detalhado (GWT)

Status: planning-only  
Escopo: detalhar critérios testáveis da SPEC v1 para gate de execução técnica.

## Regras globais

- Estados comerciais permitidos: `QUOTE_DRAFT`, `ORDER_CONFIRMED`, `INVOICED`, `CANCELED`.
- `ORDER_ADJUSTED` é evento de revisão, não status.
- `output_events` nunca altera estado comercial.
- SAGRADO-PEDIDOS é legado de consulta pontual (não fonte de decisão operacional).

## Fluxos críticos (Given/When/Then)

## F-01 Criar orçamento
- **Given** cliente válido e representante autenticado
- **When** cria novo orçamento
- **Then** sistema cria registro em `quotes` com estado `QUOTE_DRAFT`, número `ORC-####`, ownership `representante_id` e `created_at`

## F-02 Criar orçamento sem cliente válido
- **Given** representante autenticado
- **When** tenta criar orçamento sem cliente válido
- **Then** operação falha com erro de validação (422) e sem efeitos colaterais

## F-03 Confirmar pedido (conversão única)
- **Given** orçamento em `QUOTE_DRAFT` com dados obrigatórios válidos
- **When** usuário autorizado confirma pedido
- **Then** sistema converte para pedido com estado `ORDER_CONFIRMED`, número `PED-####`, vínculo `quote->order`, snapshot e `confirmed_at`

## F-04 Dupla confirmação simultânea
- **Given** mesmo orçamento sendo confirmado por duas requisições concorrentes
- **When** ambas executam no mesmo intervalo
- **Then** apenas uma confirma; outra retorna conflito (409) sem gerar duplicidade

## F-05 Cancelar orçamento próprio (REPRESENTANTE)
- **Given** representante dono do orçamento em `QUOTE_DRAFT`
- **When** cancela com motivo
- **Then** estado vira `CANCELED` e registra trilha (ator, motivo, data)

## F-06 Cancelar pedido confirmado (ADMIN)
- **Given** pedido em `ORDER_CONFIRMED`
- **When** ADMIN cancela com motivo
- **Then** estado vira `CANCELED` e registra trilha completa

## F-07 Cancelar pedido confirmado (REPRESENTANTE)
- **Given** pedido em `ORDER_CONFIRMED`
- **When** REPRESENTANTE tenta cancelar
- **Then** operação negada (403) e sem alteração de estado

## F-08 Ajuste administrativo
- **Given** pedido em `ORDER_CONFIRMED`
- **When** ADMIN ajusta itens/valor
- **Then** estado comercial permanece `ORDER_CONFIRMED` e registra `order_revision` + `lifecycle_event` `ORDER_ADJUSTED`

## F-09 Registrar faturamento simples
- **Given** pedido em `ORDER_CONFIRMED`
- **When** ADMIN registra faturamento
- **Then** estado vira `INVOICED`, grava `invoiced_at` e referência manual opcional

## F-10 Faturar sem permissão
- **Given** pedido em `ORDER_CONFIRMED`
- **When** REPRESENTANTE tenta faturar
- **Then** operação negada (403) sem alteração

## F-11 Comunicação de saída
- **Given** pedido/orçamento em qualquer estado válido
- **When** usuário executa `SEND_WHATSAPP|SEND_EMAIL|GENERATE_PDF|PRINT|COPY_LINK|SHARE`
- **Then** sistema registra `output_event` e mantém `commercial_status` inalterado

## F-12 Estado inválido/manual
- **Given** tentativa de transição fora da máquina canônica
- **When** operação é submetida
- **Then** sistema bloqueia com erro de regra (409/422), mantendo integridade

## Definition of Done (qualidade)

- 100% dos fluxos críticos acima com cenários positivos e negativos cobertos.
- Erros esperados definidos (422/403/409).
- Sem contradições com `docs/SPEC.md`.

## Taxonomia canônica de motivos (MVP)

## Motivos de cancelamento

- `CLIENTE_DESISTIU`
- `PRECO_CONDICAO_REPROVADA`
- `ERRO_CADASTRO_CLIENTE`
- `ERRO_ITEM_QUANTIDADE`
- `ERRO_CONDICAO_PAGAMENTO`
- `PRODUTO_INDISPONIVEL`
- `DUPLICIDADE`
- `PRAZO_ENTREGA_INVIAVEL`
- `CANCELAMENTO_INTERNO`
- `OUTROS`

## Motivos de ajuste

- `AJUSTE_PRECO`
- `AJUSTE_DESCONTO`
- `AJUSTE_QUANTIDADE`
- `AJUSTE_ITEM`
- `AJUSTE_CONDICAO_PAGAMENTO`
- `AJUSTE_FRETE`
- `AJUSTE_DADOS_CLIENTE`
- `AJUSTE_FISCAL_OPERACIONAL`
- `CORRECAO_ERRO_OPERADOR`
- `OUTROS`

## Regras obrigatórias de preenchimento

- Motivo é obrigatório para cancelamento e ajuste relevante.
- Se motivo = `OUTROS`, observação textual é obrigatória.
- Inclusão de novos motivos só pode ocorrer com decisão registrada no projeto.
- Motivos existentes não devem ser renomeados sem trilha de migração/auditoria.
