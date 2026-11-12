import type { AiAttachmentKind } from "../types/ai";

// Local backup for agent attachments: blobs + metadata in IndexedDB so
// attached files survive a refresh without any sign-in or server. Every
// failure is non-fatal — the caller keeps a session-only copy — and
// nothing here ever leaves the browser (no R2, no Supabase storage).

export const AI_ATTACHMENT_STORE_DB = "openstudio-ai-attachments";
export const AI_ATTACHMENT_STORE_TABLE = "attachments";

export interface StoredAttachment {
  id: string
  name: string
  kind: AiAttachmentKind
  size: number
  blob: Blob
  durationSec?: number
  noteCount?: number
  presetSummary?: string
  presetParams?: Record<string, unknown>
  sourcePack?: string
}

export interface AiAttachmentStoreBackend {
  getAll: () => Promise<StoredAttachment[]>
  put: (record: StoredAttachment) => Promise<void>
  remove: (id: string) => Promise<void>
  clear: () => Promise<void>
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise(function (resolve, reject) {
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function () {
      reject(request.error || new Error("IndexedDB request failed."));
    };
  });
}

function openDatabase(
  dbName: string,
  storeName: string,
): Promise<IDBDatabase> {
  return new Promise(function (resolve, reject) {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = function () {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function () {
      reject(request.error || new Error("Could not open IndexedDB."));
    };
    request.onblocked = function () {
      reject(new Error("IndexedDB open was blocked."));
    };
  });
}

async function withStore<T>(
  dbName: string,
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDatabase(dbName, storeName);
  try {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = await run(store);
    await new Promise<void>(function (resolve, reject) {
      transaction.oncomplete = function () {
        resolve();
      };
      transaction.onerror = function () {
        reject(transaction.error || new Error("IndexedDB transaction failed."));
      };
      transaction.onabort = function () {
        reject(transaction.error || new Error("IndexedDB transaction aborted."));
      };
    });
    return result;
  } finally {
    db.close();
  }
}

export function createIndexedDbAttachmentBackend(
  dbName: string = AI_ATTACHMENT_STORE_DB,
  storeName: string = AI_ATTACHMENT_STORE_TABLE,
): AiAttachmentStoreBackend {
  return {
    getAll: function () {
      return withStore(dbName, storeName, "readonly", function (store) {
        return promisifyRequest(store.getAll() as IDBRequest<StoredAttachment[]>);
      });
    },
    put: function (record) {
      return withStore(dbName, storeName, "readwrite", function (store) {
        return promisifyRequest(store.put(record) as IDBRequest<IDBValidKey>);
      }).then(function () {
        return undefined;
      });
    },
    remove: function (id) {
      return withStore(dbName, storeName, "readwrite", function (store) {
        return promisifyRequest(store.delete(id) as IDBRequest<undefined>);
      }).then(function () {
        return undefined;
      });
    },
    clear: function () {
      return withStore(dbName, storeName, "readwrite", function (store) {
        return promisifyRequest(store.clear() as IDBRequest<undefined>);
      }).then(function () {
        return undefined;
      });
    },
  };
}

export function createMemoryAttachmentBackend(
  initial: StoredAttachment[] = [],
): AiAttachmentStoreBackend {
  const records = new Map<string, StoredAttachment>();
  initial.forEach(function (record) {
    records.set(record.id, record);
  });
  return {
    getAll: async function () {
      return Array.from(records.values());
    },
    put: async function (record) {
      records.set(record.id, record);
    },
    remove: async function (id) {
      records.delete(id);
    },
    clear: async function () {
      records.clear();
    },
  };
}

// A store that prefers IndexedDB and silently falls back to memory the
// first time IndexedDB fails (private mode, quota, blocked open). Once it
// falls back it stays on memory for the session — no repeated failures.
export class AiAttachmentStore {
  private backend: AiAttachmentStoreBackend;
  private fallback: AiAttachmentStoreBackend;
  private failed: boolean;

  constructor(backend?: AiAttachmentStoreBackend) {
    this.backend = backend || createIndexedDbAttachmentBackend();
    this.fallback = createMemoryAttachmentBackend();
    this.failed = false;
  }

  private active(): AiAttachmentStoreBackend {
    return this.failed ? this.fallback : this.backend;
  }

  private async run<T>(
    operation: (backend: AiAttachmentStoreBackend) => Promise<T>,
  ): Promise<T> {
    if (this.failed) {
      return operation(this.fallback);
    }
    try {
      return await operation(this.backend);
    } catch {
      this.failed = true;
      return operation(this.fallback);
    }
  }

  async getAll(): Promise<StoredAttachment[]> {
    return this.run(function (backend) {
      return backend.getAll();
    });
  }

  async put(record: StoredAttachment): Promise<void> {
    return this.run(function (backend) {
      return backend.put(record);
    });
  }

  async remove(id: string): Promise<void> {
    return this.run(function (backend) {
      return backend.remove(id);
    });
  }

  async clear(): Promise<void> {
    return this.run(function (backend) {
      return backend.clear();
    });
  }

  isFallback(): boolean {
    return this.failed;
  }
}
