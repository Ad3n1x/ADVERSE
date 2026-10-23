const DB_NAME = 'adverse-local-workspace';
const DB_VERSION = 1;
const STORE = 'snapshots';

type Snapshot = { key: string; value: unknown; savedAt: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local workspace storage'));
  });
}

export async function saveLocalSnapshot<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key, value, savedAt: Date.now() } satisfies Snapshot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Local save failed'));
      tx.onabort = () => reject(tx.error || new Error('Local save cancelled'));
    });
  } finally {
    db.close();
  }
}

export async function readLocalSnapshot<T>(key: string): Promise<{ value: T; savedAt: number } | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => {
        const result = request.result as Snapshot | undefined;
        resolve(result ? { value: result.value as T, savedAt: result.savedAt } : null);
      };
      request.onerror = () => reject(request.error || new Error('Local read failed'));
    });
  } finally {
    db.close();
  }
}

export async function clearLocalSnapshots(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Local cache clear failed'));
    });
  } finally {
    db.close();
  }
}
