export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'GERENTE' | 'CAIXA';

export interface Tenant {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
}

export interface User {
  uid: string;
  nome: string;
  email: string;
  role: Role;
  tenant_id: string | null;
  ativo: boolean;
  created_at: string;
}

export interface Produto {
  id: string;
  codigo?: string;
  nome: string;
  categoria: string;
  preco: number;
  estoque_minimo: number;
  ativo: boolean;
  created_at: string;
}

export interface Estoque {
  id: string;
  produto_id: string;
  tenant_id: string;
  quantidade: number;
  data_atualizacao: string;
}

export interface Movimentacao {
  id: string;
  produto_id: string;
  tenant_id: string;
  tipo: 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA';
  quantidade: number;
  data: string;
  motivo?: string;
  tenant_origem: string | null;
  tenant_destino: string | null;
  mapped_product_id?: string;
  created_at: string;
}

export interface Transacao {
  id: string;
  tenant_id: string;
  tipo: 'RECEITA' | 'DESPESA';
  valor: number;
  descricao: string;
  categoria: string;
  data: string;
  metodo_pagamento?: string;
  created_at: string;
}

export interface Caixa {
  id: string;
  tenant_id: string;
  data: string;
  saldo_inicial: number;
  total_vendas: number;
  total_pix: number;
  total_cartao: number;
  total_dinheiro: number;
  saldo_final?: number;
  status: 'ABERTO' | 'FECHADO';
  criado_por?: string;
}

export interface NotaFiscal {
  id: string;
  tenant_id: string;
  tipo: 'ENTRADA' | 'SAIDA';
  numero: string;
  valor_total: number;
  data: string;
}
