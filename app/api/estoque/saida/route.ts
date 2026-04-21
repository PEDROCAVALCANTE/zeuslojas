
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, runTransaction, serverTimestamp, collection } from 'firebase/firestore';

export async function POST(request: Request) {
  try {
    const { produto_id, tenant_id, quantidade, criado_por } = await request.json();

    if (!produto_id || !tenant_id || !quantidade || !criado_por) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const stockId = `${produto_id}_${tenant_id}`;
    const stockRef = doc(db, 'estoque', stockId);
    const movementRef = doc(collection(db, 'movimentacoes'));

    await runTransaction(db, async (transaction) => {
      const stockDoc = await transaction.get(stockRef);
      if (!stockDoc.exists() || stockDoc.data().quantidade < quantidade) {
        throw new Error('Estoque insuficiente para esta operação.');
      }
      
      const newQty = stockDoc.data().quantidade - quantidade;

      transaction.update(stockRef, {
        quantidade: newQty,
        updated_at: serverTimestamp()
      });

      transaction.set(movementRef, {
        tipo: 'SAIDA',
        produto_id,
        quantidade,
        tenant_origem: tenant_id,
        tenant_destino: null,
        criado_por,
        created_at: serverTimestamp()
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Stock Exit Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
