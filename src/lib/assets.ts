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

const serverPath = (id: string) => `${SERVER_URL}/api/assets/${id}`;

async function upload(id: string, blob: Blob): Promise<boolean> {
  if (!SERVER_URL) return false;
  try {
    const head = await fetch(serverPath(id), { method: 'HEAD' });
    if (head.ok) return true; // 같은 내용이 이미 있음
    const r = await fetch(serverPath(id), { method: 'PUT', body: blob, headers: { 'content-type': blob.type } });
    return r.ok;
  } catch {
    return false;
  }
}

export async function putAsset(blob: Blob): Promise<string> {
  const id = await hash(blob);
  await localPut(id, blob);
  urls.set(id, URL.createObjectURL(blob));
  if (SERVER_URL && !(await upload(id, blob))) pending.set(id, blob);
  return id;
}

/** 연결이 돌아왔을 때 미전송 에셋을 다시 올린다 */
export async function flushPendingUploads() {
  for (const [id, blob] of [...pending]) if (await upload(id, blob)) pending.delete(id);
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
