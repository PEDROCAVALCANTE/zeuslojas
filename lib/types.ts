
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
  created_at: string;
}
