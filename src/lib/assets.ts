// 이미지 에셋 저장소: 기기(IndexedDB) + 동기화 서버(R2). 에셋 ID = 내용 SHA-256 앞 16바이트.
// 올린 파일은 서버에도 보내고, 기기에 없는 파일은 서버에서 받아 기기에 저장한다.
import { SERVER_URL } from './sync';

const DB = 'ganpanda-assets';
const STORE = 'blobs';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function hash(blob: Blob): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function localPut(id: string, blob: Blob) {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function localGet(id: string): Promise<Blob | undefined> {
  const db = await open();
  return new Promise((res) => {
    const r = db.transaction(STORE).objectStore(STORE).get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(undefined);
  });
}

const urls = new Map<string, string>();
/** 서버 전송에 실패한 에셋 — 다시 연결되면 재시도 */
const pending = new Map<string, Blob>();

/** 에셋 접근 자격: 서버는 프로젝트와 세션/초대로 권한을 검사한다 (state 가 방 진입 후 설정) */
let scope: { project: string; session?: string | null; invite?: string | null } | null = null;
export function setAssetScope(s: typeof scope) { scope = s; }

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
  if (SERVER_URL && !uploaded) pending.set(id, blob);
  return id;
}

/** 연결이 돌아왔을 때 미전송 에셋을 다시 올린다 */
export async function flushPendingUploads() {
  for (const [id, blob] of [...pending]) {
    try { if (await upload(id, blob)) pending.delete(id); } catch { pending.delete(id); /* 한도 초과 — 재시도해도 같음 */ }
  }
}

export async function assetUrl(id: string): Promise<string | undefined> {
  if (urls.has(id)) return urls.get(id);
  let blob = await localGet(id);
  if (!blob && SERVER_URL) {
    try {
      const r = await fetch(serverPath(id));
      if (r.ok) { blob = await r.blob(); await localPut(id, blob); }
    } catch { /* 서버 없음 → 기기에만 의존 */ }
  }
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

export function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = rej;
    img.src = url;
  });
}
