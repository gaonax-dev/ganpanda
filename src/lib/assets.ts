// 이미지 에셋 저장소: 기기(IndexedDB) + 동기화 서버(R2). 에셋 ID = 내용 SHA-256 앞 16바이트.
// 올린 파일은 서버에도 보내고, 기기에 없는 파일은 서버에서 받아 기기에 저장한다.
// 2026-10-17 사용자: "이미지가 기기에서 오는데 오래 걸리거나 모바일에서는 누락되는 경우도 있다" →
//  · 같은 에셋을 여러 곳이 동시에 달라고 하면 한 번만 받는다(inflight)
//  · 서버 받기는 시간 제한(30초) + 재시도(점점 길게, 5회), 오프라인이면 다시 연결될 때까지 기다렸다가 받는다
//  · 끝내 못 받은 에셋은 기억했다가 다시 연결될 때 받고(retryMissingAssets) 화면에 알린다(onAssetsRecovered → app.assetEpoch)
//  · IndexedDB 를 못 쓰는 환경(사생활 보호 모드·용량 부족)에서도 서버에서 바로 받아 보여 준다
//  · 올리기에 실패한 에셋은 재연결 때만이 아니라 시간을 두고 다시 올린다(5초→15초→45초→2분, schedulePendingFlush) — 연결이 끊긴 적 없이 한 번 실패하면
//    휴대폰에만 남아 다른 기기에 영영 안 보이던 경우. 자격(setAssetScope)이 늦게 와도 그때 올린다
import { SERVER_URL } from './sync';

const DB = 'ganpanda-assets';
const STORE = 'blobs';

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

async function hash(blob: Blob): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function localPut(id: string, blob: Blob) {
  const db = await open();
  if (!db) return;
  await new Promise<void>((res) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => res();
      tx.onerror = () => res(); // 저장 실패(용량)해도 메모리 URL 로는 보인다
      tx.onabort = () => res();
    } catch { res(); }
  });
}

async function localGet(id: string): Promise<Blob | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((res) => {
    try {
      const r = db.transaction(STORE).objectStore(STORE).get(id);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(undefined);
    } catch { res(undefined); }
  });
}

const urls = new Map<string, string>();
/** 서버 전송에 실패한 에셋 — 다시 연결되면 재시도 */
const pending = new Map<string, Blob>();
/** 받고 있는 에셋 (같은 id 를 동시에 여러 곳이 달라고 해도 한 번만) */
const inflight = new Map<string, Promise<string | undefined>>();
/** 끝내 못 받은 에셋 — 다시 연결될 때 받는다 */
const missing = new Set<string>();
const recovered: (() => void)[] = [];
/** 못 받았던 에셋을 나중에 받았을 때 (화면이 다시 요청하게) */
export function onAssetsRecovered(f: () => void) { recovered.push(f); }

/** 에셋 접근 자격: 서버는 프로젝트와 세션/초대로 권한을 검사한다 (state 가 방 진입 후 설정) */
let scope: { project: string; session?: string | null; invite?: string | null } | null = null;
export function setAssetScope(s: typeof scope) { scope = s; if (s && pending.size) void flushPendingUploads(); }

function serverPath(id: string) {
  const q = new URLSearchParams();
  if (scope) {
    q.set('project', scope.project);
    if (scope.session) q.set('session', scope.session); else if (scope.invite) q.set('invite', scope.invite);
  }
  return `${SERVER_URL}/api/assets/${id}?${q}`;
}

/** 저장 용량 한도 초과 (서버 413 storage_limit) */
export class StorageLimitError extends Error {
  constructor(public limitBytes: number, public usedBytes: number, public sizeBytes: number) {
    super('storage_limit');
  }
}

/** true = 서버에 있음(올렸거나 이미 있음), false = 지금은 못 올림(재시도). 한도 초과는 예외 */
async function upload(id: string, blob: Blob): Promise<boolean> {
  if (!SERVER_URL || !scope) return false;
  try {
    const head = await fetch(serverPath(id), { method: 'HEAD' });
    if (head.ok) return true; // 같은 내용이 이미 있음
    const r = await fetch(serverPath(id), { method: 'PUT', body: blob, headers: { 'content-type': blob.type } });
    if (r.status === 413) {
      const b = await r.json().catch(() => null) as { error?: string; limitBytes?: number; usedBytes?: number } | null;
      if (b?.error === 'storage_limit') throw new StorageLimitError(b.limitBytes ?? 0, b.usedBytes ?? 0, blob.size);
    }
    return r.ok;
  } catch (e) {
    if (e instanceof StorageLimitError) throw e;
    return false;
  }
}

