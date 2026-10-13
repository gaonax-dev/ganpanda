// 앱 전역 상태: Yjs 프로젝트 문서 + Svelte 반응성 연결
import { IndexeddbPersistence } from 'y-indexeddb';
import { Project } from './core/project';
import { measurePhoto, type MeasureResult } from './core/measure';
import type { SignObject } from './core/model';
import { DEFAULT_KEYMAP, mergeKeymap, type Keymap } from './core/keymap';
import { isMacPlatform } from './core/wheel';
import { SyncClient, type SyncStatus } from './sync';
import { flushPendingUploads } from './assets';
import type { Cursor, Peer } from './core/presence';
import { describeAuthError, fetchMe, logout as apiLogout, updateName, verifyToken, type Account } from './auth';

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
  /** 동기화 서버 연결 상태와 다른 접속자 */
  sync = $state<SyncStatus>('local');
  peers = $state<Peer[]>([]);
  private client: SyncClient;
  /** 로그인한 계정 (null = 로그아웃 상태). authReady 전에는 미확인 */
  account = $state<Account | null>(null);
  authReady = $state(false);
  loginOpen = $state(false);
  /** 매직링크 처리 중 생긴 오류 (로그인 창에 표시) */
  authError = $state('');

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
    this.client = new SyncClient(room, this.project.doc, (s) => (this.sync = s), (p) => (this.peers = p));
    this.client.whenOnline(flushPendingUploads);
    this.client.setName(this.nickname);
    this.initAuth();
  }

  /** 시작 시: /login?token= 이면 검증, 아니면 저장된 세션으로 내 계정 확인 */
  private async initAuth() {
    const url = new URL(location.href);
    const token = url.pathname === '/login' ? url.searchParams.get('token') : null;
    if (token) {
      try {
        this.applyAccount(await verifyToken(token));
      } catch (e) {
        this.authError = describeAuthError(e);
        this.loginOpen = true;
      }
      // 주소에서 토큰 제거 (방이 있었으면 유지)
      const room = url.searchParams.get('room');
      history.replaceState(null, '', room ? `/?room=${room}` : '/');
    } else {
      this.applyAccount(await fetchMe());
    }
    this.authReady = true;
  }

  applyAccount(a: Account | null) {
    this.account = a;
    if (a) this.setNickname(a.name || a.email.split('@')[0], false);
  }

  async renameAccount(name: string) {
    this.applyAccount(await updateName(name));
  }

  async logout() {
    await apiLogout();
    this.account = null;
  }

  /** 사진 보드 위 내 커서 (world 좌표). null = 보드 밖 */
  setCursor(c: Cursor | null) {
    this.client.setCursor(c);
  }

  setNickname(n: string, persist = true) {
    this.nickname = n;
    this.client.setName(n);
    if (persist) try { localStorage.setItem('ganpanda.nickname', n); } catch { /* 저장 불가 환경 */ }
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
