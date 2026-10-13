// 메인 스레드 쪽 분리 도우미: 워커에 모델 로드·사진 임베딩·좌표 분리를 요청하고 다각형으로 바꾼다.
import type { Pt } from '../core/homography';
import { maskToPolygon } from '../core/mask';

export type SegmentStatus = 'idle' | 'loading' | 'ready' | 'error';
export interface Segment { polygon: Pt[]; score: number }

export class Segmenter {
  status: SegmentStatus = 'idle';
  private worker: Worker | null = null;
  private embeddedIds = new Set<string>();
  private embedding = new Map<string, Promise<void>>();
  private pending = new Map<number, { resolve: (s: Segment | null) => void }>();
  private reqSeq = 0;
  private loadPromise: Promise<void> | null = null;

  constructor(private serverUrl: string, private onStatus: (s: SegmentStatus, detail?: string) => void) {}

  /** 모델 로드 (처음 한 번). 실패하면 error 상태 */
  load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.setStatus('loading');
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.loadPromise = new Promise<void>((resolve, reject) => {
      this.worker!.onmessage = (ev: MessageEvent) => {
        const m = ev.data;
        if (m.type === 'loaded') { this.setStatus('ready'); resolve(); }
        else if (m.type === 'embedded') { this.embeddedIds.add(m.photoId); }
        else if (m.type === 'mask') {
          const p = this.pending.get(m.reqId);
          this.pending.delete(m.reqId);
          const polygon = maskToPolygon({ data: m.data, width: m.width, height: m.height }, 1.5);
          p?.resolve(polygon.length >= 3 ? { polygon, score: m.score } : null);
        } else if (m.type === 'error') {
          console.warn('[자동 분리]', m.message);
          if (m.reqId !== undefined) { this.pending.get(m.reqId)?.resolve(null); this.pending.delete(m.reqId); }
          else if (this.status === 'loading') { this.setStatus('error', m.message); reject(new Error(m.message)); }
        }
      };
      this.worker!.onerror = (e) => { this.setStatus('error', e.message); reject(new Error(e.message)); };
      this.worker!.postMessage({ type: 'load', serverUrl: this.serverUrl });
    });
    return this.loadPromise;
  }

  isEmbedded(photoId: string) { return this.embeddedIds.has(photoId); }

  /** 사진 임베딩 (사진당 한 번, 수 초). 같은 사진의 중복 요청은 합쳐진다 */
  embed(photoId: string, imageUrl: string): Promise<void> {
    if (this.embeddedIds.has(photoId)) return Promise.resolve();
    const inflight = this.embedding.get(photoId);
    if (inflight) return inflight;
    const p = (async () => {
      await this.load();
      const blob = await (await fetch(imageUrl)).blob();
      const bitmap = await createImageBitmap(blob);
      await new Promise<void>((resolve, reject) => {
        const handler = (ev: MessageEvent) => {
          if (ev.data.photoId !== photoId) return;
          if (ev.data.type === 'embedded') { this.worker!.removeEventListener('message', handler); resolve(); }
          if (ev.data.type === 'error' && ev.data.reqId === undefined) { this.worker!.removeEventListener('message', handler); reject(new Error(ev.data.message)); }
        };
        this.worker!.addEventListener('message', handler);
        this.worker!.postMessage({ type: 'embed', photoId, bitmap }, [bitmap]);
      });
    })().finally(() => this.embedding.delete(photoId));
    this.embedding.set(photoId, p);
    return p;
  }

  /** 사진 px 좌표의 물체 윤곽. 임베딩 전이면 null */
  segment(photoId: string, x: number, y: number): Promise<Segment | null> {
    if (!this.worker || !this.embeddedIds.has(photoId)) return Promise.resolve(null);
    const reqId = ++this.reqSeq;
    return new Promise((resolve) => {
      this.pending.set(reqId, { resolve });
      this.worker!.postMessage({ type: 'segment', reqId, photoId, x, y });
    });
  }

  private setStatus(s: SegmentStatus, detail?: string) {
    this.status = s;
    this.onStatus(s, detail);
  }
}
