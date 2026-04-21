
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export async function POST(request: Request) {
  try {
    const { tenant_id, valor, descricao, categoria } = await request.json();

    if (!tenant_id || !valor || !descricao || !categoria) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const docRef = await addDoc(collection(db, 'transacoes'), {
      tipo: 'DESPESA',
      valor,
      tenant_id,
      descricao,
      categoria,
      created_at: serverTimestamp()
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
