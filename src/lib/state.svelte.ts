// 앱 전역 상태: Yjs 프로젝트 문서 + Svelte 반응성 연결, 계정·방 접근·동기화
import { participantsOf, pinVisibleTo } from './core/pins';
import { loadLocalColors, saveLocalColors, validColorLibrary, type ColorCard } from './core/colorLibrary';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Project } from './core/project';
import { measurePhoto, type MeasureResult } from './core/measure';
import { newVersionAvailable, shouldAutoReload } from './core/version';
import { layoutList } from './core/layout';
import type { Attachment, ExtraItem, ProjectSettings, SignObject } from './core/model';
import { mergePrices, type PriceTable } from './core/pricing';
import { pushHistory, type DesignRef } from './core/design';
import { insertVertex, removeVertex, zoneIndexAt, zonesOf } from './core/zone';
import { rasterizePolygon, zoneBounds } from './core/zoneMask';
import type { Calibration } from './core/calibration';
import { calibrationOf, proposeAxisLines, snapSetup, solveCamera, type CameraSetup, type CameraSolution } from './core/camera';
import { convertFile, ConvertError } from './design/convert';
import { assetUrl, imageSize, putAsset, StorageLimitError } from './assets';
import { clampFlatScale } from './core/boardCards';
import { fetchRequestPhoto, getRequestPhotoCount } from './requests';
import { formatBytes } from './core/format';
import { quoteProject } from './core/quote';
import { resolveLinks } from './core/link';
import { approvalState, contentHash, fnv1a, snapshotOf } from './core/proposal';
import { faceSizeOf, wallPlaneOf } from './core/wallPlane';
import { describeAttachments } from './core/attachments';
import { DEFAULT_KEYMAP, mergeKeymap, type Keymap } from './core/keymap';
import { isMacPlatform } from './core/wheel';
import { SERVER_URL, SyncClient, type SyncStatus } from './sync';
import { flushPendingUploads, onAssetsRecovered, retryMissingAssets, setAssetScope } from './assets';
import type { Cursor, Peer } from './core/presence';
import { AuthError, describeAuthError, fetchMe, loadSession, logout as apiLogout, saveSession, updateName, verifyLink, type Account, type Usage, saveColors } from './auth';
import { checkAccess, postApproval, postMessage, postPin, type Role } from './projects';
import { markSeen, shouldNotify, unreadByObject, type SeenMap } from './core/unread';
import { createHistory } from './core/history';
import { clipOf, pastedObject, type ClipSign } from './core/clipboard';
import { productById, signParts } from './core/catalog';
import { Segmenter, type SegmentStatus } from './segment/segmenter';
import { boundsOf } from './core/mask';
import type { Pt } from './core/homography';


export interface Toast { id: string; objectId: string; author: string; text: string }

