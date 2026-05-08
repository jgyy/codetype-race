/**
 * Tiny IndexedDB adapter for the offline practice-runs queue. One DB,
 * one object store, primary key on `id`. Browser-only — gated by typeof
 * indexedDB checks so the module can be imported during SSG without
 * exploding.
 */
import type { PracticeRunEnvelope } from "./queue-core";

const DB_NAME = "codetype-offline";
const DB_VERSION = 1;
const STORE = "runs";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function isAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function idbGetAll(): Promise<PracticeRunEnvelope[]> {
  if (!isAvailable()) return [];
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as PracticeRunEnvelope[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut(envelope: PracticeRunEnvelope): Promise<void> {
  if (!isAvailable()) return;
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(envelope);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(id: string): Promise<void> {
  if (!isAvailable()) return;
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbReplaceAll(items: PracticeRunEnvelope[]): Promise<void> {
  if (!isAvailable()) return;
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.clear();
    for (const it of items) store.put(it);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
