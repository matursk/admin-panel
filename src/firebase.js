import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

// Prefer external file if present; fallback to inline constants
// eslint-disable-next-line import/no-unresolved
import { firebaseConfig as externalConfig } from '../firebase-config.js'

const firebaseConfig = externalConfig || {
  apiKey: 'AIzaSyBxvhTuQhfKeIgybiRQoca7btPdSO5oFag',
  authDomain: 'matur-3f6cc.firebaseapp.com',
  projectId: 'matur-3f6cc',
  storageBucket: 'matur-3f6cc.firebasestorage.app',
  messagingSenderId: '624068510753',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = initializeFirestore(app, { experimentalForceLongPolling: true })
export const storage = getStorage(app)


