
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Singleton Pattern para evitar múltiplas instâncias
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/**
 * Senior Architect Note: 
 * Always attempt to use the specific database instance if provided.
 * Fallback to default if configuration is missing.
 */
const databaseId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
export const db = getFirestore(app, databaseId);
export const auth = getAuth(app);
