// firebase-config.js - Firebase configuration with offline LocalStorage fallback

// Firebase configuration - set your own keys here
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCa9LeMogzXCeENt_pO0kg9HVSDONwVRAs",
  authDomain: "word-cube-d9460.firebaseapp.com",
  projectId: "word-cube-d9460",
  storageBucket: "word-cube-d9460.firebasestorage.app",
  messagingSenderId: "457772628492",
  appId: "1:457772628492:web:069d27e4a6aae460308c29"
};

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let isOnline = false;

// Check if Firebase is configured (API key is not empty)
function isFirebaseConfigured() {
  return FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.length > 0;
}

// Initialize Firebase or fallback
export async function initStorage() {
  if (isFirebaseConfigured()) {
    try {
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
      const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

      firebaseApp = initializeApp(FIREBASE_CONFIG);
      firebaseAuth = getAuth(firebaseApp);
      firebaseDb = getFirestore(firebaseApp);
      isOnline = true;
      console.log('[Storage] Firebase initialized successfully');
    } catch (err) {
      console.warn('[Storage] Firebase initialization failed, falling back to localStorage', err);
      isOnline = false;
    }
  } else {
    console.log('[Storage] No Firebase API key configured, using localStorage (offline mode)');
    isOnline = false;
  }

  return { isOnline };
}

export function getIsOnline() { return isOnline; }
export function getFirebaseAuth() { return firebaseAuth; }
export function getFirebaseDb() { return firebaseDb; }

// ===== Storage Abstraction Layer =====
// Works like Firestore but uses localStorage when offline

const LS_PREFIX = 'wordcube_';

// ===== Security Validation =====

// Validate document path to prevent NoSQL injection
function validatePath(collection, docId) {
  if (typeof collection !== 'string' || typeof docId !== 'string') return false;
  if (collection.length === 0 || collection.length > 100) return false;
  if (docId.length === 0 || docId.length > 300) return false;
  if (/[\/\.\#\$\[\]\*]/.test(collection)) return false;
  return true;
}

// Limit data size to prevent buffer overflow
function validateDataSize(data) {
  try {
    const size = new Blob([JSON.stringify(data)]).size;
    return size < 2 * 1024 * 1024; // 2MB max per document
  } catch { return false; }
}

function lsKey(collection, docId) {
  return `${LS_PREFIX}${collection}_${docId}`;
}

function lsCollectionKey(collection) {
  return `${LS_PREFIX}col_${collection}`;
}

// Get document index for a collection
function getCollectionIndex(collection) {
  try {
    const data = localStorage.getItem(lsCollectionKey(collection));
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

function updateCollectionIndex(collection, docId) {
  const index = getCollectionIndex(collection);
  if (!index.includes(docId)) {
    index.push(docId);
    localStorage.setItem(lsCollectionKey(collection), JSON.stringify(index));
  }
}

// ===== CRUD Operations =====

// Set a document
export async function setDoc(collection, docId, data) {
  if (!validatePath(collection, docId)) {
    console.error('[Storage] Invalid document path');
    return false;
  }
  if (!validateDataSize(data)) {
    console.error('[Storage] Data too large');
    return false;
  }

  if (isOnline && firebaseDb) {
    try {
      const fs = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      const docRef = fs.doc(firebaseDb, collection, docId);
      await fs.setDoc(docRef, { ...data, updatedAt: fs.serverTimestamp() });
      return true;
    } catch (err) {
      console.warn('[Storage] Firestore setDoc failed, saving to localStorage', err);
    }
  }

  // LocalStorage fallback
  try {
    localStorage.setItem(lsKey(collection, docId), JSON.stringify({
      ...data,
      updatedAt: Date.now()
    }));
    updateCollectionIndex(collection, docId);
    return true;
  } catch (err) {
    console.error('[Storage] localStorage setDoc failed', err);
    return false;
  }
}

// Get a document
export async function getDoc(collection, docId) {
  if (!validatePath(collection, docId)) {
    console.error('[Storage] Invalid document path');
    return null;
  }

  if (isOnline && firebaseDb) {
    try {
      const fs = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      const docRef = fs.doc(firebaseDb, collection, docId);
      const snap = await fs.getDoc(docRef);
      if (snap.exists()) return { id: snap.id, ...snap.data() };
      return null;
    } catch (err) {
      console.warn('[Storage] Firestore getDoc failed, reading localStorage', err);
    }
  }

  try {
    const data = localStorage.getItem(lsKey(collection, docId));
    return data ? { id: docId, ...JSON.parse(data) } : null;
  } catch { return null; }
}

// Query collection (limited support: orderBy field, limit, where)
export async function queryCollection(collection, options = {}) {
  if (isOnline && firebaseDb) {
    try {
      const fs = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      let q = fs.collection(firebaseDb, collection);
      const constraints = [];

      if (options.where) {
        for (const w of options.where) {
          constraints.push(fs.where(w.field, w.op, w.value));
        }
      }
      if (options.orderBy) {
        constraints.push(fs.orderBy(options.orderBy.field, options.orderBy.direction || 'asc'));
      }
      if (options.limit) {
        constraints.push(fs.limit(options.limit));
      }

      const queryRef = fs.query(q, ...constraints);
      const snap = await fs.getDocs(queryRef);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('[Storage] Firestore query failed, using localStorage', err);
    }
  }

  // LocalStorage query (basic implementation)
  try {
    const index = getCollectionIndex(collection);
    let results = [];

    for (const docId of index) {
      const data = localStorage.getItem(lsKey(collection, docId));
      if (data) {
        results.push({ id: docId, ...JSON.parse(data) });
      }
    }

    // Apply where filters
    if (options.where) {
      for (const w of options.where) {
        results = results.filter(doc => {
          const val = doc[w.field];
          switch (w.op) {
            case '==': return val === w.value;
            case '!=': return val !== w.value;
            case '<': return val < w.value;
            case '<=': return val <= w.value;
            case '>': return val > w.value;
            case '>=': return val >= w.value;
            default: return true;
          }
        });
      }
    }

    // Apply orderBy
    if (options.orderBy) {
      const dir = options.orderBy.direction === 'desc' ? -1 : 1;
      results.sort((a, b) => {
        const va = a[options.orderBy.field] ?? 0;
        const vb = b[options.orderBy.field] ?? 0;
        return va < vb ? -dir : va > vb ? dir : 0;
      });
    }

    // Apply limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  } catch { return []; }
}

// Delete document
export async function deleteDoc(collection, docId) {
  if (isOnline && firebaseDb) {
    try {
      const fs = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      await fs.deleteDoc(fs.doc(firebaseDb, collection, docId));
    } catch (err) {
      console.warn('[Storage] Firestore deleteDoc failed', err);
    }
  }

  try {
    localStorage.removeItem(lsKey(collection, docId));
    const index = getCollectionIndex(collection);
    const filtered = index.filter(id => id !== docId);
    localStorage.setItem(lsCollectionKey(collection), JSON.stringify(filtered));
  } catch {}
}

// Generate a unique document ID
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}

// Get server timestamp (or Date.now() if offline)
export async function getServerTime() {
  // For true server time, you'd use Firebase's server timestamp
  // For offline mode, use Date.now()
  return Date.now();
}
