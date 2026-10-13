// 앱 전역 상태: Yjs 프로젝트 문서 + Svelte 반응성 연결
import { IndexeddbPersistence } from 'y-indexeddb';
import { Project } from './core/project';
import { measurePhoto, type MeasureResult } from './core/measure';
import type { SignObject } from './core/model';
import { DEFAULT_KEYMAP, mergeKeymap, type Keymap } from './core/keymap';
import { isMacPlatform } from './core/wheel';

export type ViewKind = 'board' | 'list' | 'uv';
export type Tool = 'select' | 'rect' | 'ellipse';

class AppState {
  project = new Project();
  /** Yjs 변경마다 증가 → $derived 재계산 트리거 */
  version = $state(0);
  view = $state<ViewKind>('board');
  tool = $state<Tool>('select');
  selectedId = $state<string | null>(null);
  nickname = $state(load('ganpanda.nickname') ?? '');
  ready = $state(false);
  /** 사용자 단축키 (localStorage 'ganpanda.keymap') */
  keymap = $state<Keymap>(mergeKeymap(parse(load('ganpanda.keymap'))));
  settingsOpen = $state(false);
  readonly isMac = isMacPlatform();

  photos = $derived.by(() => (this.version, this.project.allPhotos()));
  objects = $derived.by(() => (this.version, this.project.allObjects()));
  selected = $derived.by(() => (this.version, this.selectedId ? this.project.object(this.selectedId) ?? null : null));
  /** 사진별 실측 판독 결과 */
  measures = $derived.by(() => {
    const out = new Map<string, MeasureResult>();
    for (const p of this.photos) {
      for (const [id, r] of measurePhoto(this.objects.filter((o) => o.photoId === p.id), p.w, p.h)) out.set(id, r);
    }
    return out;
  });

  constructor(room = 'local-default') {
    this.project.onChange(() => this.version++);
    const persist = new IndexeddbPersistence(`ganpanda-${room}`, this.project.doc);
    persist.whenSynced.then(() => (this.ready = true));
  }

  setNickname(n: string) {
    this.nickname = n;
    try { localStorage.setItem('ganpanda.nickname', n); } catch { /* 저장 불가 환경 */ }
  }

  setKeymap(km: Keymap) {
    this.keymap = km;
    try { localStorage.setItem('ganpanda.keymap', JSON.stringify(km)); } catch { /* 저장 불가 환경 */ }
  }

  resetKeymap() {
    this.setKeymap(structuredClone(DEFAULT_KEYMAP));
  }

  /** 견적·전개도용 치수: 입력값 우선, 없으면 판독 추정값 */
  sizeOf(o: SignObject): { w: number; h: number; estimated: boolean } | null {
    if (o.widthMm && o.heightMm) return { w: o.widthMm, h: o.heightMm, estimated: false };
    const e = this.measures.get(o.id)?.estimate;
    return e ? { w: o.widthMm ?? e.widthMm, h: o.heightMm ?? e.heightMm, estimated: true } : null;
  }
}

function parse(s: string | null): unknown {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

function load(k: string) {
  try { return localStorage.getItem(k); } catch { return null; }
}

export const app = new AppState(new URLSearchParams(location.search).get('room') ?? 'local-default');
