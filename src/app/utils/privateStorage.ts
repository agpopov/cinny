// Plaintext stays in memory. IndexedDB stores AES-GCM records and a non-exportable
// key per Matrix account/device. This protects stored records, not against code
// executing with the application's own origin privileges.
const DATABASE = 'cinny-private-v1';
type RecordRow = { id: string; scope: string; iv: Uint8Array; data: ArrayBuffer };
let database: Promise<IDBDatabase> | undefined;
let generation = 0;
const scopeGenerations = new Map<string, number>();

const openDatabase = (): Promise<IDBDatabase> => {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('keys');
        request.result
          .createObjectStore('records', { keyPath: 'id' })
          .createIndex('scope', 'scope');
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          database = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      database = undefined;
      throw error;
    });
  }
  return database;
};

const requestValue = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.addEventListener('complete', () => resolve(), { once: true });
    tx.addEventListener(
      'abort',
      () => reject(tx.error ?? new Error('Запись локальных данных отменена')),
      { once: true }
    );
    tx.addEventListener('error', () => reject(tx.error), { once: true });
  });

export const privateAccountKey = (baseUrl: string, userId: string, deviceId: string) =>
  JSON.stringify([baseUrl.replace(/\/+$/, ''), userId, deviceId]);

const encryptionKey = async (db: IDBDatabase, account: string): Promise<CryptoKey> => {
  const read = db.transaction('keys', 'readonly');
  const existing = await requestValue<CryptoKey | undefined>(read.objectStore('keys').get(account));
  if (existing) return existing;
  const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  // A single read/write transaction prevents two tabs replacing each other's key.
  const tx = db.transaction('keys', 'readwrite');
  const done = finished(tx);
  const store = tx.objectStore('keys');
  const current = await requestValue<CryptoKey | undefined>(store.get(account));
  if (!current) store.put(candidate, account);
  await done;
  return current ?? candidate;
};

export class PrivateStorage {
  private readonly generation = generation;

  private readonly account: string;

  private readonly scope: string;

  private readonly scopeGeneration: number;

  private queue: Promise<unknown> = Promise.resolve();

  private cachedKey?: Promise<CryptoKey>;

  private key(db: IDBDatabase): Promise<CryptoKey> {
    this.cachedKey ??= encryptionKey(db, this.account).catch((error) => {
      this.cachedKey = undefined;
      throw error;
    });
    return this.cachedKey;
  }

  constructor(account: string, kind: string) {
    this.account = account;
    this.scope = JSON.stringify([account, kind]);
    this.scopeGeneration = scopeGenerations.get(this.scope) ?? 0;
  }

  private isCurrent() {
    return (
      this.generation === generation &&
      this.scopeGeneration === (scopeGenerations.get(this.scope) ?? 0)
    );
  }

  private recordId(id: string) {
    return JSON.stringify([this.scope, id]);
  }

  async get<T>(id: string): Promise<T | undefined> {
    if (!this.isCurrent()) return undefined;
    await this.queue.catch(() => undefined);
    const db = await openDatabase();
    const row = await requestValue<RecordRow | undefined>(
      db.transaction('records').objectStore('records').get(this.recordId(id))
    );
    if (!this.isCurrent()) return undefined;
    const value = row ? await this.decode<T>(db, row) : undefined;
    return this.isCurrent() ? value : undefined;
  }

  async values<T>(): Promise<T[]> {
    if (!this.isCurrent()) return [];
    await this.queue.catch(() => undefined);
    const db = await openDatabase();
    const rows = await requestValue<RecordRow[]>(
      db.transaction('records').objectStore('records').index('scope').getAll(this.scope)
    );
    if (!this.isCurrent()) return [];
    const values = await Promise.all(rows.map((row) => this.decode<T>(db, row)));
    return this.isCurrent() ? values : [];
  }

  private async decode<T>(db: IDBDatabase, row: RecordRow): Promise<T> {
    const key = await this.key(db);
    const data = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(row.iv),
        additionalData: new TextEncoder().encode(row.id),
      },
      key,
      row.data
    );
    return JSON.parse(new TextDecoder().decode(data)) as T;
  }

  set(id: string, value: unknown): Promise<void> {
    const operation = this.queue
      .catch(() => undefined)
      .then(async () => {
        if (!this.isCurrent()) return;
        const db = await openDatabase();
        const recordId = this.recordId(id);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.key(db);
        const data =
          value === undefined
            ? undefined
            : await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(recordId) },
                key,
                new TextEncoder().encode(JSON.stringify(value))
              );
        if (!this.isCurrent()) return;
        const tx = db.transaction('records', 'readwrite');
        const done = finished(tx);
        if (data) tx.objectStore('records').put({ id: recordId, scope: this.scope, iv, data });
        else tx.objectStore('records').delete(recordId);
        await done;
      });
    this.queue = operation;
    return operation;
  }
}

export const clearPrivateStorage = async (): Promise<void> => {
  generation += 1;
  scopeGenerations.clear();
  if (typeof indexedDB === 'undefined') return;
  const db = await openDatabase();
  const tx = db.transaction(['keys', 'records'], 'readwrite');
  const done = finished(tx);
  tx.objectStore('records').clear();
  tx.objectStore('keys').clear();
  await done;
};

export const clearPrivateSearchStorage = async (account: string): Promise<void> => {
  const scopes = ['search', 'search-cursors'].map((kind) => JSON.stringify([account, kind]));
  scopes.forEach((scope) => scopeGenerations.set(scope, (scopeGenerations.get(scope) ?? 0) + 1));
  const db = await openDatabase();
  const tx = db.transaction('records', 'readwrite');
  const done = finished(tx);
  scopes.forEach((scope) => {
    const request = tx.objectStore('records').index('scope').openCursor(IDBKeyRange.only(scope));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  });
  await done;
};
