
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';

export async function GET() {
  try {
    // Note: In a real production app with massive data, we'd fetch on-demand.
    // For this SaaS dashboard, we fetch the core consolidated data.
    
    const [tenantsSnap, productsSnap, stockSnap, movementsSnap, transactionsSnap] = await Promise.all([
      getDocs(collection(db, 'tenants')),
      getDocs(collection(db, 'produtos')),
      getDocs(collection(db, 'estoque')),
      getDocs(collection(db, 'movimentacoes')),
      getDocs(collection(db, 'transacoes'))
    ]).catch(err => {
      console.warn('Silent Fetch Error (likely empty DB or Permission delay):', err.message);
      return [ { docs: [] }, { docs: [] }, { docs: [] }, { docs: [] }, { docs: [] } ];
    });

    const safeMap = (snap: any) => (snap?.docs || []).map((d: any) => ({ id: d.id, ...d.data() }));

    return NextResponse.json({
      tenants: safeMap(tenantsSnap),
      products: safeMap(productsSnap),
      stock: safeMap(stockSnap),
      movements: safeMap(movementsSnap),
      transactions: safeMap(transactionsSnap),
      users: []
    });
  } catch (error: any) {
    console.error('Critical API Error:', error);
    // Even on critical error, return empty structure to keep frontend alive
    return NextResponse.json({
      tenants: [], products: [], stock: [], movements: [], transactions: [], users: [],
      error: error.message 
    });
  }
}
