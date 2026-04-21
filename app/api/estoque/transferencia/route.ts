
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, runTransaction, serverTimestamp, collection } from 'firebase/firestore';

export async function POST(request: Request) {
  try {
    const { produto_id, tenant_origem, tenant_destino, quantidade, criado_por } = await request.json();

    if (!produto_id || !tenant_origem || !tenant_destino || !quantidade || !criado_por) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const origRef = doc(db, 'estoque', `${produto_id}_${tenant_origem}`);
    const destRef = doc(db, 'estoque', `${produto_id}_${tenant_destino}`);
    const movementRef = doc(collection(db, 'movimentacoes'));

    await runTransaction(db, async (transaction) => {
      const origDoc = await transaction.get(origRef);
      if (!origDoc.exists() || origDoc.data().quantidade < quantidade) {
        throw new Error('Estoque insuficiente na loja de origem.');
      }
      
      const destDoc = await transaction.get(destRef);
      const destQty = destDoc.exists() ? destDoc.data().quantidade : 0;

      transaction.update(origRef, {
        quantidade: origDoc.data().quantidade - quantidade,
        updated_at: serverTimestamp()
      });

      transaction.set(destRef, {
        produto_id,
        tenant_id: tenant_destino,
        quantidade: destQty + quantidade,
        updated_at: serverTimestamp()
      }, { merge: true });

      transaction.set(movementRef, {
        tipo: 'TRANSFERENCIA',
        produto_id,
        quantidade,
        tenant_origem,
        tenant_destino,
        criado_por,
        created_at: serverTimestamp()
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
