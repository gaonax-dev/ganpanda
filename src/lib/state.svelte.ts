// 앱 전역 상태: Yjs 프로젝트 문서 + Svelte 반응성 연결, 계정·방 접근·동기화
import { IndexeddbPersistence } from 'y-indexeddb';
import { Project } from './core/project';
import { measurePhoto, type MeasureResult } from './core/measure';
import type { Attachment, ExtraItem, Message, ProjectSettings, SignObject } from './core/model';
import { mergePrices, type PriceTable } from './core/pricing';
import { pushHistory, type DesignRef } from './core/design';
import { insertVertex, removeVertex, zoneIndexAt, zonesOf } from './core/zone';
import { rasterizePolygon, zoneBounds } from './core/zoneMask';
import { calibrate, refsFromObjects, snapEdge, type Calibration, type RefLine } from './core/calibration';
import { convertFile, ConvertError } from './design/convert';
import { putAsset, StorageLimitError } from './assets';
import { formatBytes } from './core/format';
import { quoteProject } from './core/quote';
import { describeAttachments } from './core/attachments';
import { DEFAULT_KEYMAP, mergeKeymap, type Keymap } from './core/keymap';
import { isMacPlatform } from './core/wheel';
import { SERVER_URL, SyncClient, type SyncStatus } from './sync';
import { flushPendingUploads, setAssetScope } from './assets';
import type { Cursor, Peer } from './core/presence';
import { AuthError, describeAuthError, fetchMe, loadSession, logout as apiLogout, saveSession, updateName, verifyToken, type Account, type Usage } from './auth';
import { checkAccess, postMessage, postPin, type Role } from './projects';
import { markSeen, shouldNotify, unreadByObject, type SeenMap } from './core/unread';
import { createHistory } from './core/history';
import { Segmenter, type SegmentStatus } from './segment/segmenter';
import { boundsOf } from './core/mask';
import type { Pt } from './core/homography';
import { assetUrl } from './assets';

export interface Toast { id: string; objectId: string; author: string; text: string }