/** 기기에 저장하고 서버에 올린다. 용량 한도를 넘으면 저장하지 않고 StorageLimitError */
export async function putAsset(blob: Blob): Promise<string> {
  const id = await hash(blob);
  const uploaded = SERVER_URL ? await upload(id, blob) : false;
  await localPut(id, blob);
  urls.set(id, URL.createObjectURL(blob));
  if (SERVER_URL && !uploaded) { pending.set(id, blob); schedulePendingFlush(); }
  return id;
}

const FLUSH_DELAYS = [5_000, 15_000, 45_000, 120_000];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushAttempt = 0;
/** 미전송 에셋이 있는 동안 점점 길게 다시 올리기를 예약 (성공하면 멈춤) */
function schedulePendingFlush() {
  if (flushTimer || !pending.size) return;
  const delay = FLUSH_DELAYS[Math.min(flushAttempt, FLUSH_DELAYS.length - 1)];
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushPendingUploads();
    if (pending.size) { flushAttempt++; schedulePendingFlush(); } else flushAttempt = 0;
  }, delay);
}

/** 연결이 돌아왔을 때 미전송 에셋을 다시 올린다 */
export async function flushPendingUploads() {
  for (const [id, blob] of [...pending]) {
    try { if (await upload(id, blob)) pending.delete(id); } catch { pending.delete(id); /* 한도 초과 — 재시도해도 같음 */ }
  }
}

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
/** 브라우저가 오프라인이면 online 이벤트까지 (최대 maxMs) 기다린다 */
function waitOnline(maxMs = 120_000): Promise<void> {
  if (!isOffline()) return Promise.resolve();
  return new Promise((res) => {
    const done = () => { window.removeEventListener('online', done); clearTimeout(t); res(); };
    const t = setTimeout(done, maxMs);
    window.addEventListener('online', done);
  });
}
/** 받기 시도 횟수와 간격 (휴대폰 데이터·느린 와이파이에서 한 번 실패로 끝내지 않게) */
export const FETCH_RETRIES = 5;
export const FETCH_TIMEOUT_MS = 30_000;
const retryDelay = (attempt: number) => Math.min(8000, 700 * 2 ** attempt);

/** 서버에서 받기: 시간 제한 + 재시도. 404/403 = 없음(undefined). 네트워크 실패가 이어지면 undefined 를 돌려주고 missing 에 기억 */
async function fetchFromServer(id: string): Promise<Blob | undefined> {
  if (!SERVER_URL) return undefined;
  for (let attempt = 0; attempt < FETCH_RETRIES; attempt++) {
    await waitOnline();
    try {
      const r = await fetch(serverPath(id), { signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined });
      if (r.ok) return await r.blob();
      if (r.status === 404 || r.status === 403 || r.status === 401) return undefined; // 없거나 권한 없음 — 재시도 무의미
    } catch { /* 네트워크·시간 초과 → 재시도 */ }
    if (attempt < FETCH_RETRIES - 1) await sleep(retryDelay(attempt));
  }
  missing.add(id);
  return undefined;
}

export function assetUrl(id: string): Promise<string | undefined> {
  const have = urls.get(id);
  if (have) return Promise.resolve(have);
  const running = inflight.get(id);
  if (running) return running;
  const p = (async () => {
    let blob = await localGet(id);
    if (!blob) {
      blob = await fetchFromServer(id);
      if (blob) void localPut(id, blob); // 기기에 저장은 기다리지 않는다 (못 써도 화면은 뜬다)
    }
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    return url;
  })().finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

/** 다시 연결됐을 때: 못 받았던 에셋을 받고, 받은 게 있으면 알린다 */
export async function retryMissingAssets() {
  if (!missing.size) return;
  const ids = [...missing];
  missing.clear();
  const got = await Promise.all(ids.map((id) => assetUrl(id)));
  if (got.some(Boolean)) for (const f of recovered) f();
}

// 브라우저가 온라인으로 돌아오면 (동기화 연결과 무관하게) 미전송 올리기·못 받은 받기를 다시
if (typeof window !== 'undefined') window.addEventListener('online', () => { void flushPendingUploads(); void retryMissingAssets(); });

export function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = rej;
    img.src = url;
  });
}
