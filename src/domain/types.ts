export type CommercialStatus = 'QUOTE_DRAFT' | 'ORDER_CONFIRMED' | 'INVOICED' | 'CANCELED';

export type Role = 'ADMIN' | 'REPRESENTANTE' | 'OWNER' | 'GESTOR_COMERCIAL' | 'SUPORTE_OPERACAO';

export type OutputEventChannel =
  | 'SEND_WHATSAPP'
  | 'SEND_EMAIL'
  | 'GENERATE_PDF'
  | 'PRINT'
  | 'COPY_LINK'
  | 'SHARE';

export type CancelReason =
  | 'CLIENTE_DESISTIU'
  | 'PRECO_CONDICAO_REPROVADA'
  | 'ERRO_CADASTRO_CLIENTE'
  | 'ERRO_ITEM_QUANTIDADE'
  | 'ERRO_CONDICAO_PAGAMENTO'
  | 'PRODUTO_INDISPONIVEL'
  | 'DUPLICIDADE'
  | 'PRAZO_ENTREGA_INVIAVEL'
  | 'CANCELAMENTO_INTERNO'
  | 'OUTROS';

export type AdjustmentReason =
  | 'AJUSTE_PRECO'
  | 'AJUSTE_DESCONTO'
  | 'AJUSTE_QUANTIDADE'
  | 'AJUSTE_ITEM'
  | 'AJUSTE_CONDICAO_PAGAMENTO'
  | 'AJUSTE_FRETE'
  | 'AJUSTE_DADOS_CLIENTE'
  | 'AJUSTE_FISCAL_OPERACIONAL'
  | 'CORRECAO_ERRO_OPERADOR'
  | 'OUTROS';

export type TransitionAction = 'CONFIRM_ORDER' | 'CANCEL' | 'INVOICE' | 'ADMIN_ADJUST';

export interface TenantScope {
  tenantId: string;
  representativeId?: string;
}