export type ViewKind = 'board' | 'list' | 'uv';
export type Tool = 'select' | 'rect' | 'ellipse' | 'pin' | 'magic' | 'zone';
/** 방 접근 상태: 확인 중 / 허용 / 거부(이유) */
export type Access =
  | { status: 'loading' }
  | { status: 'ok'; role: Role; projectName: string; /** 정산 보기: 오너 또는 "정산 보기"를 켠 팀 멤버 */ billing?: boolean; /** 소유자가 무료 요금제 → 제안 페이지에 간판다 표시 */ branding?: boolean; /** 요청에서 만든 프로젝트 (요청판) */ requestId?: string }
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
  /** 휴대폰 폭(≤ 720px): 라벨을 축약하고 패널·창을 전체 폭으로 (2026-10-14 사용자: "텍스트도 자리가 넘치거나 모자란데 단축어로") */
  compact = $state(typeof matchMedia === 'function' && matchMedia('(max-width: 720px)').matches);
  /** 현재 방(프로젝트). null = 홈 화면 */
  readonly room: string | null;
  /** 로그인 없는 페이지 (요청판, 2026-10-17): /request = 요청 올리기, /r/<id> = 고객의 내 요청 페이지 */
  readonly page: 'request' | 'request-view' | null;
  /** 요청 받기 설정 (/api/me) */
  requestSettings = $state<{ receive: boolean; regions: string[] } | null>(null);
  /** 요청판 화면 켜기 (2026-10-17 사용자: "우선 안보이게 해줘 현재는 간판 실측툴로서 기본기를 단단히 하겠다"). 서버·API 는 그대로, 화면만 숨김.
      켜려면 빌드에 VITE_REQUESTS=1 또는 기기에 localStorage 'ganpanda.requests' = '1' (E2E·내부 확인용) */
  readonly requestsEnabled = import.meta.env.VITE_REQUESTS === '1' || load('ganpanda.requests') === '1';
  /** 초대 토큰 (이 방에 초대 링크로 들어온 경우) */
  readonly invite: string | null;
  access = $state<Access>({ status: 'loading' });
  /** 동기화 서버 연결 상태와 다른 접속자 */
  sync = $state<SyncStatus>('local');
  peers = $state<Peer[]>([]);
  private client: SyncClient | null = null;
  /** 로그인한 계정 (null = 로그아웃 상태). authReady 전에는 미확인 */
  account = $state<Account | null>(null);
  /** 비밀번호 창: reset = 재설정 링크로 들어옴(현재 비밀번호 없이), change = 설정에서 바꾸기/만들기 */
  passwordOpen = $state<'reset' | 'change' | null>(null);
  authReady = $state(false);
  loginOpen = $state(false);
  /** 매직링크 처리 중 생긴 오류 (로그인 창에 표시) */
  authError = $state('');
  /** 내 요금제 한도·사용량 (/api/me) */
  usage = $state<Usage | null>(null);
  /** 계정 기본 단가표 (/api/me) */
  accountPrices = $state<unknown>(null);
  /** 못 받았던 에셋을 나중에 받았을 때 1 증가 — 에셋 URL 을 쓰는 화면은 이 값을 읽어 다시 요청한다 (2026-10-17 "모바일에서 누락") */
  assetEpoch = $state(0);
  /** 색 라이브러리 (2026-10-17 "색상관리가 중요하다"): 계정에 저장(서버) + 기기 사본(localStorage). 로그인 전에도 기기 사본으로 쓴다 → core/colorLibrary.ts */
  colorLibrary = $state<ColorCard[]>(loadLocalColors());
  pricesOpen = $state(false);
  letter3dOpen = $state(false);
  /** 선택한 사인물의 세부 설정 창 */
  objectSettingsOpen = $state(false);
  /** 설정 창을 칩에서 열었을 때 바로 펼칠 요소 (빠른 설정, 2026-10-17) */
  objectSettingsFocus = $state<string | null>(null); // 'body' | 'part:<id>' | 'layout' | 'note' | 'price'
  /** 휴대폰 폭: 전체 속성 패널을 열었는가 (기본은 빠른 막대만 — 패널이 사진을 가리지 않게). 데스크톱에서는 항상 열림 */
  panelOpen = $state(false);
  /** 실사 보기 창 (사진 id) */
  renderPhotoId = $state<string | null>(null);
  /** 마지막으로 저장한 실사 PNG (데이터 URL, 테스트·재첨부용) */
  /** 보드 단계: 원본(실측·편집) / 3D(모든 사진 위에 합성 결과를 겹침, 편집 없음). 2026-10-15 사용자: "3D 는 화면에 바로 올리고" */
  /** 보드 단계 (2026-10-17 사용자: "원본 2d 3d 이렇게 해줘. 2d가 현재 보여주는 형식이고 원본은 실측만 나오게"): original = 외곽선·치수만, 2d = 바탕색·디자인·글자 겹침(기본), 3d = 합성 */
  stage = $state<'original' | '2d' | '3d'>('2d');
  /** 3D 단계의 사진별 합성 결과 (내용 키 + 데이터 URL) */
  stageRenders = $state<Record<string, { key: string; url: string }>>({});
  /** 지금 합성 중인 사진 수 */
  stageBusy = $state(0);
  /** 사진의 3D 합성에 영향을 주는 내용의 키 — 같으면 다시 그리지 않는다 */
  stageKey(photoId: string): string {
    const p = this.photos.find((x) => x.id === photoId);
    const objs = this.objects.filter((o) => o.photoId === photoId).map((o) => [o.id, o.quad, o.shape, o.corner ?? null, o.polygon ?? null, o.productId ?? null, o.sheetIds, o.text ?? null, o.charCount ?? null, o.widthMm ?? null, o.heightMm ?? null, o.depthMm ?? null, o.options ?? null, o.letter3d ?? null, o.sameAs ?? null, o.parts ?? null /* 구성 요소·정면도 배치 (2026-10-17 "3d가 아직 정면도의 변경을 따르지 않는다") */, o.design ?? null /* 입힌 디자인 (2026-10-17) */]);
    return fnv1a(JSON.stringify({ objs, cam: p?.camera ?? null, w: p?.w, h: p?.h }));
  }
  /** 마지막으로 만든 전개도 SVG (테스트·재사용) */
  lastSvg = $state('');
  lastRender = $state('');
  quoteSheetOpen = $state(false);
  /** 주문 정보 창 */
  orderOpen = $state(false);
  /** 제안 보내기 창 (제작자) */
  proposalOpen = $state(false);
  /** 사진과 입력 치수가 다르다는 경고 표시 (옵션, 기본 꺼짐 — 2026-10-14 사용자: "사이즈는 제작을 위한 메모, 경고는 옵션") */
  warnMeasure = $state(load('ganpanda.warnMeasure') === '1');
  /** 축 선 자동 제안의 축: 실내 XY(가로+세로) / 실외 XZ(가로+높이). 기본 XY, 기기에 저장 (2026-10-15 사용자) */
  autoAxes = $state<'xy' | 'xz'>(load('ganpanda.autoAxes') === 'xz' ? 'xz' : 'xy');
  setAutoAxes(v: 'xy' | 'xz') { this.autoAxes = v; save('ganpanda.autoAxes', v); }
  /** 매니퓰레이터 기본 크기 (화면 px, 기기에 저장, 2026-10-15 사용자: "기본 매니퓰레이터 크기 조절 가능하게") */
  gizmoSize = $state(Math.min(96, Math.max(32, Number(load('ganpanda.gizmoSize')) || 48)));
  setGizmoSize(v: number) { this.gizmoSize = Math.min(96, Math.max(32, Math.round(v))); save('ganpanda.gizmoSize', String(this.gizmoSize)); }
  /** 제안 페이지 모드 (고객용 화면). ?proposal=1 로 열거나 제작자가 미리보기 */
  proposalMode = $state(false);
  /** 동시접속 한도에 막혀 연결 대기 중 */
  seatLimit = $state<{ used: number; limit: number } | null>(null);
  /** 화면 상단 알림 (용량 초과 등) */
  notice = $state('');
  /** 새 배포가 있음 (오래 열어 둔 탭) → 새로고침 안내 */
  updateAvailable = $state(false);
  /** 보드가 이 사진을 화면에 맞추라는 요청 (리스트에서 사진에 올린 뒤) */
  reveal = $state<{ photoId: string; n: number } | null>(null);
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
  /** 모든 영역 (연결된 영역은 원본 규격 + 자기 위치로 풀어서) */
  objects = $derived.by(() => (this.version, resolveLinks(this.project.allObjects())));
  /** 사인물 = 원본만 (리스트·견적·UV 대상). 연결된 영역은 제외 */
  signs = $derived(this.objects.filter((o) => !o.sameAs));
  selected = $derived.by(() => (this.selectedId ? this.objects.find((o) => o.id === this.selectedId) ?? null : null));
  /** 다중 선택 (2026-10-17 사용자: "다중선택 시 작동 버튼 나오게 삭제, 복사, 마지막 선택 구성으로 맞추기"): Shift+클릭으로 더한 사인물들. selectedId 가 마지막 선택 */
  multi = $state<string[]>([]);
  /** 선택이 무엇으로 이루어졌나: 사진 위 외곽선(shape) / 평면도 카드(card). 섞이지 않는다 — 다른 쪽을 Shift+클릭하면 선택을 풀고 새로 시작 (2026-10-17 사용자: "정면도와 사인물 외곽라인은 같이 선택할 수 없다. 다른게 선택되면 선택 풀어줘") */
  selectionKind = $state<'shape' | 'card'>('shape');
  /** 선택 전체 (마지막 선택이 맨 뒤) */
  selectionIds = $derived([...this.multi.filter((id) => id !== this.selectedId), ...(this.selectedId ? [this.selectedId] : [])]);
  /** 선택한 사인물과 같은 사인물인 다른 영역들(원본·연결) — 다른 사진에서도 하이라이트 */
  sameAsSelected = $derived.by(() => {
    const s = this.selected;
    if (!s) return [] as string[];
    const root = s.sameAs ?? s.id;
    return this.objects.filter((o) => o.id !== s.id && (o.id === root || o.sameAs === root)).map((o) => o.id);
  });
  /** 사진별 카메라 (사진에 저장된 설정을 풀어서) */
  cameras = $derived.by(() => {
    const out = new Map<string, CameraSolution>();
    for (const p of this.photos) if (p.camera) { const c = solveCamera(p.camera, p.w, p.h); if (c) out.set(p.id, c); }
    return out;
  });
  /** 실측·벽면 코드가 쓰는 보정 (카메라 → 사진 px → 벽 mm) */
  calibrations = $derived.by(() => {
    const out = new Map<string, Calibration>();
    for (const [id, c] of this.cameras) out.set(id, calibrationOf(c));
    return out;
  });
  /** 사진별 실측 판독 결과 (기준선 보정이 적용된 사진은 그 축척으로) */
  measures = $derived.by(() => {
    const out = new Map<string, MeasureResult>();
    for (const p of this.photos) {
      const calib = this.calibrations.get(p.id);
      // 세 면: 벽면이 아닌 면(벽에 직각인 세로면·수평면)의 사인물은 그 면에서 잰다 (2026-10-15 "삼면 구조로 진행해줘")
      const cal = calib?.metric ? wallPlaneOf([], calib) : null;
      for (const [id, r] of measurePhoto(this.objects.filter((o) => o.photoId === p.id), p.w, p.h, calib, cal ? (o) => faceSizeOf(o, cal) : undefined)) out.set(id, r);
    }
    return out;
  });
  /** 카메라 설정 창 (사진 id) 과 편집 중인 설정 (적용 전) */
  cameraPhotoId = $state<string | null>(null);
  cameraPhoto = $derived(this.cameraPhotoId ? this.photos.find((p) => p.id === this.cameraPhotoId) ?? null : null);
  cameraDraft = $state<CameraSetup | null>(null);
  cameraBusy = $state(false);
  /** 편집 중인 설정의 풀이 (경고·초점거리 표시용) */
  cameraDraftSolution = $derived.by(() => {
    const p = this.cameraPhoto, d = this.cameraDraft;
    return p && d ? solveCamera(d, p.w, p.h) : null;
  });
  pins = $derived.by(() => (this.version, this.project.allPins()));
  /** 나에게 보이는 말풍선: 모두에게 보낸 것 + 내가 보냈거나 받는 것 (+ 소유자는 전부) — core/pins.ts (2026-10-17) */
  visiblePins = $derived(this.pins.filter((p) => pinVisibleTo(p, this.nickname, this.role)));
  selectedPin = $derived.by(() => (this.version, this.selectedPinId ? this.project.pin(this.selectedPinId) ?? null : null));
  messages = $derived.by(() => (this.version, this.project.allMessages()));
  /** 말풍선 받는 사람 후보 */
  participants = $derived(participantsOf(this.peers.map((p) => p.name), this.messages, this.pins, this.nickname));
  sources = $derived.by(() => (this.version, this.project.allSources()));
  /** UV 뷰에서 고른 사인물 */
  uvObjectId = $state<string | null>(null);
  converting = $state(false);
  settings = $derived.by<ProjectSettings>(() => (this.version, this.project.settings()));
  /** 이 프로젝트의 단가표 (문서에 있으면 그것, 없으면 계정 기본값, 없으면 예시) */
  prices = $derived<PriceTable>(mergePrices(this.settings.prices ?? this.accountPrices));
  quote = $derived(quoteProject(
    // 치수가 없어도 개(1식) 단위 종류(사인미러·전광판·지주·에어간판)는 견적에 넣는다 (2026-10-15 한울 조합형)
    this.signs.flatMap((o) => { const sz = this.sizeOf(o); return sz ? [{ ...o, widthMm: sz.w, heightMm: sz.h }] : productById(signParts(o).bodyId)?.unit === 'ea' ? [o] : []; }),
    this.prices, { extras: this.settings.extras ?? [], installFee: this.settings.installFee ?? null, mode: this.settings.quoteMode ?? 'auto', lineAmounts: this.settings.lineAmounts ?? {} },
  ));
  unread = $derived(unreadByObject(this.messages, this.seen, this.nickname));
  /** 승인 대상 내용의 해시 (사인물 규격·치수·디자인·금액) */
  contentHash = $derived(contentHash(this.signs, (o) => this.sizeOf(o), this.quote));
  /** 최신 승인과 현재 내용의 관계 */
  approval = $derived(approvalState(this.settings.approvals, this.contentHash));
  unreadTotal = $derived(Object.values(this.unread).reduce((a, b) => a + b, 0));
  role = $derived<Role | null>(this.access.status === 'ok' ? this.access.role : null);
  /** 편집 가능 여부 (viewer 는 보기·대화만). 서버 없는 로컬 모드는 항상 편집 가능 */
  canEdit = $derived(this.role === 'owner' || this.role === 'editor');
  /** 고객(보기 초대): 사진 보드만, 금액 없음 (2026-10-16 "고객에게 보여지는 것은 사진보드만 보인다." 금액은 제안 링크에서) */
  isCustomer = $derived(this.role === 'viewer');
  /** 원가(공급사 금액)·이익 금액은 오너만 (2026-10-16 "원가와 판매가로 이익율이 확인되어야한다. 오너와 맴버(허가시)에게만보이게") */
  seesCost = $derived(this.role === 'owner');
  /** 이익율·손해 표시: 오너, 또는 설정의 팀 멤버 중 "정산 보기"를 켠 사람(편집 초대로 들어옴) */
  seesMargin = $derived(this.role === 'owner' || (this.role === 'editor' && this.access.status === 'ok' && !!this.access.billing));

  constructor() {
    onAssetsRecovered(() => { this.assetEpoch++; });
    this.project.onChange(() => this.version++);
    this.history.onChange(() => this.historyVersion++);
    const url = new URL(location.href);
    this.page = url.pathname === '/request' ? 'request' : /^\/r\/[A-Za-z0-9_-]{16}$/.test(url.pathname) ? 'request-view' : null;
    // 서버가 없으면(오프라인 빌드) 로컬 기본 방
    this.room = url.searchParams.get('room') ?? (SERVER_URL ? null : 'local-default');
    const inviteParam = url.searchParams.get('invite');
    this.invite = this.room ? inviteParam ?? load(`ganpanda.invite.${this.room}`) : null;
    this.proposalMode = url.searchParams.get('proposal') === '1';
    const v = url.searchParams.get('view'); // 홈 그룹의 프로젝트 링크 → 바로 리스트 뷰(견적 세부)
    if (v === 'list' || v === 'uv' || v === 'board') this.view = v;
    if (this.room && inviteParam) {
      save(`ganpanda.invite.${this.room}`, inviteParam);
      history.replaceState(null, '', `/?room=${this.room}${this.proposalMode ? '&proposal=1' : ''}`); // 주소에서 토큰 제거
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
        const r = await verifyLink(token);
        this.applyAccount(r.account);
        if (r.reset) this.passwordOpen = 'reset'; // 비밀번호 재설정 링크 → 새 비밀번호 정하기
        else if (url.searchParams.get('verify') === '1') this.notice = '이메일 인증이 끝났습니다. 가입을 환영합니다!';
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

  /** 요청 사진 → 내 프로젝트의 사진 (소유자 용량에 쌓임). 동기화가 끝난 뒤 사진이 하나도 없을 때만, 한 번만 */
  private importing = false;
  private async importRequestPhotos(requestId: string) {
    if (this.importing) return;
    this.importing = true;
    try {
      await new Promise((r) => setTimeout(r, 800)); // 서버 문서가 먼저 도착하게
      if (this.photos.length) return;
      const n = await getRequestPhotoCount(requestId);
      let right = 0;
      for (let i = 0; i < n; i++) {
        const blob = await fetchRequestPhoto(requestId, i);
        const assetId = await putAsset(blob);
        const { w, h } = await imageSize((await assetUrl(assetId))!);
        const width = 1200;
        this.project.addPhoto({ name: `요청 사진 ${i + 1}`, assetId, w, h, x: right, y: 0, width });
        right += width + 120;
      }
    } catch (e) {
      this.notice = `요청 사진을 가져오지 못했습니다: ${e instanceof Error ? e.message : e}`;
    } finally { this.importing = false; }
  }

  async refreshMe() {
    this.applyMe(await fetchMe());
  }

  private applyMe(me: Awaited<ReturnType<typeof fetchMe>>) {
    this.applyAccount(me?.account ?? null);
    this.usage = me ? { limits: me.limits, usage: me.usage } : null;
    this.accountPrices = me?.prices ?? null;
    const colors = validColorLibrary(me?.colors);
    if (colors) { this.colorLibrary = colors.colors; saveLocalColors(colors.colors); }
    else if (me && this.colorLibrary.length) void this.persistColors(); // 기기에만 있던 라이브러리를 계정에 올린다
    this.requestSettings = me?.requestSettings ?? null;
  }

  // ---------- 카메라 설정 (사진별, 사인물과 무관) ----------

  /** 이 사진에 3D 벽면을 만들 수 있나: 원근 설정이 있거나 치수를 입력한 사인물이 있으면 */
  threeDOk(photoId: string) {
    return this.cameras.has(photoId) || !!wallPlaneOf(this.objects.filter((o) => o.photoId === photoId), null);
  }

  /** 설정 창 열기: 저장된 설정이 있으면 그것, 없으면 사진 크기 기준 기본 배치로 시작 */
  openCamera(photoId: string) {
    const p = this.photos.find((x) => x.id === photoId);
    if (!p) return;
    this.cameraDraft = p.camera ? (JSON.parse(JSON.stringify(p.camera)) as CameraSetup) : defaultCameraSetup(p.w, p.h);
    this.cameraPhotoId = photoId;
  }
  closeCamera() { this.cameraPhotoId = null; this.cameraDraft = null; }

  /** AI 자동 제안: 사진의 강한 직선에서 가로·세로 축 선을 찾고 끝점을 모서리에 붙인다. 원점·기준 길이는 유지 */
  async proposeCamera() {
    const p = this.cameraPhoto;
    if (!p || !this.cameraDraft || !this.canEdit) return false;
    this.cameraBusy = true;
    try {
      const gray = await this.grayOf(p.assetId, p.w, p.h);
      const found = gray && proposeAxisLines(gray);
      if (!gray || !found) return false;
      // 첫 쌍 = 가로 선(+X), 둘째 쌍 = 실내 XY 면 세로(+Y) / 실외 XZ 면 높이(+Z) — 옵션 app.autoAxes (기본 XY, 2026-10-15 사용자)
      this.cameraDraft = snapSetup(gray, { ...this.cameraDraft, x: found.x, y: found.y, axes: { first: '+x', second: this.autoAxes === 'xz' ? '+z' : '+y' } });
      return true;
    } finally { this.cameraBusy = false; }
  }

  /** 현재 선들의 끝점을 사진 모서리에 붙인다 */
  async snapCamera() {
    const p = this.cameraPhoto;
    if (!p || !this.cameraDraft || !this.canEdit) return;
    this.cameraBusy = true;
    try {
      const gray = await this.grayOf(p.assetId, p.w, p.h);
      if (gray) this.cameraDraft = snapSetup(gray, this.cameraDraft);
    } finally { this.cameraBusy = false; }
  }

  /** 적용: 사진에 저장 (실시간 공유·⌘Z 가능) */
  applyCamera() {
    const p = this.cameraPhoto;
    if (!p || !this.cameraDraft || !this.canEdit) return;
    this.editBoundary();
    this.project.updatePhoto(p.id, { camera: $state.snapshot(this.cameraDraft) as CameraSetup });
    this.editBoundary();
    this.closeCamera();
  }

  clearCamera(photoId: string) {
    if (!this.canEdit) return;
    this.editBoundary();
    this.project.updatePhoto(photoId, { camera: undefined });
    this.editBoundary();
    if (this.cameraPhotoId === photoId) this.closeCamera();
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
  /** 제안 승인 ([이걸로 할게요]): 현재 내용 스냅샷 + 해시 + 이름을 서버가 문서에 기록 */
  async approve(by: string) {
    if (!this.room) throw new Error('방이 없습니다');
    this.setNickname(by);
    const snapshot = snapshotOf(this.signs, (o) => this.sizeOf(o), this.quote, this.sources);
    await postApproval(this.room, this.role === 'owner' ? null : this.invite, { by, hash: this.contentHash, snapshot, proposalId: this.settings.proposal?.id });
  }

  updateSettings(patch: Partial<ProjectSettings>) {
    if (this.canEdit) this.project.updateSettings(patch);
  }
  setPrices(prices: PriceTable) { this.updateSettings({ prices }); }
  setExtras(extras: ExtraItem[]) { this.updateSettings({ extras }); }
  /** 견적 줄 금액: 숫자 = 수동, 'auto' = 자동 전환, null = 지움(프로젝트 기본) */
  setLineAmount(key: string, v: number | 'auto' | null) {
    const next = { ...(this.settings.lineAmounts ?? {}) };
    if (v === null) delete next[key]; else next[key] = v;
    this.updateSettings({ lineAmounts: next });
  }
  /** 지금 보이는 모든 줄을 자동으로 */
  autoAllLines() {
    this.updateSettings({ lineAmounts: { ...(this.settings.lineAmounts ?? {}), ...Object.fromEntries(this.quote.lines.map((l) => [l.key, 'auto' as const])) } });
  }

  /** 방 접근 권한을 확인한 뒤에만 문서 저장·동기화를 시작한다 */
  private async initRoom(room: string) {
    let params: Record<string, string> = {};
    if (SERVER_URL) {
      try {
        const a = await checkAccess(room, this.invite);
        this.access = { status: 'ok', role: a.role, projectName: a.project.name, billing: !!a.billing, branding: !!a.branding, ...(a.requestId ? { requestId: a.requestId } : {}) };
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
    this.client.whenOnline(() => void retryMissingAssets()); // 못 받은 에셋 다시 (2026-10-17)
    // 요청에서 만든 프로젝트: 문서에 사진이 없으면 요청 사진을 가져온다 (요청판, 2026-10-17)
    this.client.whenOnline(() => { if (this.role === 'owner' && this.access.status === 'ok' && this.access.requestId) this.importRequestPhotos(this.access.requestId); });
    // 소유자가 열었는데 문서에 단가표가 없으면 계정 기본값(없으면 예시값)을 복사해 모두가 같은 단가를 보게 한다
    this.client.whenOnline(() => {
      // 새 프로젝트는 견적 줄 금액을 직접 입력 (2026-10-16 "사인물 견적서는 수동으로 입력되어야한다")
      if (this.role === 'owner' && !this.project.settings().prices) this.project.updateSettings({ prices: mergePrices(this.accountPrices), quoteMode: 'manual' });
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
      if (!shouldNotify(m, { me: this.nickname, viewingObjectId: this.view === 'board' && !this.proposalMode ? this.selectedId : null, hidden: document.hidden })) continue;
      const pin = this.project.pin(m.objectId);
      if (pin && !pinVisibleTo(pin, this.nickname, this.role)) continue; // 남에게 보낸 말풍선의 대화는 알리지 않는다 (2026-10-17)
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

  /** 한 사진의 사인물을 **왼쪽부터** 순서대로 (휴대폰 빠른 막대의 이전/다음, 머리글 탭 → 첫 사인물). Y.Map 순서는 안정적이지 않으므로 위치로 정렬 */
  photoSigns(photoId: string): SignObject[] {
    const left = (o: SignObject) => (o.quad.length ? Math.min(...o.quad.map((p) => p[0])) : o.listX ?? 0);
    const top = (o: SignObject) => (o.quad.length ? Math.min(...o.quad.map((p) => p[1])) : o.listY ?? 0);
    return this.objects.filter((o) => o.photoId === photoId).sort((a, b) => left(a) - left(b) || top(a) - top(b));
  }

  /**
   * 리스트의 사인물을 사진 보드에 올린다 (2026-10-15 사용자: "사인물 리스트의 사인물을 사진 보드에 올릴 수 있나?"):
   * 그 사진 가운데에 같은 사인물(sameAs 연결)로 새 영역을 만들고 선택한 뒤 보드로 간다. 비율은 치수(또는 원본 영역)에서, 폭은 사진의 40%
   */
  placeOnPhoto(signId: string, photoId: string): string | null {
    if (!this.canEdit) return null;
    const master = this.objects.find((o) => o.id === signId);
    const photo = this.photos.find((p) => p.id === photoId);
    if (!master || !photo) return null;
    const root = master.sameAs ?? master.id;
    const sz = this.sizeOf(master);
    const bb = (q: Pt[]) => ({ w: Math.max(...q.map((p) => p[0])) - Math.min(...q.map((p) => p[0])), h: Math.max(...q.map((p) => p[1])) - Math.min(...q.map((p) => p[1])) });
    const ratio = sz ? sz.h / sz.w : (() => { if (master.quad.length < 4) return 0.3; const b = bb(master.quad); return b.w > 0 ? b.h / b.w : 0.3; })();
    const w = photo.w * 0.4, h = Math.min(photo.h * 0.8, w * ratio);
    const x0 = (photo.w - w) / 2, y0 = (photo.h - h) / 2;
    const quad: Pt[] = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
    this.editBoundary();
    const id = this.project.addObject({ photoId, name: master.name, shape: 'rect', quad, sheetIds: [] });
    this.project.linkObject(id, root);
    this.editBoundary();
    this.view = 'board';
    this.selectObject(id);
    this.reveal = { photoId, n: (this.reveal?.n ?? 0) + 1 };
    return id;
  }

  /** 보드 빈 곳에 사인물 만들기 (사진 없이): 끌어 그린 크기가 치수가 되고 바로 생성된다. 위치는 평면 배치(listX/listY mm) */
  createStandalone(listX: number, listY: number, size: { widthMm: number; heightMm: number }): string | null {
    if (!this.canEdit) return null;
    const n = this.signs.length + 1;
    this.editBoundary();
    const id = this.project.addObject({ photoId: '', name: `사인물 ${n}`, shape: 'rect', quad: [], sheetIds: [], listX: Math.round(listX), listY: Math.round(listY), ...size });
    this.editBoundary();
    this.selectObject(id);
    this.tool = 'select';
    return id;
  }
  /** 사진 없는 사인물(보드 직접 생성) */
  standalone = $derived(this.objects.filter((o) => !o.photoId));
  /** 평면도(전개도) 카드: 치수(입력 또는 추정)가 있는 원본 사인물 — 리스트 뷰와 보드 평면 구역이 같은 목록·같은 배치를 쓴다 */
  flatCards = $derived.by(() => this.signs.flatMap((o) => { const s = this.sizeOf(o); return s ? [{ o, ...s }] : []; }));
  /** 보드 평면 구역 축척 (px/mm) — 프로젝트 설정, 모두에게 같음 */
  flatScale = $derived(clampFlatScale(this.settings.flatScale));
  /** 보드 평면 구역 이동 (보드 px) — 프로젝트 설정 */
  flatOffset = $derived(this.settings.flatOffset && Number.isFinite(this.settings.flatOffset.x) && Number.isFinite(this.settings.flatOffset.y) ? this.settings.flatOffset : { x: 0, y: 0 });
  flatPlaced = $derived(layoutList(this.flatCards.map(({ o, w, h }) => ({ id: o.id, w, h, x: o.listX, y: o.listY }))));

  // ---------- 복사·붙여넣기·복제 (2026-10-15 사용자: "카피 페이스트 복제등이 필요하다") ----------
  /** 사인물 클립보드 (이 탭 안에서 유지 — 다른 프로젝트로 옮겨 붙일 수 있다) */
  clipboard = $state<ClipSign | null>(null);
  /** 매니퓰레이터 모드 (W 이동 · E 회전 · R 크기, 2026-10-15 사용자: "qwer 선택,이동,회전,크기") */
  gizmoMode = $state<'move' | 'rotate' | 'scale'>('move');
  /** 같은 클립을 몇 번 붙였는지 (붙일 때마다 조금씩 비켜 놓는다) */
  private pasteCount = 0;
  private clipOfSelected(): ClipSign | null {
    const o = this.selected;
    if (!o) return null;
    const ph = this.photos.find((p) => p.id === o.photoId);
    return clipOf(o, o.sameAs ? this.project.object(o.sameAs) : undefined, ph ? { id: ph.id, w: ph.w, h: ph.h } : { id: '', w: 1, h: 1 });
  }
  copySelected(): boolean {
    const c = this.clipOfSelected();
    if (!c) return false;
    this.clipboard = c; this.pasteCount = 0;
    return true;
  }
  /** 붙일 사진: 선택한 사인물의 사진 > 복사한 사진 > 첫 사진. 사진 없는 사인물(평면도)은 사진 없이 */
  private pasteClip(c: ClipSign, n: number): string | null {
    if (!this.canEdit) return null;
    const sel = this.selected && this.photos.find((p) => p.id === this.selected!.photoId);
    const ph = c.fields.quad.length ? (sel ?? this.photos.find((p) => p.id === c.photo.id) ?? this.photos[0]) : null;
    if (c.fields.quad.length && !ph) return null;
    const ids = new Set(this.sources.map((s) => s.id));
    this.editBoundary();
    const id = this.project.addObject(pastedObject(c, ph ? { id: ph.id, w: ph.w, h: ph.h } : { ...c.photo, id: '' }, n, (s) => ids.has(s)));
    this.editBoundary();
    this.selectObject(id);
    this.tool = 'select';
    return id;
  }
  pasteClipboard(): string | null {
    if (!this.clipboard) return null;
    return this.pasteClip(this.clipboard, ++this.pasteCount);
  }
  /** 제자리 복제 (Alt/Option + 끌기, 2026-10-17 "alt/option 누르고 이동하면 복사"): 같은 자리에 복사본을 만들어 고르고, 이어지는 끌기가 복사본을 옮긴다 */
  duplicateInPlace(): string | null {
    const c = this.clipOfSelected();
    return c ? this.pasteClip(c, 0) : null;
  }
  /** 복제: 클립보드는 그대로 두고 바로 옆에 하나 */
  duplicateSelected(): string | null {
    const c = this.clipOfSelected();
    return c ? this.pasteClip(c, 1) : null;
  }

  /** 컬러 카드 추가 → 기기 사본 + 계정(로그인 시) */
  async addColorCard(card: ColorCard) { this.colorLibrary = [...this.colorLibrary.filter((c) => c.id !== card.id), card]; await this.persistColors(); }
  async removeColorCard(id: string) { this.colorLibrary = this.colorLibrary.filter((c) => c.id !== id); await this.persistColors(); }
  private async persistColors() {
    saveLocalColors(this.colorLibrary);
    if (!this.account) return;
    try { await saveColors({ version: 1, colors: this.colorLibrary }); } catch { /* 오프라인·서버 오류: 기기 사본은 남는다 */ }
  }

  /** Shift+클릭: 선택에 더하기/빼기. 마지막으로 누른 것이 주 선택(selectedId) */
  toggleSelect(id: string, kind: 'shape' | 'card' = 'shape') {
    if (!this.selectedId || kind !== this.selectionKind) { this.selectObject(id, kind); return; }
    const all = new Set(this.selectionIds);
    if (all.has(id) && id !== this.selectedId) { all.delete(id); this.multi = [...all].filter((x) => x !== this.selectedId); return; }
    if (id === this.selectedId) { // 주 선택을 빼면 남은 것 중 마지막이 주 선택
      all.delete(id); const rest = [...all]; this.multi = rest.slice(0, -1); this.selectedId = rest.at(-1) ?? null; return;
    }
    all.add(this.selectedId); all.delete(id);
    this.multi = [...all]; this.objectSettingsOpen = false; this.panelOpen = false; this.selectedId = id;
  }
  /** 평면도 카드 선택(card)의 다중 선택 id — 외곽선 선택일 때는 빈 배열 (카드와 외곽선은 따로 하이라이트) */
  cardMulti = $derived(this.selectionKind === 'card' ? this.multi : []);
  shapeMulti = $derived(this.selectionKind === 'shape' ? this.multi : []);
  /** 평면도 카드 끌기 시작: 끄는 카드가 선택에 들어 있으면 선택 전체를, 아니면 그 카드만 (2026-10-17 "정면도들을 다중선택하고 이동하게"). 시작 mm 위치를 돌려준다 */
  cardDragIds(id: string): string[] {
    return this.selectionKind === 'card' && this.selectionIds.includes(id) ? [...this.selectionIds] : [id];
  }
  /** 선택한 사인물 모두 삭제 */
  deleteSelection() {
    if (!this.canEdit || !this.selectionIds.length) return;
    this.editBoundary();
    for (const id of this.selectionIds) this.project.removeObject(id);
    this.editBoundary();
    this.multi = []; this.selectedId = null;
  }
  /** 선택한 사인물 모두 복제 (각각 바로 옆에) → 복제본들이 선택 */
  duplicateSelection() {
    if (!this.canEdit || !this.selectionIds.length) return;
    const ids = [...this.selectionIds];
    const made: string[] = [];
    for (const id of ids) { this.selectedId = id; this.multi = []; const nid = this.duplicateSelected(); if (nid) made.push(nid); }
    this.multi = made.slice(0, -1); this.selectedId = made.at(-1) ?? null;
  }
  /** 마지막 선택(주 선택)의 구성(종류·옵션·구성 요소·시트·두께·입체 설정·문구)을 나머지 선택에 맞춘다. 이름·치수·위치·디자인·메모는 그대로 */
  applySelectedSpecToOthers() {
    const src = this.selected;
    if (!this.canEdit || !src || !this.multi.length) return;
    const spec = JSON.parse(JSON.stringify({ productId: src.productId, sheetIds: src.sheetIds, options: src.options, parts: src.parts, depthMm: src.depthMm, letter3d: src.letter3d, text: src.text, charCount: src.charCount, corner: src.corner })) as Partial<SignObject>;
    this.editBoundary();
    for (const id of this.multi) if (id !== src.id) this.project.updateObject(id, spec);
    this.editBoundary();
  }
  /** 마지막 선택의 치수(가로·세로·두께)를 나머지 선택에 (2026-10-17 사용자: "다중선택에 추가 메뉴 마지막 선택 크기적용"). 사진 위 영역(quad)은 그대로 — 실제 치수만 */
  applySelectedSizeToOthers() {
    const src = this.selected;
    if (!this.canEdit || !src || !this.multi.length) return;
    const size: Partial<SignObject> = { widthMm: src.widthMm, heightMm: src.heightMm, depthMm: src.depthMm };
    this.editBoundary();
    for (const id of this.multi) if (id !== src.id) this.project.updateObject(id, size);
    this.editBoundary();
  }

  selectObject(id: string | null, kind: 'shape' | 'card' = 'shape') {
    if (id !== this.selectedId) { this.objectSettingsOpen = false; this.panelOpen = false; }
    this.multi = [];
    this.selectionKind = kind;
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
  async sendMessage(objectId: string, text: string, kind: 'chat' | 'comment', attachments: Attachment[] = []) {
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

  setWarnMeasure(v: boolean) { this.warnMeasure = v; save('ganpanda.warnMeasure', v ? '1' : '0'); }

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
/** 처음 여는 사진의 기본 배치: 가로 선 두 개(위·아래), 세로 선 두 개(좌·우), 원점 좌하단, 기준 길이 아래 가로 */
export function defaultCameraSetup(w: number, h: number): CameraSetup {
  return {
    x: [{ a: [w * 0.2, h * 0.3], b: [w * 0.8, h * 0.3] }, { a: [w * 0.2, h * 0.7], b: [w * 0.8, h * 0.7] }],
    y: [{ a: [w * 0.25, h * 0.2], b: [w * 0.25, h * 0.8] }, { a: [w * 0.75, h * 0.2], b: [w * 0.75, h * 0.8] }],
    origin: [w * 0.25, h * 0.7],
    ref: { axis: 'x', point: [w * 0.45, h * 0.7], mm: 1000 },
    principal: 'center',
  };
}

if (import.meta.env.DEV) (window as unknown as { __ganpanda: AppState }).__ganpanda = app;
if (typeof matchMedia === 'function') { const mq = matchMedia('(max-width: 720px)'); mq.addEventListener('change', (e) => { app.compact = e.matches; }); }
// 새 배포 감지: 시작 직후·탭이 다시 보일 때·뒤로가기 복원(pageshow) 때 서버 index.html 의 번들과 비교 (최대 10초에 한 번).
// 아이폰 크롬처럼 탭을 메모리에서 되살리는 브라우저가 옛 코드를 계속 쓰던 문제(2026-10-15) → 돌아온 순간이면 바로 새로고침, 아니면 배너
if (typeof document !== 'undefined' && !import.meta.env.DEV) {
  let last = 0;
  const busy = () => {
    const t = document.activeElement as HTMLElement | null;
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    return typing || !!document.querySelector('[role="dialog"]');
  };
  const check = async (returned: boolean) => {
    if (document.visibilityState !== 'visible' || Date.now() - last < 10_000) return;
    last = Date.now();
    if (!(await newVersionAvailable(document, () => fetch('/', { cache: 'no-store' }).then((r) => r.text())))) return;
    if (shouldAutoReload({ returned, busy: busy(), home: !app.room })) location.reload();
    else app.updateAvailable = true;
  };
  document.addEventListener('visibilitychange', () => check(true));
  window.addEventListener('pageshow', (e) => check(e.persisted));
  window.addEventListener('focus', () => check(false));
  setTimeout(() => check(false), 3_000);
}
