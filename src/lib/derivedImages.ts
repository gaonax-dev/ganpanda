// 사진에서 만든 그림(표시용 줄인 사본·평면도 카드 얼굴)을 기기(IndexedDB)에 둔다 (2026-10-27 사용자: "사진이 가장 크다 … 이미지는 거의 변경이 없다")
// 원본 사진은 내용 해시가 이름이라 바뀌지 않는다 → 원본 이름 + 만드는 조건을 키로 하면 한 번 만든 그림은 영원히 맞다.
// 열 때마다 원본을 통째로 디코딩·축소·JPEG 굽기를 하던 것을 기기에서 바로 읽기로. 저장 못 해도(용량·사생활 모드) 화면은 그대로 만든다.
const DB = 'ganpanda-derived';
const STORE = 'images';
/** 이만큼 넘으면 오래 안 쓴 것부터 지운다 (표시 사본 ~0.3–0.6MB, 카드 얼굴 ~20KB) */
export const DERIVED_MAX_ENTRIES = 600;
const PRUNE_TO = 450;

export type Derived = { blob: Blob } | { original: true };
type Row = Derived & { at: number };

let dbPromise: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch { res(null); }
  });
  return dbPromise;
}

export async function getDerived(key: string): Promise<Derived | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((res) => {
    try {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => {
        const row = r.result as Row | undefined;
        res(row && ('blob' in row ? row.blob instanceof Blob : row.original) ? row : undefined);
      };
      r.onerror = () => res(undefined);
    } catch { res(undefined); }
  });
}

let puts = 0;
export async function putDerived(key: string, value: Derived): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((res) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ...value, at: Date.now() } satisfies Row, key);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
      tx.onabort = () => res();
    } catch { res(); }
  });
  if (++puts % 25 === 0) void prune(db);
}

/** 너무 많으면 오래된 것부터 지운다 */
async function prune(db: IDBDatabase) {
  try {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const count = await new Promise<number>((res) => { const r = store.count(); r.onsuccess = () => res(r.result); r.onerror = () => res(0); });
    if (count <= DERIVED_MAX_ENTRIES) return;
    const rows: { key: IDBValidKey; at: number }[] = [];
    await new Promise<void>((res) => {
      const c = db.transaction(STORE).objectStore(STORE).openCursor();
      c.onsuccess = () => { const cur = c.result; if (!cur) return res(); rows.push({ key: cur.key, at: (cur.value as Row).at ?? 0 }); cur.continue(); };
      c.onerror = () => res();
    });
    rows.sort((a, b) => a.at - b.at);
    const tx = db.transaction(STORE, 'readwrite');
    for (const r of rows.slice(0, rows.length - PRUNE_TO)) tx.objectStore(STORE).delete(r.key);
  } catch { /* 다음에 */ }
}