export type ViewKind = 'board' | 'list' | 'uv';
export type Tool = 'select' | 'rect' | 'ellipse' | 'pin' | 'magic' | 'zone';
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
  /** 선택한 핀 (사인물 선택과 배타적) */
  selectedPinId = $state<string | null>(null);
  /** 선택한 작업 존(사진 id, 존 번호)과 꼭짓점 번호 */
  zoneSel = $state<{ photoId: string; zone: number; vertex: number | null } | null>(null);
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
  /** 내 요금제 한도·사용량 (/api/me) */
  usage = $state<Usage | null>(null);
  /** 계정 기본 단가표 (/api/me) */
  accountPrices = $state<unknown>(null);
  pricesOpen = $state(false);
  letter3dOpen = $state(false);
  quoteSheetOpen = $state(false);
  /** 동시접속 한도에 막혀 연결 대기 중 */
  seatLimit = $state<{ used: number; limit: number } | null>(null);
  /** 화면 상단 알림 (용량 초과 등) */
  notice = $state('');
  /** 사인물별 내가 마지막으로 본 메시지 시각 (기기 저장) */
  seen = $state<SeenMap>({});
  /** 새 메시지 토스트 (최근 것이 뒤) */
  toasts = $state<Toast[]>([]);
  private readonly startedAt = Date.now();
  private knownMessageIds = new Set<string>();
  /** AI 자동 분리 (SlimSAM): 모델 상태, 사진별 분석 상태, 호버 미리보기 */
  private segmenter: Segmenter | null = null;
  segmentStatus = $state<SegmentStatus>('idle');
  segmentError = $state('');
  embeddedPhotos = $state<Record<string, 'embedding' | 'ready' | 'error'>>({});
  /** 사진별로 분석에 쓴 존 (바뀌면 다시 분석) */
  private embeddedZone = new Map<string, string>();
  hoverSegment = $state<{ photoId: string; polygon: Pt[] } | null>(null);
  private segmentSeq = 0;
  /** 실행 취소 (내 편집만) */
  private history = createHistory(this.project);
  private historyVersion = $state(0);
  canUndo = $derived.by(() => (this.historyVersion, this.canEdit && this.history.canUndo()));
  canRedo = $derived.by(() => (this.historyVersion, this.canEdit && this.history.canRedo()));

  photos = $derived.by(() => (this.version, this.project.allPhotos()));
  objects = $derived.by(() => (this.version, this.project.allObjects()));
  selected = $derived.by(() => (this.version, this.selectedId ? this.project.object(this.selectedId) ?? null : null));
  /** 사진별 기준선 구성 키 (사인물 id·변·치수·좌표) — 바뀌면 다시 평가·적용 */
  refsKeys = $derived.by(() => {
    const out = new Map<string, string>();
    for (const p of this.photos) {
      const refs = refsFromObjects(this.objects.filter((o) => o.photoId === p.id));
      out.set(p.id, refs.length ? JSON.stringify(refs.map((r) => [r.objectId, r.edge, r.mm, r.a, r.b])) : '');
    }
    return out;
  });
  /** 적용된 보정 (키가 현재 구성과 같을 때만) */
  calibrations = $derived.by(() => {
    const out = new Map<string, Calibration>();
    for (const p of this.photos) {
      const key = this.refsKeys.get(p.id);
      if (key && p.calib?.key === key) {
        const c = calibrate(refsFromObjects(this.objects.filter((o) => o.photoId === p.id)));
        if (c) out.set(p.id, c);
      }
    }
    return out;
  });
  /** 사진별 실측 판독 결과 (기준선 보정이 적용된 사진은 그 축척으로) */
  measures = $derived.by(() => {
    const out = new Map<string, MeasureResult>();
    for (const p of this.photos) {
      for (const [id, r] of measurePhoto(this.objects.filter((o) => o.photoId === p.id), p.w, p.h, this.calibrations.get(p.id))) out.set(id, r);
    }
    return out;
  });
  /** AI 평가 결과 (저장하지 않음) */
  calibEvals = $state<Record<string, { key: string; refs: (RefLine & { offset: number; confidence: number; deviation: number })[]; warnings: string[]; snapped: Record<string, Pt[]> }>>({});
  calibBusy = $state(false);
  pins = $derived.by(() => (this.version, this.project.allPins()));
  selectedPin = $derived.by(() => (this.version, this.selectedPinId ? this.project.pin(this.selectedPinId) ?? null : null));
  messages = $derived.by(() => (this.version, this.project.allMessages()));
  sources = $derived.by(() => (this.version, this.project.allSources()));
  /** UV 뷰에서 고른 사인물 */
  uvObjectId = $state<string | null>(null);
  converting = $state(false);
  settings = $derived.by<ProjectSettings>(() => (this.version, this.project.settings()));
  /** 이 프로젝트의 단가표 (문서에 있으면 그것, 없으면 계정 기본값, 없으면 예시) */
  prices = $derived<PriceTable>(mergePrices(this.settings.prices ?? this.accountPrices));
  quote = $derived(quoteProject(
    this.objects.flatMap((o) => { const sz = this.sizeOf(o); return sz ? [{ ...o, widthMm: sz.w, heightMm: sz.h }] : []; }),
    this.prices, { extras: this.settings.extras ?? [], installFee: this.settings.installFee ?? null },
  ));
  unread = $derived(unreadByObject(this.messages, this.seen, this.nickname));
  unreadTotal = $derived(Object.values(this.unread).reduce((a, b) => a + b, 0));
  role = $derived<Role | null>(this.access.status === 'ok' ? this.access.role : null);
  /** 편집 가능 여부 (viewer 는 보기·대화만). 서버 없는 로컬 모드는 항상 편집 가능 */
  canEdit = $derived(this.role === 'owner' || this.role === 'editor');

  constructor() {
    this.project.onChange(() => this.version++);
    this.history.onChange(() => this.historyVersion++);
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
    // 소셜 로그인 결과: /login#session=…&next=… → 세션 저장 후 next 로 이동 (주소에서 세션 제거)
    if (url.pathname === '/login' && url.hash.includes('session=')) {
      const h = new URLSearchParams(url.hash.slice(1));
      const session = h.get('session');
      const next = h.get('next') || '/';
      if (session) { saveSession(session); location.replace(next.startsWith('/') ? next : '/'); return; }
    }
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
      this.applyMe(await fetchMe());
    }
    this.authReady = true;
  }

  async refreshMe() {
    this.applyMe(await fetchMe());
  }

  private applyMe(me: Awaited<ReturnType<typeof fetchMe>>) {
    this.applyAccount(me?.account ?? null);
    this.usage = me ? { limits: me.limits, usage: me.usage } : null;
    this.accountPrices = me?.prices ?? null;
  }

  /** 기준선 상태: none / unevaluated / evaluated / applied / stale */
  calibStatus(photoId: string): 'none' | 'unevaluated' | 'evaluated' | 'applied' | 'stale' {
    const key = this.refsKeys.get(photoId);
    if (!key) return 'none';
    const photo = this.photos.find((p) => p.id === photoId);
    if (photo?.calib?.key === key) return 'applied';
    if (this.calibEvals[photoId]?.key === key) return 'evaluated';
    return photo?.calib ? 'stale' : 'unevaluated';
  }

  /** AI 평가: 각 기준선을 사진 모서리에 붙여 보정하고, 보정된 기준으로 축척 모순을 점검 */
  async evaluateCalibration(photoId: string) {
    const photo = this.project.photo(photoId);
    if (!photo || !this.canEdit) return;
    this.calibBusy = true;
    try {
      const objs = this.project.objectsOf(photoId);
      const refs = refsFromObjects(objs);
      const key = this.refsKeys.get(photoId) ?? '';
      const gray = await this.grayOf(photo.assetId, photo.w, photo.h);
      // 변마다 보정 → 꼭짓점 이동 (한 꼭짓점은 두 변의 이동을 합친다)
      const shift: Record<string, [number, number][]> = {};
      const results = refs.map((r) => {
        const snap = gray ? snapEdge(gray, r, 8) : { a: r.a, b: r.b, offset: 0, confidence: 0 };
        const dx = snap.a[0] - r.a[0], dy = snap.a[1] - r.a[1];
        const o = objs.find((x) => x.id === r.objectId)!;
        const sh = (shift[o.id] ??= o.quad.map(() => [0, 0]));
        const idx = r.edge === 'top' ? [0, 1] : r.edge === 'bottom' ? [3, 2] : r.edge === 'left' ? [0, 3] : [1, 2];
        for (const i of idx) { sh[i][0] += dx; sh[i][1] += dy; }
        return { ...r, offset: Math.round(snap.offset), confidence: snap.confidence };
      });
      const snapped: Record<string, Pt[]> = {};
      for (const o of objs) if (shift[o.id]) snapped[o.id] = o.quad.map((p, i) => [Math.round(p[0] + shift[o.id][i][0]), Math.round(p[1] + shift[o.id][i][1])] as Pt);
      const c = calibrate(refsFromObjects(objs.map((o) => (snapped[o.id] ? { ...o, quad: snapped[o.id] } : o))));
      const withDev = results.map((r) => ({ ...r, deviation: c?.perRef.find((p) => p.objectId === r.objectId && p.edge === r.edge)?.deviation ?? 0 }));
      this.calibEvals = { ...this.calibEvals, [photoId]: { key, refs: withDev, warnings: c?.warnings ?? ['기준을 계산할 수 없습니다.'], snapped } };
    } finally { this.calibBusy = false; }
  }

  /** 전체 적용: 보정된 사각 영역을 저장하고 이 구성을 적용된 기준으로 기록 */
  applyCalibration(photoId: string) {
    const ev = this.calibEvals[photoId];
    if (!ev || !this.canEdit) return;
    this.editBoundary();
    for (const [id, quad] of Object.entries(ev.snapped)) this.project.updateObject(id, { quad });
    const key = JSON.stringify(refsFromObjects(this.project.objectsOf(photoId)).map((r) => [r.objectId, r.edge, r.mm, r.a, r.b]));
    this.project.updatePhoto(photoId, { calib: { key, at: Date.now() } });
    this.editBoundary();
  }

  /** 사진의 회색조 (긴 변 1600px 이하로 줄이지 않고 원본 크기 — 좌표가 사진 px 이므로) */
  private async grayOf(assetId: string, w: number, h: number): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
    const url = await assetUrl(assetId);
    if (!url) return null;
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000;
    return { data: gray, width: w, height: h };
  }

  /** 디자인 파일 → 페이지 이미지 → 소스 등록 (편집 권한) */
  async addSourceFile(file: File) {
    if (!this.canEdit) return;
    this.converting = true;
    try {
      const { kind, pages } = await convertFile(file);
      const fileAssetId = await putAsset(file);
      const pageAssets = [];
      for (const pg of pages) pageAssets.push({ assetId: await putAsset(pg.blob), w: pg.w, h: pg.h });
      this.project.addSource({ name: file.name, kind, fileAssetId, pages: pageAssets, author: this.nickname });
    } catch (e) {
      if (e instanceof ConvertError) this.notice = e.message;
      else if (e instanceof StorageLimitError) this.notice = `저장 용량 한도(${formatBytes(e.limitBytes)})를 넘어 올릴 수 없습니다.`;
      else this.notice = '파일을 처리하지 못했습니다.';
    } finally { this.converting = false; }
  }

  /** 사인물에 디자인 영역을 입히고 이력에 남긴다 */
  setDesign(objectId: string, ref: DesignRef) {
    const o = this.project.object(objectId);
    if (!o || !this.canEdit) return;
    this.editBoundary();
    this.project.updateObject(objectId, { design: ref, designHistory: pushHistory(o.designHistory ?? [], ref, { at: Date.now(), author: this.nickname }) });
    this.editBoundary();
  }

  clearDesign(objectId: string) {
    if (!this.canEdit) return;
    this.editBoundary();
    this.project.updateObject(objectId, { design: undefined });
    this.editBoundary();
  }

  /** 단가표·설치비·추가 항목 수정 (편집 권한) */
  updateSettings(patch: Partial<ProjectSettings>) {
    if (this.canEdit) this.project.updateSettings(patch);
  }
  setPrices(prices: PriceTable) { this.updateSettings({ prices }); }
  setExtras(extras: ExtraItem[]) { this.updateSettings({ extras }); }

  /** 방 접근 권한을 확인한 뒤에만 문서 저장·동기화를 시작한다 */
  private async initRoom(room: string) {
    let params: Record<string, string> = {};
    if (SERVER_URL) {
      try {
        const a = await checkAccess(room, this.invite);
        this.access = { status: 'ok', role: a.role, projectName: a.project.name };
        const session = loadSession();
        const useSession = (a.role === 'owner' || !this.invite) && !!session;
        params = useSession ? { session: session! } : { invite: this.invite!, guest: guestId() };
        setAssetScope({ project: room, session: useSession ? session : null, invite: useSession ? null : this.invite });
        if (a.seats.used >= a.seats.limit) this.seatLimit = a.seats;
        this.watchSeats(room);
      } catch (e) {
        const code = e instanceof AuthError ? e.status : 0;
        this.access = { status: 'denied', code: code === 401 || code === 403 || code === 404 ? code : 0 };
        return;
      }
    } else {
      this.access = { status: 'ok', role: 'owner', projectName: '로컬 작업' };
      setAssetScope(null);
    }
    this.seen = (parse(load(`ganpanda.seen.${room}`)) as SeenMap | null) ?? {};
    this.project.onChange(() => this.detectNewMessages());
    const persist = new IndexeddbPersistence(`ganpanda-${room}`, this.project.doc);
    persist.whenSynced.then(() => (this.ready = true));
    this.client = new SyncClient(room, this.project.doc, (s) => (this.sync = s), (p) => (this.peers = p), params);
    this.client.whenOnline(flushPendingUploads);
    // 소유자가 열었는데 문서에 단가표가 없으면 계정 기본값(없으면 예시값)을 복사해 모두가 같은 단가를 보게 한다
    this.client.whenOnline(() => {
      if (this.role === 'owner' && !this.project.settings().prices) this.project.updateSettings({ prices: mergePrices(this.accountPrices) });
    });
    this.client.setName(this.nickname);
  }

  /** 표시 이름: 계정 이름 > 기기에 정한 이름 > 이메일 앞부분 */
  /** 연결이 안 될 때 좌석 한도 때문인지 3초마다 확인. 연결되면 안내를 지운다 */
  private watchSeats(room: string) {
    const tick = async () => {
      if (this.sync === 'online') { this.seatLimit = null; return; }
      if (this.sync === 'offline' || this.seatLimit) {
        try {
          const a = await checkAccess(room, this.invite);
          this.seatLimit = a.seats.used >= a.seats.limit ? a.seats : null;
        } catch { /* 서버 응답 없음 */ }
      }
    };
    setInterval(tick, 3000);
  }

  /** 선택한 사인물의 대화를 봤다고 기록 (ObjectPanel 이 열려 있을 때 호출) */
  markSeen(objectId: string) {
    const next = markSeen(this.seen, objectId, this.messages);
    if (next === this.seen) return;
    this.seen = next;
    if (this.room) save(`ganpanda.seen.${this.room}`, JSON.stringify(next));
  }

  /** 앱 시작 이후 새로 도착한 남의 메시지 → 토스트·브라우저 알림 */
  private detectNewMessages() {
    for (const m of this.project.allMessages()) {
      if (this.knownMessageIds.has(m.id)) continue;
      this.knownMessageIds.add(m.id);
      if (m.ts < this.startedAt) continue;
      if (!shouldNotify(m, { me: this.nickname, viewingObjectId: this.view === 'board' ? this.selectedId : null, hidden: document.hidden })) continue;
      const text = m.text || describeAttachments(m.attachments ?? []);
      this.toasts = [...this.toasts.slice(-3), { id: m.id, objectId: m.objectId, author: m.author, text }];
      setTimeout(() => this.dismissToast(m.id), 8000);
      this.browserNotify(m.author, text);
    }
  }

  dismissToast(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  /** 토스트를 누르면 그 사인물·핀의 대화를 연다 */
  openFromToast(t: Toast) {
    this.dismissToast(t.id);
    this.view = 'board';
    if (this.project.pin(t.objectId)) this.selectPin(t.objectId); else this.selectObject(t.objectId);
  }

  /** 자동 분리 도구 준비: 모델 로드 + 사진 분석 (사진당 한 번) */
  async prepareSegment(photoId: string) {
    if (!SERVER_URL) return;
    if (!this.segmenter) this.segmenter = new Segmenter(SERVER_URL, (st, detail) => { this.segmentStatus = st; this.segmentError = detail ?? ''; });
    const photo = this.project.photo(photoId);
    if (!photo) return;
    // 존이 바뀌었으면 이전 분석을 버린다 (존마다 따로 분석: 키 = photoId#번호)
    const zones = zonesOf(photo).filter((z) => z.length >= 3);
    const zoneKey = JSON.stringify(zones);
    if (this.embeddedPhotos[photoId] && this.embeddedZone.get(photoId) !== zoneKey) {
      this.segmenter.forget(photoId);
      for (let i = 0; i < 64; i++) this.segmenter.forget(`${photoId}#${i}`);
      const { [photoId]: _, ...rest } = this.embeddedPhotos; this.embeddedPhotos = rest;
    }
    if (this.embeddedPhotos[photoId]) return;
    const url = await assetUrl(photo.assetId);
    if (!url) return;
    this.embeddedZone.set(photoId, zoneKey);
    this.embeddedPhotos = { ...this.embeddedPhotos, [photoId]: 'embedding' };
    try {
      if (!zones.length) await this.segmenter.embed(photoId, url);
      else {
        // 존마다 외곽만 잘라 분석(해상도 집중), 결과는 그 존 안으로만
        for (let i = 0; i < zones.length; i++) {
          const region = zoneBounds(zones[i], photo.w, photo.h, 16);
          const local = zones[i].map(([x, y]) => [x - region.x, y - region.y] as Pt);
          await this.segmenter.embed(`${photoId}#${i}`, url, { region, clip: rasterizePolygon(local, region.w, region.h) });
        }
      }
      this.embeddedPhotos = { ...this.embeddedPhotos, [photoId]: 'ready' };
    } catch {
      this.embeddedPhotos = { ...this.embeddedPhotos, [photoId]: 'error' };
    }
  }

  /** 호버 지점의 물체 윤곽 미리보기 (최신 요청만 반영) */
  async segmentAt(photoId: string, x: number, y: number) {
    if (!this.segmenter || this.embeddedPhotos[photoId] !== 'ready') return;
    const photo = this.project.photo(photoId);
    const zones = photo ? zonesOf(photo).filter((z) => z.length >= 3) : [];
    let key = photoId;
    if (zones.length) {
      const zi = zoneIndexAt(zones, [x, y]);
      if (zi < 0) { this.clearHoverSegment(); return; } // 존 밖
      key = `${photoId}#${zi}`;
    }
    const seq = ++this.segmentSeq;
    const r = await this.segmenter.segment(key, x, y);
    if (seq !== this.segmentSeq) return;
    this.hoverSegment = r ? { photoId, polygon: r.polygon } : null;
  }

  clearHoverSegment() { this.segmentSeq++; this.hoverSegment = null; }

  /** 미리보기 윤곽을 다각형 사인물로 만든다 */
  createFromSegment() {
    const h = this.hoverSegment;
    if (!h || !this.canEdit) return;
    const b = boundsOf(h.polygon);
    const quad: Pt[] = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
    this.editBoundary();
    const id = this.project.addObject({ photoId: h.photoId, name: `사인물 ${this.objects.length + 1}`, shape: 'polygon', quad, polygon: h.polygon, sheetIds: [] });
    this.editBoundary();
    this.hoverSegment = null;
    this.selectObject(id);
  }

  undo() { if (this.canEdit) this.history.undo(); }
  redo() { if (this.canEdit) this.history.redo(); }
  /** 별개의 동작(추가·삭제·드래그 끝) 경계 — 이후 변경은 새 실행 취소 묶음 */
  editBoundary() { this.history.stopCapturing(); }

  selectObject(id: string | null) {
    this.selectedId = id;
    if (id) { this.selectedPinId = null; this.zoneSel = null; }
  }

  selectPin(id: string | null) {
    this.selectedPinId = id;
    if (id) { this.selectedId = null; this.zoneSel = null; }
  }

  selectZone(photoId: string | null, zone = 0, vertex: number | null = null) {
    this.zoneSel = photoId ? { photoId, zone, vertex } : null;
    if (photoId) { this.selectedId = null; this.selectedPinId = null; }
  }

  // ---------- 작업 존 (사진마다 여러 개) ----------

  private writeZones(photoId: string, zones: Pt[][], boundary = true) {
    if (boundary) this.editBoundary();
    this.project.updatePhoto(photoId, { zones, zone: undefined });
    if (boundary) this.editBoundary();
  }

  /** 존 추가 → 새 존을 선택 */
  addZone(photoId: string, zone: Pt[]) {
    const photo = this.project.photo(photoId);
    if (!photo || !this.canEdit) return;
    const zones = [...zonesOf(photo), zone];
    this.writeZones(photoId, zones);
    this.selectZone(photoId, zones.length - 1);
  }

  moveZoneVertex(photoId: string, zone: number, index: number, p: Pt) {
    const photo = this.project.photo(photoId);
    const zones = photo ? zonesOf(photo) : [];
    if (!zones[zone] || !this.canEdit) return;
    this.writeZones(photoId, zones.map((z, zi) => (zi === zone ? z.map((v, i) => (i === index ? p : v)) : z)), false);
  }

  /** 변 중간 클릭 → 꼭짓점 추가, 추가된 꼭짓점을 선택 */
  addZoneVertex(photoId: string, zone: number, edge: number, p: Pt) {
    const photo = this.project.photo(photoId);
    const zones = photo ? zonesOf(photo) : [];
    if (!zones[zone] || !this.canEdit) return;
    this.writeZones(photoId, zones.map((z, zi) => (zi === zone ? insertVertex(z, edge, p) : z)));
    this.selectZone(photoId, zone, edge + 1);
  }

  /** Delete: 꼭짓점이 선택돼 있으면 꼭짓점(3개 미만으로는 안 줄어듦), 아니면 존 자체를 지운다 */
  deleteZoneSelection(): boolean {
    const s = this.zoneSel;
    const photo = s && this.project.photo(s.photoId);
    const zones = photo ? zonesOf(photo) : [];
    if (!s || !zones[s.zone] || !this.canEdit) return false;
    if (s.vertex !== null) {
      const next = removeVertex(zones[s.zone], s.vertex);
      if (next !== zones[s.zone]) this.writeZones(s.photoId, zones.map((z, zi) => (zi === s.zone ? next : z)));
      this.selectZone(s.photoId, s.zone, null);
    } else {
      this.writeZones(s.photoId, zones.filter((_, zi) => zi !== s.zone));
      this.selectZone(null);
    }
    return true;
  }

  /** 핀 만들기: viewer 는 서버 API 로, 그 외는 문서에 직접. 만든 핀을 선택한다 */
  async createPin(photoId: string, x: number, y: number) {
    const body = { photoId, x: Math.round(x), y: Math.round(y), author: this.nickname };
    let id: string;
    if (this.role === 'viewer' && this.room) id = (await postPin(this.room, this.invite, body)).pin.id;
    else { this.editBoundary(); id = this.project.addPin(body); this.editBoundary(); }
    this.tool = 'select';
    this.selectPin(id);
  }

  private browserNotify(author: string, text: string) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return;
    try { new Notification(`${author}: ${text.slice(0, 80)}`, { tag: 'ganpanda-chat' }); } catch { /* 알림 불가 환경 */ }
  }

  /** 사용자가 처음 대화를 보낼 때 브라우저 알림 권한을 요청 (사용자 동작이 있을 때만 허용됨) */
  requestNotifyPermission() {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  }

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
  async sendMessage(objectId: string, text: string, kind: Message['kind'], attachments: Attachment[] = []) {
    if (this.role === 'viewer' && this.room) {
      await postMessage(this.room, this.invite, { objectId, author: this.nickname, text, kind, attachments });
    } else {
      this.project.addMessage(objectId, this.nickname, text, kind, attachments);
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
/** 초대 손님의 브라우저 고유 ID — 같은 사람의 탭 여러 개를 한 좌석으로 세기 위해 */
function guestId(): string {
  let id = load('ganpanda.guestId');
  if (!id) { id = crypto.randomUUID(); save('ganpanda.guestId', id); }
  return id;
}
function save(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* 저장 불가 환경 */ }
}

export const app = new AppState();
// 개발·E2E 전용 훅 (운영 빌드에는 없음)
if (import.meta.env.DEV) (window as unknown as { __ganpanda: AppState }).__ganpanda = app;
