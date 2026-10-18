import type { Tab } from '../tabs/tab';
import type { Attempt } from './types';

const DB_NAME = 'chordflash';
const STORE = 'attempts';
/** Imported Guitar Pro tabs (version 2 of the database). */
const TABS = 'tabs';

let dbPromise: Promise<IDBDatabase> | null = null;
/** Used when IndexedDB is unavailable (private window…): history lasts until reload. */
const memory: Attempt[] = [];

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { autoIncrement: true }).createIndex('at', 'at');
      if (!db.objectStoreNames.contains(TABS)) db.createObjectStore(TABS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function saveAttempt(a: Attempt): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(a);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memory.push(a);
  }
}

/** All attempts, oldest first. */
export async function loadAttempts(): Promise<Attempt[]> {
  try {
    const db = await open();
    const all = await new Promise<Attempt[]>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).index('at').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return [...all, ...memory];
  } catch {
    return [...memory];
  }
}

/** Deletes every stored attempt. */
export async function clearAttempts(): Promise<void> {
  memory.length = 0;
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Nothing stored outside memory.
  }
}

function tabsRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(TABS, mode).objectStore(TABS));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const saveTab = (tab: Tab) => tabsRequest('readwrite', (s) => s.put(tab)).then(() => undefined);
export const deleteTab = (id: string) => tabsRequest('readwrite', (s) => s.delete(id)).then(() => undefined);
/** Imported tabs, most recent first. */
export const loadTabs = () =>
  tabsRequest<Tab[]>('readonly', (s) => s.getAll()).then((tabs) => tabs.sort((a, b) => b.importedAt - a.importedAt));
