// 이미지 에셋 저장소. 지금은 IndexedDB(로컬), 실시간 서버 단계에서 R2 업로드로 교체.
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

const urls = new Map<string, string>();

export async function putAsset(blob: Blob): Promise<string> {
  const id = await hash(blob);
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  urls.set(id, URL.createObjectURL(blob));
  return id;
}

export async function assetUrl(id: string): Promise<string | undefined> {
  if (urls.has(id)) return urls.get(id);
  const db = await open();
  const blob = await new Promise<Blob | undefined>((res) => {
    const r = db.transaction(STORE).objectStore(STORE).get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(undefined);
  });
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
