
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  DollarSign, 
  Store, 
  BarChart3, 
  Plus, 
  ArrowRightLeft, 
  LogOut,
  ChevronDown,
  AlertTriangle,
  TrendingUp,
  History,
  Wallet,
  FileText,
  CheckCircle2,
  ScanLine,
  Truck,
  Trash2,
  ShoppingCart,
  Search,
  UserPlus,
  FileUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  getAuth,
  User as FirebaseUser
} from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import firebaseConfig from '../firebase-applet-config.json';
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  or,
  documentId,
  runTransaction,
  writeBatch
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { auth, db } from './lib/firebase';
import { Tenant, User, Produto, Estoque, Movimentacao, Transacao, Caixa, NotaFiscal } from './types';

export default function ZeusApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('all');
  const [data, setData] = useState<{
    tenants: Tenant[];
    products: Produto[];
    stock: Estoque[];
    movements: Movimentacao[];
    transactions: Transacao[];
    caixas: Caixa[];
    notas: NotaFiscal[];
    users: User[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [uploadingExcel, setUploadingExcel] = useState(false);

  const fetchData = async () => {
    if (!auth.currentUser) return;
    
    setLoading(true);
    try {
      const fetchSnap = async (collPath: string, whereFilters: any[] = []) => {
        try {
          const q = whereFilters.length > 0 
            ? query(collection(db, collPath), ...whereFilters) 
            : collection(db, collPath);
          const snap = await getDocs(q);
          return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e: any) {
          console.warn(`Error fetching ${collPath}:`, e.message);
          return []; // Return empty array if permission denied for one collection
        }
      };

      const qFilters = [];
      const mFilters = [];
      // Set initial selected tenant for non-super admins
      if (userProfile && userProfile.role !== 'SUPER_ADMIN') {
        const tId = userProfile.tenant_id;
        if (tId) {
          setSelectedTenantId(tId);
          qFilters.push(where('tenant_id', '==', tId));
          // Note: Movements requires (tenant_origem == tId OR tenant_destino == tId) which needs OR queries in Firestore
          mFilters.push(
            or(
              where('tenant_origem', '==', tId),
              where('tenant_destino', '==', tId)
            )
          );
        }
      }

      let tenantsFilter: any[] = [];
      if (userProfile && userProfile.role !== 'SUPER_ADMIN') {
        if (userProfile.tenant_id) {
          tenantsFilter = [where(documentId(), '==', userProfile.tenant_id)];
        } else {
          // Force an empty result if an ordinary user has no tenant assigned
          tenantsFilter = [where(documentId(), '==', 'invalid_tenant')];
        }
      }

      const [tenants, products, stock, movements, transactions, caixas, notas] = await Promise.all([
        fetchSnap('tenants', tenantsFilter),
        fetchSnap('produtos'),
        fetchSnap('estoque', qFilters),
        fetchSnap('movimentacoes', mFilters),
        fetchSnap('transacoes', qFilters),
        fetchSnap('caixas', qFilters),
        fetchSnap('notas_fiscais', qFilters)
      ]);

      setData({
        tenants: tenants as any,
        products: products as any,
        stock: stock as any,
        movements: movements as any,
        transactions: transactions as any,
        caixas: caixas as any,
        notas: notas as any,
        users: []
      });
    } catch (err: any) {
      console.error('Critical Fetch Error:', err.message);
      // Fallback to empty non-null data to avoid the error screen if possible
      setData({
        tenants: [], products: [], stock: [], movements: [], transactions: [], caixas: [], notas: [], users: []
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        // Load user profile from Firestore
        try {
          const profileDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (profileDoc.exists()) {
            setUserProfile(profileDoc.data() as User);
          } else {
            // Auto-create profile for the bootstrapped SUPER_ADMIN
            if (fbUser.email === 'baraodaserra@hotmail.com') {
              const newProfile: User = {
                uid: fbUser.uid,
                nome: fbUser.displayName || 'Super Admin Zeus',
                email: fbUser.email!,
                role: 'SUPER_ADMIN',
                tenant_id: null,
                ativo: true,
                created_at: new Date().toISOString()
              };
              await setDoc(doc(db, 'users', fbUser.uid), newProfile);
              setUserProfile(newProfile);
            }
          }
        } catch (e) {
          console.error("Error loading profile:", e);
        }
        await fetchData();
      } else {
        setUserProfile(null);
        setData(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error('Login error', err);
      setLoginError('Falha na autenticação. Verifique suas credenciais.');
    }
  };

  const handleLogout = () => signOut(auth);

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingExcel(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<any>(worksheet);

      if (json.length === 0) {
        alert("A planilha está vazia.");
        setUploadingExcel(false);
        return;
      }

      const criado_por = auth.currentUser?.uid;
      if (!criado_por) throw new Error("Usuário não autenticado");

      let batch = writeBatch(db);
      let ops = 0;
      let count = 0;

      for (const rawRow of json) {
        const row: any = {};
        for (const k in rawRow) {
          row[k.trim().toLowerCase()] = rawRow[k];
        }

        const codigo = String(row['código de b'] || row['codigo de b'] || row['código de barras'] || row['codigo'] || row['código'] || row['cod'] || row['sku'] || row['referênc'] || row['referencia'] || '').trim();
        const nome = String(row['nome'] || row['produto'] || row['descricao'] || row['descrição'] || row['item'] || '').trim();
        const categoria = String(row['categoria'] || row['setor'] || row['grupo'] || 'Diversos').trim();
        const rawPreco = String(row['valor de ve'] || row['valor de venda'] || row['preco'] || row['preço'] || row['valor'] || row['custo'] || '0').replace(/R\$\s*/gi, '').replace(',', '.');
        const preco = isNaN(parseFloat(rawPreco)) ? 0 : parseFloat(rawPreco);
        const rawEstoqueMin = String(row['estoqueminimo'] || row['estoque_minimo'] || row['estoque minimo'] || row['minimo'] || row['min'] || '5');
        const estoqueMinimo = isNaN(parseInt(rawEstoqueMin, 10)) ? 5 : parseInt(rawEstoqueMin, 10);
        let tenantId = String(row['lojaid'] || row['loja_id'] || row['tenant_id'] || row['loja'] || row['filial'] || '').trim();
        if (!tenantId && selectedTenantId !== 'all') {
          tenantId = selectedTenantId;
        }

        const rawQuant = String(row['estoque'] || row['quantidade'] || row['qtd'] || row['saldo'] || '0');
        const quantidade = isNaN(parseInt(rawQuant, 10)) ? 0 : parseInt(rawQuant, 10);
        const ativo = row['ativo'] !== undefined ? Boolean(row['ativo']) : true;

        if (!nome) continue;

        if (!tenantId) {
          throw new Error(`O produto "${nome}" está sem a coluna de loja na planilha. Por favor, selecione uma loja específica no filtro "Selecionar Loja" acima antes de importar, ou adicione uma coluna 'Loja' na sua planilha.`);
        }

        let produtoId = '';
        if (data?.products) {
          if (codigo) {
             const p = data.products.find(p => p.codigo === codigo);
             if (p) produtoId = p.id;
          }
          if (!produtoId) {
             const p = data.products.find(p => p.nome.toLowerCase() === nome.toLowerCase());
             if (p) produtoId = p.id;
          }
        }

        if (!produtoId) {
          const newProdRef = doc(collection(db, 'produtos'));
          produtoId = newProdRef.id;
          batch.set(newProdRef, {
            codigo: codigo || produtoId.slice(0, 8),
            nome,
            categoria,
            preco,
            estoque_minimo: estoqueMinimo,
            ativo,
            created_at: new Date().toISOString()
          });
          ops++;
        }
        
        if (quantidade !== 0) {
          const stockId = `${produtoId}_${tenantId}`;
          const stockRef = doc(db, 'estoque', stockId);
          const currentStock = data?.stock?.find(s => s.id === stockId);
          const currentQty = currentStock ? currentStock.quantidade : 0;
          const newQty = currentQty + quantidade;
          
          batch.set(stockRef, {
            produto_id: produtoId,
            tenant_id: tenantId,
            quantidade: Math.max(0, newQty),
            updated_at: new Date().toISOString()
          }, { merge: true });
          ops++;

          const movRef = doc(collection(db, 'movimentacoes'));
          batch.set(movRef, {
            tipo: quantidade > 0 ? 'ENTRADA' : 'SAIDA',
            produto_id: produtoId,
            quantidade: Math.abs(quantidade),
            tenant_origem: quantidade < 0 ? tenantId : null,
            tenant_destino: quantidade > 0 ? tenantId : null,
            criado_por,
            created_at: new Date().toISOString()
          });
          ops++;
        }

        count++;
        if (ops >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }
      
      if (ops > 0) {
        await batch.commit();
      }

      if (count === 0) {
        alert("Nenhum produto válido encontrado. Verifique se a planilha possui uma coluna 'Nome' ou 'Produto'.");
      } else {
        alert(`Planilha importada com sucesso! ${count} registros processados.`);
        fetchData();
      }
    } catch (err: any) {
      console.error(err);
      alert("Erro ao importar planilha: " + err.message);
    } finally {
      setUploadingExcel(false);
      e.target.value = '';
    }
  };

  const handleAction = async (endpoint: string, payload: any) => {
    try {
      if (endpoint === 'refresh') {
         await fetchData();
         return;
      }

      const criado_por = auth.currentUser?.uid;
      if (!criado_por) throw new Error("Usuário não autenticado");

      if (endpoint === 'estoque/entrada' || endpoint === 'estoque/saida' || endpoint === 'estoque/transferencia') {
        await runTransaction(db, async (transaction) => {
           const movementRef = doc(collection(db, 'movimentacoes'));
           const now = new Date().toISOString(); 
           
           if (endpoint === 'estoque/entrada') {
             const stockId = `${payload.produto_id}_${payload.tenant_id}`;
             const stockRef = doc(db, 'estoque', stockId);
             const stockDoc = await transaction.get(stockRef);
             const currentQty = stockDoc.exists() ? stockDoc.data().quantidade : 0;
             transaction.set(stockRef, {
                produto_id: payload.produto_id,
                tenant_id: payload.tenant_id,
                quantidade: currentQty + payload.quantidade,
                updated_at: now
             }, { merge: true });
             
             transaction.set(movementRef, {
                tipo: 'ENTRADA',
                produto_id: payload.produto_id,
                quantidade: payload.quantidade,
                tenant_origem: null,
                tenant_destino: payload.tenant_id,
                criado_por,
                created_at: now,
                ...(payload.mapped_product_id ? { mapped_product_id: payload.mapped_product_id } : {})
             });
           } else if (endpoint === 'estoque/saida') {
             const stockId = `${payload.produto_id}_${payload.tenant_id}`;
             const stockRef = doc(db, 'estoque', stockId);
             const stockDoc = await transaction.get(stockRef);
             if (!stockDoc.exists() || stockDoc.data().quantidade < payload.quantidade) throw new Error('Estoque insuficiente');
             
             transaction.update(stockRef, {
                quantidade: stockDoc.data().quantidade - payload.quantidade,
                updated_at: now
             });
             
             transaction.set(movementRef, {
                tipo: 'SAIDA',
                produto_id: payload.produto_id,
                quantidade: payload.quantidade,
                tenant_origem: payload.tenant_id,
                tenant_destino: null,
                criado_por,
                created_at: now,
                ...(payload.mapped_product_id ? { mapped_product_id: payload.mapped_product_id } : {})
             });
           } else if (endpoint === 'estoque/transferencia') {
             const origRef = doc(db, 'estoque', `${payload.produto_id}_${payload.tenant_origem}`);
             const destRef = doc(db, 'estoque', `${payload.produto_id}_${payload.tenant_destino}`);
             const origDoc = await transaction.get(origRef);
             if (!origDoc.exists() || origDoc.data().quantidade < payload.quantidade) throw new Error('Estoque origem insuficiente');
             
             const destDoc = await transaction.get(destRef);
             const destQty = destDoc.exists() ? destDoc.data().quantidade : 0;
             
             transaction.update(origRef, { quantidade: origDoc.data().quantidade - payload.quantidade, updated_at: now });
             transaction.set(destRef, { produto_id: payload.produto_id, tenant_id: payload.tenant_destino, quantidade: destQty + payload.quantidade, updated_at: now }, { merge: true });
             
             transaction.set(movementRef, {
                tipo: 'TRANSFERENCIA',
                produto_id: payload.produto_id,
                quantidade: payload.quantidade,
                tenant_origem: payload.tenant_origem,
                tenant_destino: payload.tenant_destino,
                criado_por,
                created_at: now
             });
           }
        });
        await fetchData();
      } else if (endpoint === 'financeiro/receita' || endpoint === 'financeiro/despesa') {
        await addDoc(collection(db, 'transacoes'), {
          tipo: endpoint === 'financeiro/receita' ? 'RECEITA' : 'DESPESA',
          valor: payload.valor,
          tenant_id: payload.tenant_id,
          descricao: payload.descricao,
          categoria: payload.categoria,
          criado_por: auth.currentUser?.uid,
          created_at: new Date().toISOString()
        });
        await fetchData();
      } else {
        const res = await fetch(`/api/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, criado_por: auth.currentUser?.uid })
        });
        if (res.ok) {
          await fetchData();
        } else {
          const error = await res.json();
          alert(`Erro: ${error.error}`);
        }
      }
    } catch (err: any) {
      console.error('Error performing action', err);
      alert(`Erro: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium font-mono text-xs uppercase tracking-widest">Iniciando ZEUS...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#0f172a] p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl"
        >
            <div className="flex items-center justify-center gap-4 mb-6">
               <img src="https://iili.io/B6fUR6l.png" alt="Zeus CP e Ferragista" width={100} height={40} className="object-contain h-12 w-auto" />
               <img src="https://iili.io/B6fUunf.png" alt="Zeus Atacarejo" width={100} height={40} className="object-contain h-12 w-auto" />
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tighter mb-2">SISTEMA ZEUS</h1>
          <p className="text-slate-500 text-xs mb-6 font-medium">Faça login para acessar o sistema.</p>
          
          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">E-mail</label>
              <input 
                type="email" 
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-sky-400 outline-none transition-all"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Senha</label>
              <input 
                type="password" 
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-sky-400 outline-none transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {loginError && (
              <div className="text-red-500 text-xs font-bold bg-red-50 p-3 rounded-lg border border-red-100 italic">
                {loginError}
              </div>
            )}

            <button 
              type="submit"
              className="w-full bg-[#0f172a] text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95 mt-2"
            >
              Entrar no Sistema
            </button>
          </form>
          
          <div className="mt-8 pt-8 border-t border-slate-100 grid grid-cols-2 gap-4">
            <div className="text-left">
              <span className="block text-[10px] font-bold text-slate-400 uppercase">Segurança</span>
              <span className="text-[11px] font-semibold text-slate-700">AES-256 Encrypted</span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] font-bold text-slate-400 uppercase">Status</span>
              <span className="text-[11px] font-semibold text-green-500 flex items-center justify-end gap-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div> Online
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4 text-center p-6">
          <AlertTriangle className="text-amber-500" size={48} />
          <div>
            <h2 className="text-xl font-black text-slate-900">ESTADO INCIAL OU PERMISSÃO</h2>
            <p className="text-slate-500 text-sm mt-1">
              Seu perfil foi registrado, mas os dados ainda estão sendo carregados ou o acesso está restrito.<br/> 
              Contate: <strong>baraodaserra@hotmail.com</strong>
            </p>
          </div>
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <button 
              onClick={fetchData} 
              className="bg-blue-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
            >
              Recarregar Dashboard
            </button>
            <button onClick={handleLogout} className="text-slate-500 font-bold hover:underline text-sm p-2">Sair do Sistema</button>
          </div>
        </div>
      </div>
    );
  }

  const filteredMovements = selectedTenantId === 'all' 
    ? data.movements 
    : data.movements.filter(m => m.tenant_origem === selectedTenantId || m.tenant_destino === selectedTenantId);

  const filteredTransactions = selectedTenantId === 'all'
    ? data.transactions
    : data.transactions.filter(t => t.tenant_id === selectedTenantId);

  // Stats calculation
  const totalFaturamento = filteredTransactions
    .filter(t => t.tipo === 'RECEITA')
    .reduce((acc, t) => acc + (t.valor || 0), 0);

  const totalDespesas = filteredTransactions
    .filter(t => t.tipo === 'DESPESA')
    .reduce((acc, t) => acc + (t.valor || 0), 0);

  const productsLowStock = data.products.filter(p => {
    const totalQty = data.stock
      .filter(s => s.produto_id === p.id && (selectedTenantId === 'all' || s.tenant_id === selectedTenantId))
      .reduce((acc, s) => acc + s.quantidade, 0);
    return totalQty < (p.estoque_minimo || 10);
  });

  const getProductName = (id: string) => data.products.find(p => p.id === id)?.nome || 'Produto Desconhecido';
  const getTenantName = (id: string | null) => data.tenants.find(t => t.id === id)?.nome || '-';

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar - Modern White Balance */}
      <aside className="w-52 bg-white text-slate-600 flex flex-col border-r border-slate-200 flex-shrink-0 shadow-sm z-20">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-sky-400 rounded-lg flex items-center justify-center font-black text-white text-lg shadow-lg shadow-blue-200">Z</div>
            <span className="text-xl font-black tracking-tighter text-slate-900 italic">ZEUS</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest pl-1">Painel Operacional</div>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <NavItem 
            icon={<LayoutDashboard size={18} className="text-blue-500" />} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            activeColor="text-blue-600"
            onClick={() => setActiveTab('dashboard')} 
          />
          <NavItem 
            icon={<Package size={18} className="text-amber-500" />} 
            label="Estoque" 
            active={activeTab === 'estoque'} 
            activeColor="text-amber-600"
            onClick={() => setActiveTab('estoque')} 
          />
          {userProfile?.role === 'SUPER_ADMIN' && (
            <NavItem 
              icon={<DollarSign size={18} className="text-emerald-500" />} 
              label="Financeiro" 
              active={activeTab === 'financeiro'} 
              activeColor="text-emerald-600"
              onClick={() => setActiveTab('financeiro')} 
            />
          )}
          {userProfile?.role === 'SUPER_ADMIN' && (
            <NavItem 
              icon={<Store size={18} className="text-indigo-500" />} 
              label="Lojas" 
              active={activeTab === 'lojas'} 
              activeColor="text-indigo-600"
              onClick={() => setActiveTab('lojas')} 
            />
          )}
          <NavItem 
            icon={<Wallet size={18} className="text-violet-500" />} 
            label="Módulo Caixa" 
            active={activeTab === 'caixa'} 
            activeColor="text-violet-600"
            onClick={() => setActiveTab('caixa')} 
          />
          <NavItem 
            icon={<FileText size={18} className="text-orange-500" />} 
            label="Notas Fiscais" 
            active={activeTab === 'notas'} 
            activeColor="text-orange-600"
            onClick={() => setActiveTab('notas')} 
          />
          <NavItem 
            icon={<BarChart3 size={18} className="text-rose-500" />} 
            label="Relatórios" 
            active={activeTab === 'relatorios'} 
            activeColor="text-rose-600"
            onClick={() => setActiveTab('relatorios')} 
          />
        </nav>

        <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex flex-col items-center">
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold mb-2">
             {userProfile?.nome?.charAt(0) || user?.displayName?.charAt(0) || 'U'}
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-red-500 transition-colors bg-white border border-slate-200 rounded-lg shadow-sm"
            title="Sair do Painel"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full bg-[#f1f5f9]">
        {/* Top Nav - Geometric Balance */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
          <div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Selecionar Tenant</div>
            <div className="relative">
              <select 
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                disabled={!!userProfile && userProfile.role !== 'SUPER_ADMIN'}
                className="appearance-none bg-slate-50 border border-slate-200 pl-3 pr-10 py-1.5 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-sky-400 transition-all cursor-pointer min-w-[240px] disabled:opacity-50"
              >
                {userProfile?.role === 'SUPER_ADMIN' && <option value="all">Todas as Lojas (Consolidado)</option>}
                {data.tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
            </div>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={() => setActiveTab('estoque')}
              className="bg-slate-100 text-slate-600 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wide hover:bg-slate-200 transition-colors flex items-center gap-2"
            >
              <Plus size={14} /> Nova Movimentação
            </button>
            <button 
              onClick={() => setActiveTab('financeiro')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wide hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm shadow-blue-200"
            >
              <DollarSign size={14} /> Lançar Receita
            </button>
          </div>
        </header>

        {/* Scrollable Context Area */}
        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab + selectedTenantId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {activeTab === 'dashboard' && (
                <>
                  {/* KPIs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <KPICard 
                      label="Faturamento Total" 
                      value={`R$ ${totalFaturamento.toLocaleString('pt-br', { minimumFractionDigits: 2 })}`}
                      info={<span className="text-green-500 font-bold">↑ 12% vs ontem</span>}
                    />
                    <KPICard 
                      label="Estoque Baixo" 
                      value={`${productsLowStock.length} Itens`}
                      valueColor="text-red-500"
                      info={<span className="text-slate-400">Exige reposição imediata</span>}
                    />
                    <KPICard 
                      label={selectedTenantId === 'all' ? 'Lojas Ativas' : 'Status Loja'} 
                      value={selectedTenantId === 'all' ? `${data.tenants.length} Unidades` : 'Operando'}
                      info={<span className="text-blue-500 font-bold">04 Novas este mês</span>}
                    />
                    <KPICard 
                      label="Fluxo Líquido" 
                      value={`R$ ${(totalFaturamento - totalDespesas).toLocaleString('pt-br', { minimumFractionDigits: 2 })}`}
                      info={<span className="text-slate-400">Consolidado no período</span>}
                    />
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Recent Movements Table */}
                    <div className="xl:col-span-2 kpi-card !p-0 overflow-hidden h-fit">
                      <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <History size={18} className="text-blue-600" />
                          Últimas Movimentações
                        </h3>
                        <button onClick={() => setActiveTab('relatorios')} className="text-xs font-bold text-blue-600 hover:underline">Ver Tudo</button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Produto</th>
                              <th>Loja</th>
                              <th>Tipo</th>
                              <th>Qtd</th>
                              <th>Data</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredMovements.slice(0, 5).map(m => (
                              <tr key={m.id}>
                                <td className="font-medium text-slate-800">
                                  {getProductName(m.produto_id)}
                                  {m.mapped_product_id && (
                                    <div className="text-[9px] font-black text-sky-500 uppercase mt-0.5">Map: {m.mapped_product_id}</div>
                                  )}
                                </td>
                                <td>{getTenantName(m.tipo === 'ENTRADA' ? m.tenant_destino : m.tenant_origem)}</td>
                                <td>
                                  <span className={`tag ${
                                    m.tipo === 'ENTRADA' ? 'tag-success' : 
                                    m.tipo === 'SAIDA' ? 'tag-warning' : 'tag-blue'
                                  }`}>
                                    {m.tipo}
                                  </span>
                                </td>
                                <td className="font-mono">{m.quantidade}</td>
                                <td className="text-[11px] font-medium text-slate-400 uppercase">{new Date(m.created_at).toLocaleTimeString('pt-br', { hour: '2-digit', minute: '2-digit' })}</td>
                              </tr>
                            ))}
                            {filteredMovements.length === 0 && (
                              <tr>
                                <td colSpan={5} className="py-8 text-center text-slate-400 italic font-medium">Nenhuma movimentação registrada.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="kpi-card flex flex-col h-fit">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <TrendingUp size={18} className="text-blue-600" />
                        Resumo Financeiro
                      </h3>
                      <div className="space-y-4 flex-1">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Receitas</div>
                          <div className="text-xl font-bold text-green-600">R$ {totalFaturamento.toLocaleString('pt-br', { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Despesas</div>
                          <div className="text-xl font-bold text-red-600">R$ {totalDespesas.toLocaleString('pt-br', { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div className="pt-4 border-t border-dashed border-slate-200">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-bold text-slate-600">Fluxo Líquido</span>
                            <span className="text-xl font-black text-blue-600 italic">R$ {(totalFaturamento - totalDespesas).toLocaleString('pt-br', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                        
                        {/* Simple Chart Simulation */}
                        <div className="mt-6 h-16 flex items-end gap-1 px-1">
                          {[40, 60, 45, 80, 70, 100, 85].map((h, i) => (
                            <div 
                              key={i} 
                              className={`flex-1 rounded-sm transition-all duration-500 ${i > 4 ? 'bg-blue-600' : 'bg-slate-200'}`}
                              style={{ height: `${h}%` }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'estoque' && (
                <InventoryManagement 
                  data={data} 
                  selectedTenantId={selectedTenantId} 
                  handleAction={handleAction} 
                  userProfile={userProfile}
                  uploadingExcel={uploadingExcel}
                  handleExcelUpload={handleExcelUpload}
                />
              )}

              {activeTab === 'financeiro' && (
                <FinancialManagement 
                  transactions={filteredTransactions} 
                  tenants={data.tenants}
                  selectedTenantId={selectedTenantId}
                  handleAction={handleAction}
                />
              )}

              {activeTab === 'lojas' && (
                <TenantsManagement 
                  tenants={data.tenants} 
                  onManage={(id) => {
                    setSelectedTenantId(id);
                    setActiveTab('dashboard');
                  }} 
                />
              )}
              {activeTab === 'caixa' && (
                <CashierView 
                  data={data} 
                  userProfile={userProfile} 
                  selectedTenantId={selectedTenantId}
                  onAction={() => fetchData()}
                />
              )}
              {activeTab === 'notas' && (
                <InvoiceManagement 
                  data={data} 
                  selectedTenantId={selectedTenantId}
                  onAction={() => fetchData()}
                />
              )}
              {activeTab === 'relatorios' && <ReportsView data={data} selectedTenantId={selectedTenantId} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

// Helper Components
function NavItem({ icon, label, active, onClick, activeColor }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, activeColor: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-sm font-bold cursor-pointer group ${
        active 
          ? `bg-slate-100 ${activeColor} shadow-sm shadow-slate-200/50` 
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <div className={`transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
        {icon}
      </div>
      <span className="tracking-tight">{label}</span>
    </button>
  );
}

function KPICard({ label, value, valueColor = 'text-slate-900', info }: { label: string, value: string, valueColor?: string, info: React.ReactNode }) {
  return (
    <div className="kpi-card shadow-sm group hover:border-sky-400 transition-colors">
      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-black ${valueColor} group-hover:scale-105 origin-left transition-transform`}>{value}</div>
      <div className="text-[10px] mt-1">{info}</div>
    </div>
  );
}

function SearchableProductSelect({ 
  products, 
  value, 
  onChange, 
  placeholder = "Selecione um produto...",
  disabled = false,
  stockData = null,
  currentTenantId = null
}: { 
  products: Produto[], 
  value: string, 
  onChange: (val: string) => void, 
  placeholder?: string,
  disabled?: boolean,
  stockData?: Estoque[] | null,
  currentTenantId?: string | null
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredProducts = products.filter(p => 
    p.nome.toLowerCase().includes(search.toLowerCase()) || 
    (p.codigo && p.codigo.toLowerCase().includes(search.toLowerCase()))
  );

  const selectedProduct = products.find(p => p.id === value);

  return (
    <div className="relative w-full">
      <div 
        className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm flex justify-between items-center ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className={selectedProduct ? 'text-slate-900 font-medium' : 'text-slate-400'}>
          {selectedProduct ? selectedProduct.nome : placeholder}
        </span>
        <ChevronDown size={16} className="text-slate-400" />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
            <Search size={16} className="text-slate-400" />
            <input 
              type="text" 
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              placeholder="Buscar por nome ou código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filteredProducts.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500 italic">Nenhum produto encontrado.</div>
            ) : (
              filteredProducts.map(p => {
                let maxQty = null;
                let isOutOfStock = false;
                
                if (stockData && currentTenantId) {
                   maxQty = stockData.find((s: any) => s.produto_id === p.id && s.tenant_id === currentTenantId)?.quantidade || 0;
                   if (maxQty <= 0) isOutOfStock = true;
                }

                return (
                  <div 
                    key={p.id}
                    className={`px-4 py-3 text-sm flex justify-between items-center border-b border-slate-50 last:border-0 transition-colors ${
                      isOutOfStock ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'cursor-pointer hover:bg-blue-50'
                    }`}
                    onClick={() => {
                      if (!isOutOfStock) {
                        onChange(p.id);
                        setIsOpen(false);
                      }
                    }}
                  >
                    <div>
                      <div className="font-bold text-slate-700">{p.nome}</div>
                      {p.codigo && <div className="text-[10px] text-slate-400 font-mono mt-0.5">CÓDIGO: {p.codigo}</div>}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-900">R$ {p.preco.toLocaleString('pt-br', { minimumFractionDigits: 2 })}</div>
                      {maxQty !== null && (
                        <div className={`text-[10px] font-black uppercase ${isOutOfStock ? 'text-red-500' : 'text-blue-500'}`}>QTD: {maxQty}</div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Modular Views
function InventoryManagement({ data, selectedTenantId, handleAction, userProfile, uploadingExcel, handleExcelUpload }: { data: any, selectedTenantId: string, handleAction: any, userProfile: any, uploadingExcel?: boolean, handleExcelUpload?: any }) {
  const [modalOpen, setModalOpen] = useState<'entrada' | 'saida' | 'transferencia' | 'produto' | 'edit_produto' | 'apontamento' | null>(null);
  const [view, setView] = useState<'geral' | 'curva' | 'min_estoque'>('geral');
  const [form, setForm] = useState({ 
    produto_id: '', 
    tenant_id: '', 
    tenant_origem: '', 
    tenant_destino: '', 
    quantidade: 0,
    // For Pointing (Baixa e Apontamento)
    produto_origem_id: '',
    produto_destino_id: '',
    mapped_product_id: '',
    // For Product Registration
    codigo: '',
    nome: '',
    categoria: '',
    preco: 0,
    estoque_minimo: 0
  });

  const getStockQty = (prodId: string, tId: string) => {
    return data.stock.find((s: any) => s.produto_id === prodId && s.tenant_id === tId)?.quantidade || 0;
  };

  const getGlobalStock = (prodId: string) => {
    return data.stock.filter((s: any) => s.produto_id === prodId).reduce((acc: number, s: any) => acc + s.quantidade, 0);
  };

  const handleDeleteProduct = async () => {
    if (!form.produto_id) return;
    if (confirm("Tem certeza que deseja excluir DEIFINITIVAMENTE este produto? Todas as informações de estoque serão perdidas.")) {
      try {
        await deleteDoc(doc(db, 'produtos', form.produto_id));
        setModalOpen(null);
        await handleAction('refresh', {});
      } catch (e: any) {
        alert("Erro ao excluir: " + e.message);
      }
    }
  };

  const submit = async () => {
    if (!modalOpen) return;
    try {
      if (modalOpen === 'produto') {
        const newProd = {
          codigo: form.codigo,
          nome: form.nome,
          categoria: form.categoria,
          preco: form.preco,
          estoque_minimo: form.estoque_minimo,
          ativo: true,
          created_at: new Date().toISOString()
        };
        await addDoc(collection(db, 'produtos'), newProd);
      } else if (modalOpen === 'edit_produto') {
        const prodRef = doc(db, 'produtos', form.produto_id);
        await setDoc(prodRef, {
          codigo: form.codigo,
          nome: form.nome,
          categoria: form.categoria,
          preco: form.preco,
          estoque_minimo: form.estoque_minimo,
        }, { merge: true });
      } else if (modalOpen === 'apontamento') {
        // Baixa in Origem
        await handleAction('estoque/saida', {
          produto_id: form.produto_origem_id,
          tenant_id: selectedTenantId === 'all' ? form.tenant_id : selectedTenantId,
          quantidade: form.quantidade,
          mapped_product_id: form.mapped_product_id || null
        });
        // Entrada in Destino
        await handleAction('estoque/entrada', {
          produto_id: form.produto_destino_id,
          tenant_id: selectedTenantId === 'all' ? form.tenant_id : selectedTenantId,
          quantidade: form.quantidade,
          mapped_product_id: form.mapped_product_id || null
        });
      } else {
        const endpoint = `estoque/${modalOpen}`;
        await handleAction(endpoint, form);
      }
      setModalOpen(null);
      setForm({ 
        produto_id: '', tenant_id: '', tenant_origem: '', tenant_destino: '', quantidade: 0,
        produto_origem_id: '', produto_destino_id: '', mapped_product_id: '', codigo: '', nome: '', categoria: '', preco: 0, estoque_minimo: 0
      });
      window.location.reload(); 
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
  };

  const curvaVendas = data.products.map((p: any) => {
    const totalSaidas = data.movements
      .filter((m: any) => m.produto_id === p.id && m.tipo === 'SAIDA')
      .reduce((acc: number, m: any) => acc + m.quantidade, 0);
    return { ...p, totalVendas: totalSaidas };
  }).sort((a: any, b: any) => b.totalVendas - a.totalVendas);

  const minEstoque = data.products.map((p: any) => {
    const qty = selectedTenantId === 'all' ? getGlobalStock(p.id) : getStockQty(p.id, selectedTenantId);
    return { ...p, qty };
  }).sort((a: any, b: any) => b.qty - a.qty); 

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 uppercase">Gestão de Estoque</h2>
          <p className="text-slate-500 text-sm font-medium">Controle avançado, baixas, apontamentos e reposição.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setView('geral')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${view === 'geral' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200'}`}>Geral</button>
          <button onClick={() => setView('curva')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${view === 'curva' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200'}`}>Curva Vendas</button>
          <button onClick={() => setView('min_estoque')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${view === 'min_estoque' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200'}`}>Estoque Mínimo</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
        {selectedTenantId !== 'all' && (
          <>
            {userProfile?.role === 'SUPER_ADMIN' && (
              <>
                <button onClick={() => setModalOpen('produto')} className="btn-secondary flex items-center gap-2 border-emerald-100 text-emerald-700 hover:bg-emerald-50">
                  <Plus size={16} /> Cadastrar Produto
                </button>
                <input type="file" id="excel-upload" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleExcelUpload} disabled={uploadingExcel} />
                <label htmlFor="excel-upload" className={`btn-secondary flex items-center gap-2 border-blue-100 text-blue-700 cursor-pointer ${uploadingExcel ? 'opacity-50' : 'hover:bg-blue-50'}`}>
                  <FileUp size={16} /> {uploadingExcel ? 'Importando...' : 'Importar Planilha'}
                </label>
                <div className="w-px h-8 bg-slate-100 mx-2 hidden md:block"></div>
                <button onClick={() => { setModalOpen('entrada'); setForm((f: any) => ({ ...f, tenant_id: selectedTenantId })) }} className="btn-secondary flex items-center gap-2">
                  <Plus size={16} /> Entrada
                </button>
              </>
            )}
            <button onClick={() => { setModalOpen('saida'); setForm((f: any) => ({ ...f, tenant_id: selectedTenantId })) }} className="btn-secondary flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" /> Baixa
            </button>
            <button onClick={() => { setModalOpen('apontamento'); setForm((f: any) => ({ ...f, tenant_id: selectedTenantId })) }} className="btn-secondary flex items-center gap-2 text-violet-600 border-violet-100">
              <ScanLine size={16} /> Apontamento
            </button>
            {userProfile?.role === 'SUPER_ADMIN' && (
              <button onClick={() => { setModalOpen('transferencia'); setForm((f: any) => ({ ...f, tenant_origem: selectedTenantId })) }} className="btn-primary flex items-center gap-2">
                <ArrowRightLeft size={16} /> Transferência
              </button>
            )}
          </>
        )}
        {selectedTenantId === 'all' && (
          <div className="text-xs font-medium text-slate-500 flex items-center italic py-2">
            Selecione uma loja específica no topo para realizar movimentações e operações.
          </div>
        )}
      </div>

      {view === 'geral' && (
        <div className="kpi-card !p-0 overflow-hidden shadow-md border-slate-200">
          <table className="data-table">
            <thead className="bg-slate-50">
              <tr>
                <th>Código</th>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Preço</th>
                <th className="text-center">{selectedTenantId === 'all' ? 'Estoque Global' : 'Estoque Unidade'}</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p: Produto) => {
                const qty = selectedTenantId === 'all' ? getGlobalStock(p.id) : getStockQty(p.id, selectedTenantId);
                const isCrit = qty < p.estoque_minimo;
                return (
                  <tr 
                    key={p.id} 
                    onClick={() => {
                      if (userProfile?.role === 'SUPER_ADMIN') {
                        setForm(f => ({ ...f, produto_id: p.id, codigo: p.codigo || '', nome: p.nome, categoria: p.categoria, preco: p.preco, estoque_minimo: p.estoque_minimo }));
                        setModalOpen('edit_produto');
                      }
                    }}
                    className={`transition-colors ${userProfile?.role === 'SUPER_ADMIN' ? 'cursor-pointer hover:bg-slate-100' : 'hover:bg-slate-50'}`}
                  >
                    <td className="font-mono text-xs text-slate-400">{p.codigo || `#${p.id.slice(0,6)}`}</td>
                    <td className="font-bold text-slate-800">{p.nome}</td>
                    <td><span className="text-[10px] bg-slate-100 px-2 py-1 rounded font-bold text-slate-500 uppercase">{p.categoria}</span></td>
                    <td className="font-mono font-bold text-blue-600">R$ {p.preco.toLocaleString('pt-br', { minimumFractionDigits: 2 })}</td>
                    <td className="text-center align-top">
                      <div className="flex flex-col items-center">
                        <span className={`text-lg font-black ${isCrit ? 'text-red-500' : 'text-slate-700'}`}>{qty}</span>
                        {selectedTenantId === 'all' && data.tenants && data.tenants.length > 0 && (
                          <div className="mt-2 w-full min-w-[140px] border-t border-slate-100 pt-2 space-y-1">
                            {data.tenants.map((t: any) => {
                              const tQty = getStockQty(p.id, t.id);
                              return (
                                <div key={t.id} className="flex justify-between items-center text-[10px]">
                                  <span className="text-slate-500 truncate mr-2 text-left" title={t.nome}>{t.nome}</span>
                                  <span className={`font-bold ${tQty === 0 ? 'text-slate-300' : 'text-slate-700'}`}>{tQty}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      {isCrit ? (
                        <span className="tag tag-warning flex items-center gap-1 w-fit"><AlertTriangle size={10} /> Abaixo do Mínimo</span>
                      ) : (
                        <span className="tag tag-success w-fit">Disponível</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === 'curva' && (
        <div className="kpi-card !p-0 overflow-hidden shadow-md border-slate-200">
          <table className="data-table">
            <thead className="bg-slate-50">
              <tr>
                <th>Posição</th>
                <th>Produto</th>
                <th>Categoria</th>
                <th className="text-center">Vendas Totais</th>
                <th>Faturamento Estimado</th>
              </tr>
            </thead>
            <tbody>
              {curvaVendas.map((p: any, idx: number) => (
                <tr key={p.id}>
                  <td className="font-black text-slate-400 italic">#{idx + 1}</td>
                  <td className="font-bold text-slate-800">{p.nome}</td>
                  <td><span className="text-[10px] bg-slate-100 px-2 py-1 rounded font-bold text-slate-400 uppercase">{p.categoria}</span></td>
                  <td className="text-center font-black text-blue-600">{p.totalVendas}</td>
                  <td className="font-mono text-xs text-slate-500">R$ {(p.totalVendas * p.preco).toLocaleString('pt-br', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'min_estoque' && (
        <div className="kpi-card !p-0 overflow-hidden shadow-md border-slate-200">
          <table className="data-table">
            <thead className="bg-slate-50">
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th className="text-center">Estoque Atual</th>
                <th className="text-center">Estoque Mínimo</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {minEstoque.map((p: any) => {
                const isCrit = p.qty < p.estoque_minimo;
                const diff = p.estoque_minimo - p.qty;
                return (
                  <tr key={p.id} className={isCrit ? 'bg-red-50/50' : ''}>
                    <td className="font-mono text-xs text-slate-400">{p.codigo || `#${p.id.slice(0,6)}`}</td>
                    <td className="font-bold text-slate-800">{p.nome}</td>
                    <td className={`text-center font-black ${isCrit ? 'text-red-600' : 'text-slate-700'} align-top`}>
                      <div className="flex flex-col items-center">
                        <span>{p.qty}</span>
                        {selectedTenantId === 'all' && data.tenants && data.tenants.length > 0 && (
                          <div className="mt-2 w-full min-w-[140px] border-t border-red-100 pt-2 space-y-1">
                            {data.tenants.map((t: any) => {
                              const tQty = getStockQty(p.id, t.id);
                              return (
                                <div key={t.id} className="flex justify-between items-center text-[10px]">
                                  <span className="text-slate-500 truncate mr-2 text-left" title={t.nome}>{t.nome}</span>
                                  <span className={`font-bold ${tQty === 0 ? 'text-red-300/50' : 'text-red-500'}`}>{tQty}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="text-center font-bold text-blue-900">{p.estoque_minimo}</td>
                    <td>
                       {isCrit ? (
                         <div className="flex flex-col gap-0.5">
                            <span className="tag tag-warning w-fit">Crítico</span>
                            <span className="text-[9px] font-black text-red-500 uppercase">Faltam {diff} unidades</span>
                         </div>
                       ) : (
                         <span className="tag tag-success w-fit">Seguro</span>
                       )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border border-slate-200 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight italic border-b pb-4">
              {modalOpen === 'entrada' ? 'Registrar Entrada' : 
               modalOpen === 'saida' ? 'Registrar Baixa' : 
               modalOpen === 'transferencia' ? 'Transferência entre Lojas' :
               modalOpen === 'produto' ? 'Cadastrar Novo Produto' :
               modalOpen === 'edit_produto' ? 'Editar Produto' : 'Baixa e Apontamento'}
            </h3>
            
            <div className="space-y-4">
              {modalOpen === 'produto' || modalOpen === 'edit_produto' ? (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Código Interno</label>
                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" value={form.codigo} onChange={e => setForm({...form, codigo: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Nome do Produto</label>
                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Categoria</label>
                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Preço de Venda</label>
                      <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" value={form.preco} onChange={e => setForm({...form, preco: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Estoque Mínimo</label>
                      <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" value={form.estoque_minimo} onChange={e => setForm({...form, estoque_minimo: Number(e.target.value)})} />
                    </div>
                  </div>
                </>
              ) : modalOpen === 'apontamento' ? (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Produto Origem (Fardo/Saco)</label>
                    <SearchableProductSelect 
                      products={data.products}
                      value={form.produto_origem_id}
                      onChange={(val) => setForm({...form, produto_origem_id: val})}
                      currentTenantId={selectedTenantId === 'all' ? form.tenant_id : selectedTenantId}
                      stockData={data.stock}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Produto Destino (Granel/Lotes)</label>
                    <SearchableProductSelect 
                      products={data.products}
                      value={form.produto_destino_id}
                      onChange={(val) => setForm({...form, produto_destino_id: val})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Quantidade de Conversão</label>
                    <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" value={form.quantidade} onChange={e => setForm({...form, quantidade: Number(e.target.value)})} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Mapear para Código Granel (Opcional)</label>
                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Ex: 01HG" value={form.mapped_product_id} onChange={e => setForm({...form, mapped_product_id: e.target.value})} />
                  </div>
                  {selectedTenantId === 'all' && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Loja da Operação</label>
                      <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" onChange={e => setForm({...form, tenant_id: e.target.value})}>
                        <option value="">Selecione...</option>
                        {data.tenants.map((t: any) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                      </select>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Produto</label>
                    <SearchableProductSelect 
                      products={data.products}
                      value={form.produto_id}
                      onChange={(val) => setForm({...form, produto_id: val})}
                      currentTenantId={selectedTenantId === 'all' ? (modalOpen === 'transferencia' ? form.tenant_origem : form.tenant_id) : selectedTenantId}
                      stockData={modalOpen === 'saida' || modalOpen === 'transferencia' ? data.stock : null}
                    />
                  </div>

                  {modalOpen !== 'transferencia' ? (
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Unidade</label>
                      <select 
                        disabled={selectedTenantId !== 'all'}
                        value={form.tenant_id}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                        onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}
                      >
                        <option value="">Selecione...</option>
                        {data.tenants.map((t: any) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Origem</label>
                        <select 
                          disabled={selectedTenantId !== 'all'}
                          value={form.tenant_origem}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                          onChange={(e) => setForm({ ...form, tenant_origem: e.target.value })}
                        >
                          <option value="">Selecione...</option>
                          {data.tenants.map((t: any) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Destino</label>
                        <select 
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          onChange={(e) => setForm({ ...form, tenant_destino: e.target.value })}
                        >
                          <option value="">Selecione...</option>
                          {data.tenants.map((t: any) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Quantidade</label>
                    <input 
                      type="number" 
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) })}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2 mt-8">
              <button onClick={() => setModalOpen(null)} className="flex-1 btn-secondary">Cancelar</button>
              {modalOpen === 'edit_produto' && (
                <button onClick={handleDeleteProduct} className="flex-1 bg-red-50 text-red-600 font-bold rounded-xl text-sm border border-red-100 hover:bg-red-100 transition-colors">Excluir</button>
              )}
              <button 
                onClick={submit} 
                className="flex-1 btn-primary"
                disabled={modalOpen !== 'produto' && modalOpen !== 'edit_produto' && form.quantidade <= 0 && modalOpen !== 'apontamento'}
              >
                Confirmar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function FinancialManagement({ transactions, tenants, selectedTenantId, handleAction }: { transactions: Transacao[], tenants: Tenant[], selectedTenantId: string, handleAction: any }) {
  const [modalOpen, setModalOpen] = useState<'receita' | 'despesa' | null>(null);
  const [form, setForm] = useState({ valor: 0, descricao: '', categoria: '', tenant_id: selectedTenantId === 'all' ? '' : selectedTenantId });

  const submit = async () => {
    if (!modalOpen) return;
    await handleAction(`financeiro/${modalOpen}`, form);
    setModalOpen(null);
    setForm({ valor: 0, descricao: '', categoria: '', tenant_id: selectedTenantId === 'all' ? '' : selectedTenantId });
  };

  const chartData = useMemo(() => {
    const grouped = transactions.reduce((acc: any, t) => {
      const date = new Date(t.created_at);
      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const friendlyName = date.toLocaleDateString('pt-br', { month: 'short', year: 'numeric' });
      
      if (!acc[yearMonth]) {
        acc[yearMonth] = { sortKey: yearMonth, name: friendlyName.toUpperCase(), ['Receitas']: 0, ['Despesas']: 0 };
      }
      if (t.tipo === 'RECEITA') {
        acc[yearMonth]['Receitas'] += t.valor;
      } else if (t.tipo === 'DESPESA') {
        acc[yearMonth]['Despesas'] += t.valor;
      }
      return acc;
    }, {});
    
    return Object.values(grouped).sort((a: any, b: any) => a.sortKey.localeCompare(b.sortKey));
  }, [transactions]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 uppercase">Fluxo Financeiro</h2>
          <p className="text-slate-500 text-sm font-medium">Controle centralizado de receitas e despesas por unidade.</p>
        </div>
        <div className="flex gap-2">
          {selectedTenantId !== 'all' ? (
            <>
              <button onClick={() => setModalOpen('despesa')} className="btn-secondary text-red-600 border-red-100 hover:bg-red-50 flex items-center gap-2">
                <TrendingUp className="rotate-180" size={16} /> Lançar Despesa
              </button>
              <button onClick={() => setModalOpen('receita')} className="btn-primary flex items-center gap-2">
                <Plus size={16} /> Lançar Receita
              </button>
            </>
          ) : (
            <div className="text-xs font-medium text-slate-500 flex items-center italic">
              Selecione uma loja específica no topo para criar lançamentos.
            </div>
          )}
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="kpi-card">
          <h3 className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest text-slate-400 italic">Comparativo Mensal</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dx={-10} tickFormatter={(val) => `R$ ${val}`} />
                <Tooltip cursor={{ fill: '#F1F5F9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(val: any) => `R$ ${Number(val).toLocaleString('pt-br', {minimumFractionDigits: 2})}`} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                <Bar dataKey="Receitas" fill="#22C55E" radius={[4, 4, 0, 0]} maxBarSize={50} />
                <Bar dataKey="Despesas" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="kpi-card !p-0 overflow-hidden shadow-md border-slate-200">
        <table className="data-table">
          <thead className="bg-slate-50">
            <tr>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Loja</th>
              <th className="text-right">Valor</th>
              <th>Tipo</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(t => (
              <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                <td className="font-bold text-slate-800">{t.descricao}</td>
                <td><span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{t.categoria}</span></td>
                <td className="text-slate-500">{tenants.find((ten: any) => ten.id === t.tenant_id)?.nome || '-'}</td>
                <td className={`text-right font-mono font-black ${t.tipo === 'RECEITA' ? 'text-green-600' : 'text-red-600'}`}>
                  {t.tipo === 'DESPESA' ? '(-)' : '(+)'} R$ {t.valor.toLocaleString('pt-br', { minimumFractionDigits: 2 })}
                </td>
                <td>
                  <span className={`tag ${t.tipo === 'RECEITA' ? 'tag-success' : 'tag-warning'}`}>
                    {t.tipo}
                  </span>
                </td>
                <td className="text-[11px] font-medium text-slate-400 uppercase">{new Date(t.created_at).toLocaleDateString('pt-br')}</td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400 italic">Sem transações financeiras no período.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-8 w-full max-w-md"
          >
            <h3 className={`text-xl font-black mb-6 uppercase italic ${modalOpen === 'receita' ? 'text-green-600' : 'text-red-600'}`}>
              Novo Lançamento: {modalOpen}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Unidade</label>
                <select 
                  disabled={selectedTenantId !== 'all'}
                  value={form.tenant_id}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}
                >
                  <option value="">Selecione...</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Descrição</label>
                <input 
                  type="text" 
                  placeholder="Ex: Venda de Ração"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Categoria</label>
                  {modalOpen === 'despesa' ? (
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.categoria}
                      onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                    >
                      <option value="">Selecione...</option>
                      <option value="Internet">Internet</option>
                      <option value="Energia">Energia</option>
                      <option value="Água">Água</option>
                      <option value="Outros">Outros</option>
                    </select>
                  ) : (
                    <input 
                      type="text" 
                      placeholder="Ex: Vendas"
                      value={form.categoria}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                    />
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Valor (R$)</label>
                  <input 
                    type="number" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-8">
              <button onClick={() => setModalOpen(null)} className="flex-1 btn-secondary">Cancelar</button>
              <button 
                onClick={submit} 
                className="flex-1 btn-primary"
                disabled={form.valor <= 0 || !form.descricao || !form.tenant_id}
              >
                Salvar Lançamento
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function TenantsManagement({ tenants, onManage }: { tenants: Tenant[], onManage: (id: string) => void }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [nome, setNome] = useState('');
  
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [selectedTenantForUser, setSelectedTenantForUser] = useState<Tenant | null>(null);
  const [userForm, setUserForm] = useState({ email: '', password: '' });

  const handleDeleteTenant = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if(confirm('Tem certeza que deseja deletar permanentemente esta loja?')) {
      try {
        await deleteDoc(doc(db, 'tenants', id));
        window.location.reload();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const openUserModal = (e: React.MouseEvent, t: Tenant) => {
    e.stopPropagation();
    setSelectedTenantForUser(t);
    setUserModalOpen(true);
  };

  const handleCreateUser = async () => {
    if (!userForm.email || !userForm.password || !selectedTenantForUser) return;
    try {
      const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp" + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, userForm.email, userForm.password);
      await signOut(secondaryAuth);
      
      // now create firestore profile
      await setDoc(doc(db, 'users', userCredential.user.uid), {
         email: userForm.email,
         role: 'ADMIN_LOJA',
         tenant_id: selectedTenantForUser.id,
         created_at: new Date().toISOString()
      });
      
      setUserModalOpen(false);
      setUserForm({ email: '', password: '' });
      alert(`Usuário admin criado para a loja ${selectedTenantForUser.nome}!`);
    } catch (err: any) {
      alert(`Erro ao criar usuário: ${err.message}`);
    }
  };

  const submit = async () => {
    if (!nome) return;
    try {
      const newTenant = {
        nome,
        ativo: true,
        created_at: new Date().toISOString()
      };
      await addDoc(collection(db, 'tenants'), newTenant);
      setModalOpen(false);
      setNome('');
      window.location.reload(); 
    } catch (e: any) {
      alert(`Erro ao criar loja: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-900 uppercase">Gestão de Unidades</h2>
            <p className="text-slate-500 text-sm font-medium">Controle de lojas cadastradas no sistema multi-tenant.</p>
          </div>
          <button 
            onClick={() => setModalOpen(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={16} /> Nova Loja
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tenants.map(t => {
            const isAtacarejo = t.nome.toLowerCase().includes('atacarejo');
            const isFerragista = t.nome.toLowerCase().includes('ferragista') || t.nome.toLowerCase().includes('cp');
            const logoUrl = isAtacarejo 
              ? "https://iili.io/B6fUunf.png" 
              : (isFerragista ? "https://iili.io/B6fUR6l.png" : null);

            return (
            <div 
              key={t.id} 
              onClick={() => onManage(t.id)}
              className="kpi-card hover:border-sky-400 transition-all cursor-pointer group flex flex-col"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="h-10 flex items-center">
                  {logoUrl ? (
                    <img src={logoUrl} alt={t.nome} width={100} height={40} className="object-contain h-10 w-auto" />
                  ) : (
                    <Store size={24} className="text-sky-400" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => openUserModal(e, t)} className="text-blue-500 hover:text-blue-700 bg-blue-50 p-1.5 rounded-md transition-colors" title="Criar Usuário">
                    <UserPlus size={16} />
                  </button>
                  <button onClick={(e) => handleDeleteTenant(e, t.id)} className="text-red-500 hover:text-red-700 bg-red-50 p-1.5 rounded-md transition-colors" title="Excluir Loja">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <h3 className="text-lg font-black text-slate-900 mt-auto">{t.nome}</h3>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Tenant ID: {t.id}</div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-[11px] text-slate-500 font-medium">
                <span>Criado em {new Date(t.created_at).toLocaleDateString('pt-br')}</span>
                <span className="text-blue-600 font-bold group-hover:translate-x-1 transition-transform">Gerenciar Unidade →</span>
              </div>
            </div>
            );
          })}
          <div 
            onClick={() => setModalOpen(true)}
            className="kpi-card border-dashed border-slate-300 bg-slate-50/50 flex items-center justify-center cursor-pointer hover:bg-slate-50 group"
          >
             <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <Plus size={20} />
                </div>
                <span className="text-sm font-bold text-slate-500 uppercase tracking-widest group-hover:text-blue-600 transition-all">Adicionar Nova Loja</span>
             </div>
          </div>
        </div>

        {modalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl p-8 w-full max-w-md"
            >
              <h3 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight italic">Criar Nova Unidade</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Nome da Unidade</label>
                  <input 
                    type="text" 
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-sky-400 outline-none transition-all"
                    placeholder="Ex: Zeus Serrinha"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-8">
                <button onClick={() => setModalOpen(false)} className="flex-1 btn-secondary text-sm font-bold">Cancelar</button>
                <button 
                  onClick={submit} 
                  className="flex-1 btn-primary text-sm font-bold"
                  disabled={!nome}
                >
                  Confirmar Criação
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {userModalOpen && selectedTenantForUser && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl p-8 w-full max-w-md"
            >
              <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight italic">Novo Acesso</h3>
              <p className="text-sm font-medium text-slate-500 mb-6">Criar usuário admin para <span className="font-bold text-slate-900">{selectedTenantForUser.nome}</span></p>
              
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Email</label>
                  <input 
                    type="email" 
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-sky-400 outline-none transition-all"
                    placeholder="email@loja.com"
                    value={userForm.email}
                    onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Senha (mín. 6 caracteres)</label>
                  <input 
                    type="password" 
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-sky-400 outline-none transition-all"
                    placeholder="******"
                    value={userForm.password}
                    onChange={(e) => setUserForm({...userForm, password: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-8">
                <button onClick={() => setUserModalOpen(false)} className="flex-1 btn-secondary text-sm font-bold">Cancelar</button>
                <button 
                  onClick={handleCreateUser} 
                  className="flex-1 btn-primary text-sm font-bold"
                  disabled={!userForm.email || !userForm.password}
                >
                  Criar Acesso
                </button>
              </div>
            </motion.div>
          </div>
        )}
    </div>
  );
}


function CashierView({ data, userProfile, selectedTenantId, onAction }: { data: any, userProfile: any, selectedTenantId: string, onAction: any }) {
  const [modalOpen, setModalOpen] = useState<'fechar' | 'venda' | null>(null);
  const [cashierForm, setCashierForm] = useState({ 
    total_pix: 0, 
    total_cartao: 0, 
    total_dinheiro: 0,
    tenant_id: userProfile?.tenant_id || '' 
  });
  const [vendaForm, setVendaForm] = useState({
    produto_id: '',
    quantidade: 1,
    forma_pagamento: 'PIX' as 'PIX' | 'CARTAO' | 'DINHEIRO'
  });

  const isSuper = userProfile?.role === 'SUPER_ADMIN';
  const currentTenantId = isSuper ? selectedTenantId : userProfile?.tenant_id;
  const caixas = data.caixas.filter((c: any) => c.tenant_id === currentTenantId || currentTenantId === 'all');

  const handleSubmitCaixa = async () => {
    try {
      const total = cashierForm.total_pix + cashierForm.total_cartao + cashierForm.total_dinheiro;
      await addDoc(collection(db, 'caixas'), {
        ...cashierForm,
        total_vendas: total,
        status: 'FECHADO',
        data: new Date().toISOString().split('T')[0],
        criado_por: auth.currentUser?.uid,
        updated_at: new Date().toISOString()
      });
      setModalOpen(null);
      onAction();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleRegistrarVenda = async () => {
    try {
      if (!vendaForm.produto_id || vendaForm.quantidade <= 0) return;
      if (!currentTenantId || currentTenantId === 'all') {
        alert("Selecione uma loja específica para registrar vendas.");
        return;
      }

      const product = data.products.find((p: any) => p.id === vendaForm.produto_id);
      if (!product) return;

      const valorTotal = product.preco * vendaForm.quantidade;
      const criado_por = auth.currentUser?.uid;
      const now = new Date().toISOString();

      await runTransaction(db, async (transaction) => {
        // Read Stock
        const stockRef = doc(db, 'estoque', `${vendaForm.produto_id}_${currentTenantId}`);
        const stockDoc = await transaction.get(stockRef);
        const currentQty = stockDoc.exists() ? stockDoc.data().quantidade : 0;

        if (currentQty < vendaForm.quantidade) {
          throw new Error("Estoque insuficiente para esta venda.");
        }

        // Tracking Logic for Rastreavel Notas Fiscais
        // Find trackable notes containing the sold product
        const potentialNotes = data.notas
          .filter((n: any) => n.tenant_id === currentTenantId && n.rastreavel && n.items.some((it: any) => it.produto_id === vendaForm.produto_id && it.quantidade_restante > 0))
          // Sort by date (FIFO)
          .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        // We fetch fresh versions of these select note documents to mutate transactionally
        const noteRefsAndDocs = await Promise.all(
          potentialNotes.map(async (n: any) => {
            const r = doc(db, 'notas_fiscais', n.id);
            const d = await transaction.get(r);
            return { ref: r, doc: d };
          })
        );

        let qtyToDeduct = vendaForm.quantidade;

        noteRefsAndDocs.forEach(({ ref, doc: nDoc }) => {
          if (!nDoc.exists() || qtyToDeduct <= 0) return;
          const nData = nDoc.data();
          let noteChanged = false;

          const updatedItems = nData.items.map((it: any) => {
            if (it.produto_id === vendaForm.produto_id && it.quantidade_restante > 0 && qtyToDeduct > 0) {
              const deduct = Math.min(it.quantidade_restante, qtyToDeduct);
              qtyToDeduct -= deduct;
              noteChanged = true;
              return { ...it, quantidade_restante: it.quantidade_restante - deduct };
            }
            return it;
          });

          if (noteChanged) {
             transaction.update(ref, { items: updatedItems });
          }
        });

        // Deduct Global Stock
        transaction.update(stockRef, {
          quantidade: currentQty - vendaForm.quantidade,
          updated_at: now
        });

        // Log Movement
        const movRef = doc(collection(db, 'movimentacoes'));
        transaction.set(movRef, {
          tipo: 'SAIDA',
          produto_id: vendaForm.produto_id,
          quantidade: vendaForm.quantidade,
          tenant_origem: currentTenantId,
          tenant_destino: null,
          criado_por,
          created_at: now
        });

        // Log Transaction (Receita)
        const transRef = doc(collection(db, 'transacoes'));
        transaction.set(transRef, {
          tipo: 'RECEITA',
          valor: valorTotal,
          tenant_id: currentTenantId,
          descricao: `Venda: ${product.nome} (x${vendaForm.quantidade})`,
          categoria: 'Venda de Mercadoria',
          forma_pagamento: vendaForm.forma_pagamento,
          criado_por,
          created_at: now
        });
      });

      setModalOpen(null);
      setVendaForm({ produto_id: '', quantidade: 1, forma_pagamento: 'PIX' });
      onAction();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleValidate = async (id: string) => {
    try {
      await setDoc(doc(db, 'caixas', id), { 
        status: 'VALIDADO', 
        validado_por: auth.currentUser?.uid,
        updated_at: new Date().toISOString() 
      }, { merge: true });
      onAction();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 uppercase">Módulo Caixa</h2>
          <p className="text-slate-500 text-sm font-medium italic">Gestão de vendas, PDV e fechamento diário.</p>
        </div>
        <div className="flex gap-2">
          {selectedTenantId !== 'all' ? (
            <>
              <button onClick={() => setModalOpen('venda')} className="btn-secondary flex items-center gap-2 border-green-200 text-green-700 hover:bg-green-50">
                <ShoppingCart size={16} /> Registrar Venda
              </button>
              {!isSuper && (
                <button onClick={() => setModalOpen('fechar')} className="btn-primary flex items-center gap-2">
                  <Plus size={16} /> Fechar Caixa Hoje
                </button>
              )}
            </>
          ) : (
            <div className="text-xs font-medium text-slate-500 italic flex items-center">
              Selecione uma loja específica para registro de vendas e fechamento.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {caixas.map((c: any) => (
          <div key={c.id} className="kpi-card flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-violet-500">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">DATA: {new Date(c.data).toLocaleDateString('pt-br')}</div>
              <h3 className="text-lg font-black text-slate-900">{data.tenants.find((t: any) => t.id === c.tenant_id)?.nome}</h3>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1 text-xs font-bold text-slate-500">
                  <div className="w-2 h-2 rounded-full bg-blue-500" title="Pix"></div> Pix: R$ {c.total_pix}
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-slate-500">
                  <div className="w-2 h-2 rounded-full bg-orange-500" title="Cartão"></div> Cartão: R$ {c.total_cartao}
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-slate-500">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" title="Dinheiro"></div> Dinheiro: R$ {c.total_dinheiro}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
               <div className="text-right">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Total Consolidado</div>
                  <div className="text-xl font-black text-slate-900 font-mono">R$ {c.total_vendas.toLocaleString('pt-br', { minimumFractionDigits: 2 })}</div>
               </div>
               <div className="flex flex-col items-end gap-2">
                  <span className={`tag ${c.status === 'VALIDADO' ? 'tag-success' : 'tag-warning'}`}>
                    {c.status}
                  </span>
                  {isSuper && c.status === 'FECHADO' && (
                    <button onClick={() => handleValidate(c.id)} className="text-xs font-black text-blue-600 flex items-center gap-1 hover:underline">
                      <CheckCircle2 size={12} /> Validar Caixa
                    </button>
                  )}
               </div>
            </div>
          </div>
        ))}
      </div>

      {modalOpen === 'fechar' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight italic">Fechamento de Caixa Diário</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Total em PIX</label>
                  <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm" value={cashierForm.total_pix} onChange={e => setCashierForm({...cashierForm, total_pix: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Total em CARTÃO</label>
                  <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm" value={cashierForm.total_cartao} onChange={e => setCashierForm({...cashierForm, total_cartao: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Total em DINHEIRO</label>
                  <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm" value={cashierForm.total_dinheiro} onChange={e => setCashierForm({...cashierForm, total_dinheiro: Number(e.target.value)})} />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-8">
              <button onClick={() => setModalOpen(null)} className="flex-1 btn-secondary text-sm font-bold">Cancelar</button>
              <button onClick={handleSubmitCaixa} className="flex-1 btn-primary text-sm font-bold">Enviar para Conferência</button>
            </div>
          </motion.div>
        </div>
      )}

      {modalOpen === 'venda' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight italic">Registrar Venda (PDV)</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Produto (Estoque)</label>
                <SearchableProductSelect 
                  products={data.products}
                  value={vendaForm.produto_id}
                  onChange={(val) => setVendaForm({ ...vendaForm, produto_id: val })}
                  stockData={data.stock}
                  currentTenantId={currentTenantId}
                  placeholder="Buscar produto..."
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Quantidade</label>
                  <input type="number" min="1" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm" value={vendaForm.quantidade} onChange={e => setVendaForm({...vendaForm, quantidade: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Pagamento</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm" value={vendaForm.forma_pagamento} onChange={e => setVendaForm({...vendaForm, forma_pagamento: e.target.value as any})}>
                    <option value="PIX">PIX</option>
                    <option value="CARTAO">Cartão</option>
                    <option value="DINHEIRO">Dinheiro</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-8">
              <button onClick={() => setModalOpen(null)} className="flex-1 btn-secondary text-sm font-bold">Cancelar</button>
              <button onClick={handleRegistrarVenda} className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition-all" disabled={!vendaForm.produto_id || vendaForm.quantidade < 1}>Registrar Venda</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function InvoiceManagement({ data, selectedTenantId, onAction }: { data: any, selectedTenantId: string, onAction: any }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    numero_nota: '',
    fornecedor: '',
    rastreavel: true,
    tenant_id: selectedTenantId === 'all' ? '' : selectedTenantId,
    items: [] as any[]
  });
  const [currentItem, setCurrentItem] = useState({ produto_id: '', quantidade_original: 0, preco_custo: 0 });

  const handleSaveNota = async () => {
    try {
      if (!form.tenant_id) {
        alert("A Loja Destino é obrigatória.");
        return;
      }
      
      const criado_por = auth.currentUser?.uid;
      const now = new Date().toISOString();

      await runTransaction(db, async (transaction) => {
        // Read all stocks
        const stockRefs = form.items.map(i => doc(db, 'estoque', `${i.produto_id}_${form.tenant_id}`));
        const stockDocs = await Promise.all(stockRefs.map((ref: any) => transaction.get(ref)));
        
        // Write Nota Fiscal
        const notaRef = doc(collection(db, 'notas_fiscais'));
        transaction.set(notaRef, {
          ...form,
          items: form.items.map(i => ({ ...i, quantidade_restante: i.quantidade_original })),
          criado_por,
          created_at: now
        });

        // Loop items, apply Entrada logic individually
        form.items.forEach((item, index) => {
           const stockDoc: any = stockDocs[index];
           const currentQty = stockDoc.exists() ? stockDoc.data().quantidade : 0;
           
           transaction.set(stockRefs[index], {
              produto_id: item.produto_id,
              tenant_id: form.tenant_id,
              quantidade: currentQty + item.quantidade_original,
              updated_at: now
           }, { merge: true });
           
           const movementRef = doc(collection(db, 'movimentacoes'));
           transaction.set(movementRef, {
              tipo: 'ENTRADA',
              produto_id: item.produto_id,
              quantidade: item.quantidade_original,
              tenant_origem: null,
              tenant_destino: form.tenant_id,
              criado_por,
              created_at: now,
              ...(item.mapped_product_id ? { mapped_product_id: item.mapped_product_id } : {})
           });
        });
      });

      setModalOpen(false);
      setForm({ ...form, numero_nota: '', fornecedor: '', items: [] });
      onAction();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const addItem = () => {
    if (!currentItem.produto_id || !currentItem.quantidade_original) return;
    setForm({ ...form, items: [...form.items, currentItem] });
    setCurrentItem({ produto_id: '', quantidade_original: 0, preco_custo: 0 });
  };

  const handleDeleteNota = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta Nota Fiscal e reverter os estoques inseridos?')) return;
    try {
      const notaToDelete = data.notas.find((n: any) => n.id === id);
      if (!notaToDelete) return;

      const criado_por = auth.currentUser?.uid;
      const now = new Date().toISOString();

      await runTransaction(db, async (transaction) => {
        const stockRefs = notaToDelete.items.map((i: any) => doc(db, 'estoque', `${i.produto_id}_${notaToDelete.tenant_id}`));
        const stockDocs = await Promise.all(stockRefs.map((ref: any) => transaction.get(ref)));

        const notaRef = doc(db, 'notas_fiscais', id);
        transaction.delete(notaRef);

        notaToDelete.items.forEach((item: any, index: number) => {
           const stockDoc: any = stockDocs[index];
           if (stockDoc.exists()) {
             const currentQty = stockDoc.data().quantidade;
             transaction.update(stockRefs[index], {
                quantidade: currentQty - item.quantidade_original,
                updated_at: now
             });
             
             const movementRef = doc(collection(db, 'movimentacoes'));
             transaction.set(movementRef, {
                tipo: 'SAIDA',
                produto_id: item.produto_id,
                quantidade: item.quantidade_original,
                tenant_origem: notaToDelete.tenant_id,
                tenant_destino: null,
                criado_por,
                created_at: now
             });
           }
        });
      });
      onAction();
    } catch (e: any) {
      alert(`Erro ao excluir: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 uppercase">Entrada de Notas Fiscais</h2>
          <p className="text-slate-500 text-sm font-medium italic">Rastreamento de mercadorias e conversão automática para granel.</p>
        </div>
        {selectedTenantId !== 'all' ? (
          <button onClick={() => setModalOpen(true)} className="btn-primary flex items-center gap-2">
            <Truck size={16} /> Nova Entrada
          </button>
        ) : (
          <div className="text-xs font-medium text-slate-500 italic">
            Selecione uma loja específica no topo para registrar uma Nota Fiscal.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.notas.map((n: any) => (
          <div key={n.id} className="kpi-card border-t-4 border-orange-500">
             <div className="flex justify-between items-start mb-4">
                <div>
                   <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">NF: {n.numero_nota}</div>
                   <h3 className="text-lg font-black text-slate-900">{n.fornecedor}</h3>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {selectedTenantId !== 'all' && (
                    <button onClick={() => handleDeleteNota(n.id)} className="text-red-500 hover:text-red-700 bg-red-50 p-1 rounded-md transition-colors" title="Excluir Nota">
                      <Trash2 size={14} />
                    </button>
                  )}
                  {n.rastreavel && (
                    <span className="flex items-center gap-1 text-[9px] font-black bg-blue-50 text-blue-600 px-2 py-1 rounded-full uppercase italic">
                      <ScanLine size={10} /> Rastreável
                    </span>
                  )}
                </div>
             </div>
             <div className="space-y-2">
                {n.items.map((it: any, idx: number) => {
                  const vendidos = it.quantidade_original - it.quantidade_restante;
                  return (
                    <div key={idx} className="flex flex-col gap-1 text-xs p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="font-bold text-slate-800">{data.products.find((p: any) => p.id === it.produto_id)?.nome}</span>
                      <div className="flex justify-between items-center mt-1">
                         <div className="flex gap-3">
                            <div className="flex flex-col">
                              <span className="text-[9px] font-black text-slate-400 uppercase">Original</span>
                              <span className="font-bold text-slate-600">{it.quantidade_original}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] font-black text-emerald-500 uppercase">Vendidos</span>
                              <span className="font-black text-emerald-600">{vendidos}</span>
                            </div>
                         </div>
                         <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black text-blue-400 uppercase">Restante</span>
                            <span className="font-black text-blue-600 text-sm">{it.quantidade_restante}</span>
                         </div>
                      </div>
                    </div>
                  );
                })}
             </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-2xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight italic border-b pb-4">Registrar Entrada de Mercadoria</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Número da Nota/Documento</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm" value={form.numero_nota} onChange={e => setForm({...form, numero_nota: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fornecedor</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm" value={form.fornecedor} onChange={e => setForm({...form, fornecedor: e.target.value})} />
              </div>
              
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Loja Destino da Nota</label>
                <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm" value={form.tenant_id} onChange={e => setForm({...form, tenant_id: e.target.value})}>
                  <option value="">Selecione a Loja...</option>
                  {data.tenants.map((t: any) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>

              <div className="md:col-span-2 flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-dashed border-slate-300">
                 <input type="checkbox" id="rastreavel" className="w-4 h-4" checked={form.rastreavel} onChange={e => setForm({...form, rastreavel: e.target.checked})} />
                 <label htmlFor="rastreavel" className="text-xs font-bold text-slate-700 uppercase flex items-center gap-2">
                   <ScanLine size={14} className="text-blue-500" /> Ativar Rastreamento de Estoque (Lote/Venda)
                 </label>
              </div>
            </div>

            <div className="border-t pt-6 bg-blue-50/30 p-4 rounded-2xl border border-blue-100">
               <h4 className="text-[10px] font-black text-blue-600 uppercase mb-4 italic">Adicionar Itens da Nota</h4>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Produto Original</label>
                    <SearchableProductSelect 
                      products={data.products}
                      value={currentItem.produto_id}
                      onChange={(val) => setCurrentItem({...currentItem, produto_id: val})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Qtd Entrada</label>
                    <input type="number" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm" value={currentItem.quantidade_original} onChange={e => setCurrentItem({...currentItem, quantidade_original: Number(e.target.value)})} />
                  </div>
                  <button onClick={addItem} className="md:col-span-2 bg-blue-600 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-widest hover:bg-blue-700 transition-all">Adicionar Item na Lista</button>
               </div>
            </div>

            <div className="mt-6">
               <ul className="space-y-2">
                  {form.items.map((it, idx) => (
                    <li key={idx} className="text-xs bg-white border border-slate-100 p-3 rounded-xl flex justify-between items-center shadow-sm">
                      <span className="font-bold">{data.products.find((p: any) => p.id === it.produto_id)?.nome} (Qtd: {it.quantidade_original})</span>
                    </li>
                  ))}
               </ul>
            </div>

            <div className="flex gap-2 mt-10">
              <button onClick={() => setModalOpen(false)} className="flex-1 btn-secondary text-sm font-bold">Descartar</button>
              <button onClick={handleSaveNota} className="flex-1 btn-primary text-sm font-bold" disabled={form.items.length === 0 || !form.numero_nota}>Processar Nota Fiscal</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function ReportsView({ data, selectedTenantId }: { data: any, selectedTenantId: string }) {
  return (
    <div className="space-y-6">
      <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 uppercase">Relatórios Analíticos</h2>
          <p className="text-slate-500 text-sm font-medium">Indicadores de performance, vendas e produtos mais movimentados.</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="kpi-card lg:col-span-2">
          <h3 className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest text-slate-400 italic">Produtos Mais Vendidos (Saída)</h3>
          <div className="space-y-6">
            {data.products.slice(0, 4).map((p: any, i: number) => {
              const saídas = data.movements.filter((m: any) => m.produto_id === p.id && m.tipo === 'SAIDA').reduce((acc: number, m: any) => acc + m.quantidade, 0);
              const maxSaída = 100; // Ref for bar
              return (
                <div key={p.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-bold text-slate-700">{p.nome}</span>
                    <span className="font-mono font-black text-blue-600">{saídas} unid.</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min((saídas / maxSaída) * 100, 100)}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="kpi-card">
           <h3 className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest text-slate-400 italic">Canais e Categorias</h3>
           <div className="flex items-center justify-center h-48">
              <div className="relative w-32 h-32 rounded-full border-[12px] border-slate-100 flex items-center justify-center">
                 <div className="absolute inset-0 rounded-full border-[12px] border-blue-600 border-l-transparent border-b-transparent rotate-45"></div>
                 <div className="text-center">
                    <div className="text-xs font-bold text-slate-400">Rações</div>
                    <div className="text-lg font-black text-slate-800">72%</div>
                 </div>
              </div>
           </div>
           <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between text-[11px] font-bold">
                 <div className="flex items-center gap-2"><div className="w-2 h-2 bg-blue-600 rounded-full"></div> Rações</div>
                 <span>72%</span>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
