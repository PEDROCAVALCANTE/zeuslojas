
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
      const currentQty = stockDoc.exists() ? stockDoc.data().quantidade : 0;
      const newQty = currentQty + quantidade;

      transaction.set(stockRef, {
        produto_id,
        tenant_id,
        quantidade: newQty,
        updated_at: serverTimestamp()
      }, { merge: true });

      transaction.set(movementRef, {
        tipo: 'ENTRADA',
        produto_id,
        quantidade,
        tenant_origem: null,
        tenant_destino: tenant_id,
        criado_por,
        created_at: serverTimestamp()
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Stock Entry Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
