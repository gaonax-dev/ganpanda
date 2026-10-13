// 메인 스레드 쪽 분리 도우미: 워커에 모델 로드·사진 임베딩·좌표 분리를 요청하고 다각형으로 바꾼다.
import type { Pt } from '../core/homography';
import { maskToPolygon } from '../core/mask';
import { clipMask, type Bounds } from '../core/zoneMask';

export type SegmentStatus = 'idle' | 'loading' | 'ready' | 'error';
export interface Segment { polygon: Pt[]; score: number }

export class Segmenter {
  status: SegmentStatus = 'idle';
  private worker: Worker | null = null;
  private embeddedIds = new Set<string>();
  /** 키별 분석 범위(사진 px)와 존 래스터 (범위 좌표계) */
  private regions = new Map<string, { region: Bounds; clip?: Uint8Array }>();
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
          // 범위 좌표 → 사진 px, 존 안으로 자르기
          const r = this.regions.get(m.photoId);
          const data = r?.clip && r.clip.length === m.data.length ? clipMask(m.data, r.clip) : m.data;
          const polygon = maskToPolygon({ data, width: m.width, height: m.height }, 1.5)
            .map(([x, y]) => [x + (r?.region.x ?? 0), y + (r?.region.y ?? 0)] as Pt);
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

  /**
   * 사진 임베딩 (키당 한 번, 수 초). region 이 있으면 그 범위만 잘라 분석(존), clip 은 범위 좌표계의 존 래스터.
   * 같은 키의 중복 요청은 합쳐진다
   */
  embed(photoId: string, imageUrl: string, opts: { region?: Bounds; clip?: Uint8Array } = {}): Promise<void> {
    if (this.embeddedIds.has(photoId)) return Promise.resolve();
    const inflight = this.embedding.get(photoId);
    if (inflight) return inflight;
    const p = (async () => {
      await this.load();
      const blob = await (await fetch(imageUrl)).blob();
      const full = await createImageBitmap(blob);
      const region = opts.region ?? { x: 0, y: 0, w: full.width, h: full.height };
      const bitmap = opts.region ? await createImageBitmap(full, region.x, region.y, region.w, region.h) : full;
      if (opts.region) full.close();
      this.regions.set(photoId, { region, clip: opts.clip });
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

  /** 사진 px 좌표의 물체 윤곽(사진 px). 임베딩 전이거나 범위 밖이면 null */
  segment(photoId: string, x: number, y: number): Promise<Segment | null> {
    const r = this.regions.get(photoId);
    if (!this.worker || !this.embeddedIds.has(photoId) || !r) return Promise.resolve(null);
    const lx = x - r.region.x, ly = y - r.region.y;
    if (lx < 0 || ly < 0 || lx >= r.region.w || ly >= r.region.h) return Promise.resolve(null);
    const reqId = ++this.reqSeq;
    return new Promise((resolve) => {
      this.pending.set(reqId, { resolve });
      this.worker!.postMessage({ type: 'segment', reqId, photoId, x: lx, y: ly });
    });
  }

  /** 분석 결과를 버린다 (존이 바뀌어 다시 분석할 때) */
  forget(photoId: string) {
    this.embeddedIds.delete(photoId);
    this.regions.delete(photoId);
    this.worker?.postMessage({ type: 'forget', photoId });
  }

  private setStatus(s: SegmentStatus, detail?: string) {
    this.status = s;
    this.onStatus(s, detail);
  }
}
