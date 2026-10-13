// 앱 전역 상태: Yjs 프로젝트 문서 + Svelte 반응성 연결, 계정·방 접근·동기화
import { IndexeddbPersistence } from 'y-indexeddb';
import { Project } from './core/project';
import { measurePhoto, type MeasureResult } from './core/measure';
import type { Message, SignObject } from './core/model';
import { DEFAULT_KEYMAP, mergeKeymap, type Keymap } from './core/keymap';
import { isMacPlatform } from './core/wheel';
import { SERVER_URL, SyncClient, type SyncStatus } from './sync';
import { flushPendingUploads } from './assets';
import type { Cursor, Peer } from './core/presence';
import { AuthError, describeAuthError, fetchMe, loadSession, logout as apiLogout, updateName, verifyToken, type Account } from './auth';
import { checkAccess, postMessage, type Role } from './projects';

export type ViewKind = 'board' | 'list' | 'uv';
export type Tool = 'select' | 'rect' | 'ellipse';
/** 방 접근 상태: 확인 중 / 허용 / 거부(이유) */
export type Access =
  | { status: 'loading' }
  | { status: 'ok'; role: Role; projectName: string }
  | { status: 'denied'; code: 401 | 403 | 404 | 0 };

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
  inviteOpen = $state(false);
  readonly isMac = isMacPlatform();
  /** 현재 방(프로젝트). null = 홈 화면 */
  readonly room: string | null;
  /** 초대 토큰 (이 방에 초대 링크로 들어온 경우) */
  readonly invite: string | null;
  access = $state<Access>({ status: 'loading' });
  /** 동기화 서버 연결 상태와 다른 접속자 */
  sync = $state<SyncStatus>('local');
  peers = $state<Peer[]>([]);
  private client: SyncClient | null = null;
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
  role = $derived<Role | null>(this.access.status === 'ok' ? this.access.role : null);
  /** 편집 가능 여부 (viewer 는 보기·대화만). 서버 없는 로컬 모드는 항상 편집 가능 */
  canEdit = $derived(this.role === 'owner' || this.role === 'editor');

  constructor() {
    this.project.onChange(() => this.version++);
    const url = new URL(location.href);
    // 서버가 없으면(오프라인 빌드) 로컬 기본 방
    this.room = url.searchParams.get('room') ?? (SERVER_URL ? null : 'local-default');
    const inviteParam = url.searchParams.get('invite');
    this.invite = this.room ? inviteParam ?? load(`ganpanda.invite.${this.room}`) : null;
    if (this.room && inviteParam) {
      save(`ganpanda.invite.${this.room}`, inviteParam);
      history.replaceState(null, '', `/?room=${this.room}`); // 주소에서 토큰 제거
    }
    this.init();
  }

  private async init() {
    await this.initAuth();
    if (this.room) await this.initRoom(this.room);
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
      history.replaceState(null, '', this.room ? `/?room=${this.room}` : '/');
    } else {
      this.applyAccount(await fetchMe());
    }
    this.authReady = true;
  }

  /** 방 접근 권한을 확인한 뒤에만 문서 저장·동기화를 시작한다 */
  private async initRoom(room: string) {
    let params: Record<string, string> = {};
    if (SERVER_URL) {
      try {
        const a = await checkAccess(room, this.invite);
        this.access = { status: 'ok', role: a.role, projectName: a.project.name };
        const session = loadSession();
        params = a.role === 'owner' && session ? { session } : this.invite ? { invite: this.invite } : session ? { session } : {};
      } catch (e) {
        const code = e instanceof AuthError ? e.status : 0;
        this.access = { status: 'denied', code: code === 401 || code === 403 || code === 404 ? code : 0 };
        return;
      }
    } else {
      this.access = { status: 'ok', role: 'owner', projectName: '로컬 작업' };
    }
    const persist = new IndexeddbPersistence(`ganpanda-${room}`, this.project.doc);
    persist.whenSynced.then(() => (this.ready = true));
    this.client = new SyncClient(room, this.project.doc, (s) => (this.sync = s), (p) => (this.peers = p), params);
    this.client.whenOnline(flushPendingUploads);
    this.client.setName(this.nickname);
  }

  /** 표시 이름: 계정 이름 > 기기에 정한 이름 > 이메일 앞부분 */
  applyAccount(a: Account | null) {
    this.account = a;
    if (a) this.setNickname(a.name || this.nickname || a.email.split('@')[0], false);
  }

  async renameAccount(name: string) {
    this.applyAccount(await updateName(name));
  }

  async logout() {
    await apiLogout();
    this.account = null;
    if (this.room) location.href = '/';
  }

  /** 대화·코멘트: viewer 는 서버 API 로, 그 외는 문서에 직접 */
  async sendMessage(objectId: string, text: string, kind: Message['kind']) {
    if (this.role === 'viewer' && this.room) {
      await postMessage(this.room, this.invite, { objectId, author: this.nickname, text, kind });
    } else {
      this.project.addMessage(objectId, this.nickname, text, kind);
    }
  }

  /** 사진 보드 위 내 커서 (world 좌표). null = 보드 밖 */
  setCursor(c: Cursor | null) {
    this.client?.setCursor(c);
  }

  setNickname(n: string, persist = true) {
    this.nickname = n;
    this.client?.setName(n);
    if (persist) save('ganpanda.nickname', n);
  }

  setKeymap(km: Keymap) {
    this.keymap = km;
    save('ganpanda.keymap', JSON.stringify(km));
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
function save(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* 저장 불가 환경 */ }
}

export const app = new AppState();
