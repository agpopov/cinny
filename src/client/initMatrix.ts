import { createClient, MatrixClient, IndexedDBStore, IndexedDBCryptoStore } from 'matrix-js-sdk';

import { cryptoCallbacks } from './secretStorageKeys';
import { clearNavToActivePathStore } from '../app/state/navToActivePath';
import { pushSessionToSW } from '../sw-session';
import {
  clearPrivateStorage,
  clearPrivateSearchStorage,
  privateAccountKey,
} from '../app/utils/privateStorage';

// Версия схемы локального кэша синхронизации. При включении поддержки тредов
// старый кэш нужно один раз сбросить: в нём ответы в тредах лежат в общей ленте.
const SYNC_STORE_SCHEMA = 'threads-v1';
const SYNC_STORE_SCHEMA_KEY = 'cinny_sync_store_schema';

const SYNC_STORE_DB_NAME = 'web-sync-store';

const deleteSyncStoreDatabase = () =>
  new Promise<void>((resolve) => {
    const req = global.indexedDB.deleteDatabase(`matrix-js-sdk:${SYNC_STORE_DB_NAME}`);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });

type Session = {
  baseUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
};

export const initClient = async (session: Session): Promise<MatrixClient> => {
  if (global.localStorage.getItem(SYNC_STORE_SCHEMA_KEY) !== SYNC_STORE_SCHEMA) {
    // Только кэш синхронизации: ключи шифрования и сессия не затрагиваются.
    await deleteSyncStoreDatabase();
    global.localStorage.setItem(SYNC_STORE_SCHEMA_KEY, SYNC_STORE_SCHEMA);
  }

  const indexedDBStore = new IndexedDBStore({
    indexedDB: global.indexedDB,
    localStorage: global.localStorage,
    dbName: SYNC_STORE_DB_NAME,
  });

  const legacyCryptoStore = new IndexedDBCryptoStore(global.indexedDB, 'crypto-store');

  const mx = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    userId: session.userId,
    store: indexedDBStore,
    cryptoStore: legacyCryptoStore,
    deviceId: session.deviceId,
    timelineSupport: true,
    cryptoCallbacks: cryptoCallbacks as any,
    verificationMethods: ['m.sas.v1'],
  });

  await indexedDBStore.startup();
  await mx.initRustCrypto();

  mx.setMaxListeners(50);

  return mx;
};

export const startClient = async (mx: MatrixClient) => {
  await mx.startClient({
    lazyLoadMembers: true,
    // Треды как в Discord: ответы живут в отдельных таймлайнах треда,
    // а не в общей ленте комнаты.
    threadSupport: true,
  });
};

export const clearCacheAndReload = async (mx: MatrixClient) => {
  mx.stopClient();
  clearNavToActivePathStore(mx.getSafeUserId());
  await mx.store.deleteAllData();
  await clearPrivateSearchStorage(
    privateAccountKey(mx.baseUrl, mx.getSafeUserId(), mx.getDeviceId() ?? '')
  );
  window.location.reload();
};

export const logoutClient = async (mx: MatrixClient) => {
  pushSessionToSW();
  mx.stopClient();
  try {
    await mx.logout();
  } catch {
    // ignore if failed to logout
  }
  await mx.clearStores();
  await clearPrivateStorage();
  window.localStorage.clear();
  window.location.reload();
};

export const clearLoginData = async () => {
  const dbs = await window.indexedDB.databases();

  dbs.forEach((idbInfo) => {
    const { name } = idbInfo;
    if (name) {
      window.indexedDB.deleteDatabase(name);
    }
  });

  window.localStorage.clear();
  window.location.reload();
};
