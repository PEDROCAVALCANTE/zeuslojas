
export type Role = 'SUPER_ADMIN' | 'ADMIN_LOJA';

export interface User {
  uid: string;
  nome: string;
  email: string;
  role: Role;
  tenant_id: string | null;
  ativo: boolean;
  created_at: string;
}

export interface Tenant {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
}

export interface Produto {
  id: string;
  nome: string;
  categoria: string;
  preco: number;
  ativo: boolean;
  created_at: string;
}

export interface Estoque {
  id: string;
  produto_id: string;
  tenant_id: string;
  quantidade: number;
  updated_at: string;
}

export type MovimentacaoTipo = 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA';

export interface Movimentacao {
  id: string;
  tipo: MovimentacaoTipo;
  produto_id: string;
  quantidade: number;
  tenant_origem: string | null;
  tenant_destino: string | null;
  criado_por: string;
  created_at: string;
}

export type TransacaoTipo = 'RECEITA' | 'DESPESA';

export interface Transacao {
  id: string;
  tipo: TransacaoTipo;
  valor: number;
  tenant_id: string;
  descricao: string;
  categoria: string;
  forma_pagamento?: FormaPagamento;
  created_at: string;
}

export type FormaPagamento = 'PIX' | 'CARTAO' | 'DINHEIRO';
export type CaixaStatus = 'ABERTO' | 'FECHADO' | 'VALIDADO';

export interface Caixa {
  id: string;
  tenant_id: string;
  data: string;
  status: CaixaStatus;
  total_vendas: number;
  total_pix: number;
  total_cartao: number;
  total_dinheiro: number;
  criado_por: string;
  validado_por?: string;
  updated_at: string;
}

export interface ItemNota {
  produto_id: string;
  quantidade_original: number;
  quantidade_restante: number;
  preco_custo: number;
  mapped_product_id?: string; // For bulk/granel mapping
}

export interface NotaFiscal {
  id: string;
  numero_nota: string;
  fornecedor: string;
  data_emissao: string;
  rastreavel: boolean;
  tenant_id: string;
  items: ItemNota[];
  criado_por: string;
  created_at: string;
}

export interface LoteEstoque {
  id: string;
  produto_id: string;
  nota_id: string;
  tenant_id: string;
  quantidade_atual: number;
  unidade_medida: 'UN' | 'KG' | 'GRANCAL';
  referencia_original_id?: string; // To link "Granel" to original "Package"
}
