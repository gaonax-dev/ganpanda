// 앱 전역 상태: Yjs 프로젝트 문서 + Svelte 반응성 연결, 계정·방 접근·동기화
import { participantsOf, pinVisibleTo } from './core/pins';
import { loadLocalColors, saveLocalColors, validColorLibrary, type ColorCard } from './core/colorLibrary';
import { loadLocalDefaults, loadLocalRules, saveLocalDefaults, saveLocalRules, validRule, type SpecDefault, type SpecRule } from './core/specRules';
import { loadLocalSets, saveLocalSets, validSetLibrary, type SignSet } from './core/setLibrary';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Project } from './core/project';
import { measurePhoto, type MeasureResult } from './core/measure';
import { newVersionAvailable, shouldAutoReload, bundleOf, reloadPlan, bustedUrl } from './core/version';
import { layoutList } from './core/layout';
import { arrangeByAxisGrid, homeOf, type GridCard } from './core/arrange';
import type { Message, Attachment, ExtraItem, ProjectSettings, SignObject, TalkRef } from './core/model';
import { addRef, canSeeTalkMessage, roomIdOf, roomKey, talkUnread, visibleRooms } from './core/talk';
import { mergePrices, type PriceTable } from './core/pricing';
import { pushHistory, type DesignRef } from './core/design';
import { insertVertex, removeVertex, zoneIndexAt, zonesOf } from './core/zone';
import { rasterizePolygon, zoneBounds } from './core/zoneMask';
import type { Calibration } from './core/calibration';
import { autoCameraFrom, axesAfterProposal, axesForProposal, calibrationOf, wantedAxes, cameraLevel, proposeAxisLines, signCameraFit, snapSetup, solveCamera, type CameraSetup, type CameraSolution } from './core/camera';
import { convertFile, ConvertError } from './design/convert';
import { assetUrl, imageSize, putAsset, StorageLimitError } from './assets';
import { materializeRequestSigns } from './core/requestSigns';
import { estimateProject } from './projects';
import { adjustPlan, replacePlan, shiftBy, sourceOf, type Crop } from './core/photoEdit';
import { prepareUpload } from './photoPrep';
import { autoFlatScale, clampFlatScale, placeholderSize } from './core/boardCards';
import { fetchRequestPhoto, getRequestPhotoCount, listMyRequests, listRequests } from './requests';
import { formatBytes } from './core/format';
import { describeBillingError, issueBilling, takeBillingReturn, type BillingReturn } from './billing';
import type { Business } from './core/business';
import { quoteProject } from './core/quote';
import { resolveLinks } from './core/link';
import { signHash, approvalState, contentHash, fnv1a, snapshotOf } from './core/proposal';
import { faceOf, faceSizeOf, quadOnWall, wallPlaneOf } from './core/wallPlane';
import { describeAttachments } from './core/attachments';
import { DEFAULT_KEYMAP, mergeKeymap, type Keymap } from './core/keymap';
/** 설정 창 탭 (Settings.svelte) */
export type SettingsTab = 'account' | 'team' | 'rules' | 'requests' | 'display' | 'keys';
import { isMacPlatform } from './core/wheel';
import { SERVER_URL, SyncClient, type SyncStatus } from './sync';
import { flushPendingUploads, onAssetsRecovered, onStorageLimit, retryMissingAssets, setAssetScope } from './assets';
import type { Cursor, Peer } from './core/presence';
import { AuthError, PLAN_LABEL, convertToShop, deleteAccount, describeAuthError, fetchMe, loadSession, logout as apiLogout, logoutOthers as apiLogoutOthers, saveSession, sendPresence, updateName, verifyLink, type Account, type Usage, saveColors, saveSets } from './auth';
import { checkAccess, postApproval, deleteMessage, deleteSpecRule, getSpecDefaults, getSpecRules, postMessage, putSpecRule, postPin, talkSync, type Role } from './projects';
import { countByObject, markSeen, shouldNotify, unreadByObject, type SeenMap } from './core/unread';
import { voiceCounts } from './core/voices';
import { createHistory } from './core/history';
import { clipOf, pastedObject, type ClipSign } from './core/clipboard';
import { categoryOf, defaultProductFor, productById, signParts, type Group } from './core/catalog';
import { categoryPatch, materialPatch } from './core/parts';
import { Segmenter, type SegmentStatus } from './segment/segmenter';
import { boundsOf } from './core/mask';
import type { Pt } from './core/homography';


export interface Toast { id: string; objectId: string; author: string; text: string }

export type ViewKind = 'board' | 'list' | 'uv';
export type Tool = 'select' | 'rect' | 'ellipse' | 'pin' | 'magic' | 'zone';
/** 방 접근 상태: 확인 중 / 허용 / 거부(이유) */
export type Access =
  | { status: 'loading' }
  | { status: 'ok'; role: Role; projectName: string; /** 정산 보기: 오너 또는 "정산 보기"를 켠 팀 멤버 */ billing?: boolean; /** 소유자가 무료 요금제 → 제안 페이지에 간판다 표시 */ branding?: boolean; /** 소유자의 확인된 사업자 (제안 페이지 배지, 2026-10-21) */ business?: { name: string; status: string }; /** 요청에서 만든 프로젝트 (요청판) */ requestId?: string; /** 외주 프로젝트 (2026-10-22) — 핫핑크, [외주 요청] */ outsource?: boolean; /** 가게 사장이 다른 간판집을 확정 (2026-10-22) */ lost?: boolean }
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
  /** 설정 창: true 또는 처음 보일 탭 이름 (2026-10-21 탭 분리) */
  settingsOpen = $state<boolean | SettingsTab>(false);
  inviteOpen = $state(false);
  readonly isMac = isMacPlatform();
  /** 휴대폰 폭(≤ 720px): 라벨을 축약하고 패널·창을 전체 폭으로 (2026-10-14 사용자: "텍스트도 자리가 넘치거나 모자란데 단축어로") */
  compact = $state(typeof matchMedia === 'function' && matchMedia('(max-width: 720px)').matches);
  /** 현재 방(프로젝트). null = 홈 화면 */
  /** 방 id. 소비자 초안은 로그인 뒤 서버에서 받아 넣는다(2026-10-22) — 그래서 반응형 */
  room = $state<string | null>(null);
  /** 로그인 없는 페이지 (요청판, 2026-10-17): /request = 요청 올리기, /r/<id> = 고객의 내 요청 페이지 */
  readonly page: 'request' | 'request-view' | null;
  /** 요청 받기 설정 (/api/me) */
  requestSettings = $state<{ receive: boolean; regions: string[] } | null>(null);
  /** 확인된 사업자 (2026-10-21, 설정 "계정" 탭) */
  business = $state<Business | null>(null);
  /** 요청판 화면 켜기 (2026-10-17 사용자: "우선 안보이게 해줘 현재는 간판 실측툴로서 기본기를 단단히 하겠다"). 서버·API 는 그대로, 화면만 숨김.
      켜려면 빌드에 VITE_REQUESTS=1 또는 기기에 localStorage 'ganpanda.requests' = '1' (E2E·내부 확인용) */
  /** 요청판 (2026-10-17 숨김 → 2026-10-21 "켜는 걸로 진행": 기본 켬. 빌드 VITE_REQUESTS=0 으로만 끈다) */
  readonly requestsEnabled = import.meta.env.VITE_REQUESTS !== '0';
  /** 소비자 견적 요청 모드 (/estimate, 2026-10-21): 로그인 없이 기기에만 두는 보드 — 사진·사각/타원·치수·메모 → [견적 요청] */
  readonly consumer = typeof location !== 'undefined' && location.pathname === '/estimate';
  /** 다른 페이지 안에 넣어 보여 주는 보드 (?embed=1, 2026-10-22 요청 페이지의 "요청한 그대로") — 상단 바 없음 */
  /** 간판집이 받은 요청을 열 때 (?request=<id>, 2026-10-22) — 요청 프로젝트 위에 [견적 넣기] */
  /** 받은 견적 요청 페이지 (/requests, 2026-10-22 "견적요청표시가 메인에 있는데 헤더에 표시해도 될거 같아 그리고 페이지 이동해서 리스트 보이게") */
  /** /estimate 에 간판집 계정으로 들어옴 (2026-10-22) */
  consumerBlocked = $state(false);
  /** 가게 사장 계정 (2026-10-22): 프로젝트 대신 견적 요청만 */
  get consumerAccount(): boolean { return this.account?.kind === 'consumer'; }
  /** 사진 보드만 (보기 초대 고객). 실측 보기(간판집이 연 요청 보드)는 리스트도 본다 — 사인물 목록으로 견적 (2026-10-22 "모바일에서는 문제가 있는데 사인물 리스트를 사용하면 안되나?") */
  get boardOnly(): boolean { return this.isCustomer && !this.requestView; }
  /** 금액을 안 보이는 화면: 실측 보기 (가게 사장 보드에는 단가표가 없다) */
  get noPrices(): boolean { return !!this.requestView; }
  readonly inbox = typeof location !== 'undefined' && location.pathname === '/requests';
  /** 헤더의 "견적 요청 N": 답 안 한 열린 요청 수, 보일지 */
  requestCount = $state(0);
  requestInboxShown = $state(false);
  /** 헤더의 "보낸 요청 M" (2026-10-22 "사업자도 요청을 올릴수 있다. 해당 내역도 헤더에 표시"): 열린 내 요청 수, 보낸 요청이 있으면 보인다 */
  sentCount = $state(0);
  sentShown = $state(false);
  /** 외주 프로젝트를 연 소유자 (2026-10-22): 핫핑크 + [외주 요청] */
  get outsourceProject(): boolean { return this.access.status === 'ok' && !!this.access.outsource && this.role === 'owner'; }
  /** 외주 색: 외주 프로젝트, 또는 그 요청 보드(?o=1) */
  readonly outsourceParam = typeof location !== 'undefined' && new URLSearchParams(location.search).get('o') === '1';
  readonly requestView = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('request') : null;
  readonly embed = typeof location !== 'undefined' && new URLSearchParams(location.search).get('embed') === '1';
  /** 가게 사장 화면은 청록 (2026-10-22 "소비자용 페이지와 사업자용 컬러를 차이주고 싶은데 … 기존 노란색 말고 다른색으로"): /estimate, 요청 페이지, 그 안의 보드(?c=1) */
  readonly consumerTheme = typeof location !== 'undefined' && (location.pathname === '/estimate' || /^\/r\//.test(location.pathname) || new URLSearchParams(location.search).get('c') === '1');
  estimateOpen = $state(false);
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
  /** 사양 글 개인 사전 (2026-10-18 V1): 계정에 저장(서버) + 기기 사본. 퀵입력 파서가 기본 사전보다 먼저 본다 → core/specRules.ts */
  specRules = $state<SpecRule[]>(loadLocalRules());
  /** 전국 기본값 (V2 대세): 내 사전 다음, 기본 사전 앞 */
  specDefaults = $state<SpecDefault[]>(loadLocalDefaults());
  /** 세트 라이브러리 (2026-10-19 4단계): 레이어 묶음을 계정에 저장(서버) + 기기 사본 → core/setLibrary.ts */
  setLibrary = $state<SignSet[]>(loadLocalSets());
  pricesOpen = $state(false);
  letter3dOpen = $state(false);
  /** 선택한 사인물의 세부 설정 창 */
  objectSettingsOpen = $state(false);
  /** 설정 창을 칩에서 열었을 때 바로 펼칠 요소 (빠른 설정, 2026-10-17) */
  objectSettingsFocus = $state<string | null>(null); // 'body' | 'part:<id>' | 'layout' | 'note' | 'price'
  /** 휴대폰 폭: 전체 속성 패널을 열었는가 (기본은 빠른 막대만 — 패널이 사진을 가리지 않게). 데스크톱에서는 항상 열림 */
  panelOpen = $state(false);
  /** 사인물 말풍선 창이 열린 사인물 id (2026-10-18 "속성 패널에서 대화 섹션 빼줘" — 대화는 말풍선 창에서) */
  chatObjectId = $state<string | null>(null);
  /** 사인물 말풍선 창 열기: 그 사인물을 선택하고 대화 창을 연다 */
  openChat(id: string) { if (id !== this.selectedId) this.selectObject(id); this.chatObjectId = id; }
  closeChat() { this.chatObjectId = null; }
  /** 실사 보기 창 (사진 id) */
  renderPhotoId = $state<string | null>(null);
  /** 마지막으로 저장한 실사 PNG (데이터 URL, 테스트·재첨부용) */
  /** 보드 단계: 원본(실측·편집) / 3D(모든 사진 위에 합성 결과를 겹침, 편집 없음). 2026-10-15 사용자: "3D 는 화면에 바로 올리고" */
  /** 보드 단계 (2026-10-17 사용자: "원본 2d 3d 이렇게 해줘. 2d가 현재 보여주는 형식이고 원본은 실측만 나오게"): original = 외곽선·치수만, 2d = 바탕색·디자인·글자 겹침(기본), 3d = 합성 */
  stage = $state<'original' | '2d' | '3d'>('original');
  /**
   * 작업 탭 (2026-10-22 사용자: "상단탭 실측,2d,3d,디자인,사인물리스트 / 디자인은 디자이너와 소통하는 곳으로 사진보드 그대로인데 사인물 디자인파일 연결하는 곳이다.
   * 여기에 디자이너가 일러스트 파일도 올린다. 기존의 컨펌은 제거한다"): 실측(stage original) · 2D · 3D · 디자인(사진보드 2D + 디자인 파일 올리기·연결) · 사인물리스트.
   * (같은 날 앞선 [사진보드 · 디자인(2D·3D·파일) · 사인물리스트 · 컨펌]은 대체됨)
   */
  designMode = $state(false);
  /** 휴대폰: 끌어서(드래그) 고른 사인물 — 속성창(빠른 막대)을 띄우지 않는다. 다시 탭하면 풀린다 (2026-10-22 "터치시 속성창 나온다. 터치드레그에는 속성창 나오지 않는다") */
  dragHideId = $state<string | null>(null);
  /** 휴대폰: 사인물을 누르고 있는 동안 — 속성창은 뗄 때(탭) 나온다, 벌컥 떴다 사라지지 않게 (2026-10-22 "터치 업에 속성창나오게 현재 벌컥거린다") */
  pressing = $state(false);
  get tab(): 'measure' | '2d' | '3d' | 'design' | 'list' {
    if (this.view === 'list') return 'list';
    if (this.view === 'uv' || this.designMode) return 'design';
    return this.stage === 'original' ? 'measure' : this.stage;
  }
  setTab(t: 'measure' | '2d' | '3d' | 'design' | 'list') {
    this.proposalMode = false;
    this.designMode = t === 'design';
    if (t === 'list') { this.view = 'list'; return; }
    this.view = 'board';
    this.stage = t === 'measure' ? 'original' : t === 'design' ? '2d' : t;
  }
  /** ?safe=1 — 휴대폰 크래시 원인 가르기용 (2026-10-18): 2D 겹침·카드 얼굴을 그리지 않는다 */
  safeMode = $state(false);
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
  /** 매니퓰레이터 기본 크기 (화면 px, 기기에 저장, 2026-10-15 사용자: "기본 매니퓰레이터 크기 조절 가능하게") */
  gizmoSize = $state(Math.min(96, Math.max(32, Number(load('ganpanda.gizmoSize')) || 48)));
  setGizmoSize(v: number) { this.gizmoSize = Math.min(96, Math.max(32, Math.round(v))); save('ganpanda.gizmoSize', String(this.gizmoSize)); }
  /** 제안 페이지 모드 (고객용 화면). ?proposal=1 로 열거나 제작자가 미리보기 */
  proposalMode = $state(false);
  /** 동시접속 한도에 막혀 연결 대기 중 */
  /** 버전 기록 창 (2026-10-21 백업 3단계) */
  versionsOpen = $state(false);
  private openedAt = Date.now();
  private restoreSeen = 0;
  /** 누가 버전으로 되돌렸으면(설정 restored 가 이 화면을 연 뒤에 바뀜) 함께 보는 모두에게 안내 */
  private detectRestore() {
    const r = this.project.settings().restored;
    if (!r || r.at <= this.openedAt || r.at === this.restoreSeen) return;
    this.restoreSeen = r.at;
    this.notice = `${r.by}님이 이전 버전으로 되돌렸습니다 (${new Date(r.at).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}).`;
  }
  /** 같은 아이디를 지금 다른 기기에서도 쓰는 중 (2026-10-21 "동시에 같은 아이디로 작동시 로그아웃 선택하도록 동시에 사용하지 않으면 로그인 유지") */
  sessionConflict = $state(false);
  /** 화면 상단 알림 (용량 초과 등) */
  notice = $state('');
  /** 새 배포가 있음 (오래 열어 둔 탭) → 새로고침 안내 */
  updateAvailable = $state(false);
  /** 보드가 이 사진을 화면에 맞추라는 요청 (리스트에서 사진에 올린 뒤) */
  reveal = $state<{ photoId: string; n: number; /** 톡 링크: 이 사인물·번호에 맞춘다 */ objectId?: string; pinId?: string } | null>(null);
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
  /** 가로·세로를 아직 넣지 않은 사인물 수 (원본만 — 연결 영역은 같은 사인물). [실측] 단추에 표시 (2026-10-21 "실측타이틀에 미실측 수량") */
  unmeasuredCount = $derived(this.signs.filter((o) => !(o.widthMm && o.heightMm)).length);
  selected = $derived.by(() => (this.selectedId ? this.objects.find((o) => o.id === this.selectedId) ?? null : null));
  /** 다중 선택 (2026-10-17 사용자: "다중선택 시 작동 버튼 나오게 삭제, 복사, 마지막 선택 구성으로 맞추기"): Shift+클릭으로 더한 사인물들. selectedId 가 마지막 선택 */
  multi = $state<string[]>([]);
  /** 선택이 무엇으로 이루어졌나: 사진 위 외곽선(shape) / 평면도 카드(card). 섞이지 않는다 — 다른 쪽을 Shift+클릭하면 선택을 풀고 새로 시작 (2026-10-17 사용자: "정면도와 사인물 외곽라인은 같이 선택할 수 없다. 다른게 선택되면 선택 풀어줘") */
  selectionKind = $state<'shape' | 'card'>('shape');
  /** 선택 전체 (마지막 선택이 맨 뒤) */
  /** 휴대폰 다중 선택 모드 (2026-10-19 사용자: "모바일에 다중선택 버튼 복사 앞에 … 다중 선택켜지면 말풍선 녹음 사라지게"): 켜져 있으면 탭이 Shift+클릭처럼 선택에 더하기/빼기 */
  multiMode = $state(false);
  selectionIds = $derived([...this.multi.filter((id) => id !== this.selectedId), ...(this.selectedId ? [this.selectedId] : [])]);
  /** 선택한 사인물과 같은 사인물인 다른 영역들(원본·연결) — 다른 사진에서도 하이라이트 */
  sameAsSelected = $derived.by(() => {
    const s = this.selected;
    if (!s) return [] as string[];
    const root = s.sameAs ?? s.id;
    return this.objects.filter((o) => o.id !== s.id && (o.id === root || o.sameAs === root)).map((o) => o.id);
  });
  /**
   * 사진 위 강조할 사인물 (2026-10-22 사용자: "사인물카드 선택시 사진의 사인물 하일라이팅이 다르다. 모두 진하게" → "다중선택도 문제가 있다"):
   * 고른 사인물 모두(카드·외곽선, 주·다중) + 각자의 연결 영역(같은 사인물) — 모두 같은 진한 강조. 외곽선 주 선택은 손잡이가 붙는 sel 이라 뺀다
   */
  photoHighlightIds = $derived.by(() => {
    const picked = new Set(this.selectionIds);
    const roots = new Set(this.objects.filter((o) => picked.has(o.id)).map((o) => o.sameAs ?? o.id));
    const out = this.objects.filter((o) => roots.has(o.sameAs ?? o.id)).map((o) => o.id);
    return this.selectionKind === 'shape' ? out.filter((id) => id !== this.selectedId) : out;
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
      // 자동 원근 사진은 정확도를 경고하지 않는다 (2026-10-19 사용자: "정확도를 경고하지 마라")
      const quiet = !!p.camera?.auto;
      for (const [id, r] of measurePhoto(this.objects.filter((o) => o.photoId === p.id), p.w, p.h, calib, cal ? (o) => faceSizeOf(o, cal) : undefined)) out.set(id, quiet ? { ...r, warnings: [] } : r);
    }
    return out;
  });
  /** 화면 기준 휘발성 안내 (2026-10-20 사용자: "원근 완성될때 대부분 외곽에 표시된 완성을 확인하지 못한다. 화면 기준으로 휘발성 안내 보낼 수 있나?") */
  flash = $state<{ text: string; seq: number } | null>(null);
  private flashTimer: ReturnType<typeof setTimeout> | undefined;
  showFlash(text: string, ms = 3200) {
    clearTimeout(this.flashTimer);
    const seq = (this.flash?.seq ?? 0) + 1;
    this.flash = { text, seq };
    this.flashTimer = setTimeout(() => { if (this.flash?.seq === seq) this.flash = null; }, ms);
  }
  /** 원근을 바꾸는 내 편집: 그 결과 완성도가 3(완성)이 되면 화면 안내 */
  private updateCamera(photoId: string, patch: { camera?: CameraSetup; autoCamera?: false }) {
    const before = this.cameraLevels.get(photoId)?.level ?? 0;
    this.editBoundary();
    this.project.updatePhoto(photoId, patch);
    this.editBoundary();
    const after = this.cameraLevels.get(photoId)?.level ?? 0;
    if (before < 3 && after === 3) this.showFlash(`✨ 원근 완성 · ${this.photos.find((p) => p.id === photoId)?.name ?? ''}`);
  }
  /** 사진별 원근 완성도 (축 → 길이 → 확인, core/camera.ts cameraLevel — 2026-10-19 "완성도 표시만해줘") */
  cameraLevels = $derived.by(() => {
    const out = new Map<string, ReturnType<typeof cameraLevel>>();
    for (const p of this.photos) {
      const sized = this.objects.flatMap((o) => {
        if (o.photoId !== p.id || o.shape === 'polygon' || o.quad.length !== 4) return [];
        const s = this.sizeOf(o);
        return s && !s.estimated ? [{ quad: o.quad.map((q) => [q[0], q[1]] as [number, number]), w: s.w, h: s.h }] : [];
      });
      out.set(p.id, cameraLevel(p.camera, sized, p.w, p.h));
    }
    return out;
  });
  /** 카메라 설정 창 (사진 id) 과 편집 중인 설정 (적용 전) */
  cameraPhotoId = $state<string | null>(null);
  cameraPhoto = $derived(this.cameraPhotoId ? this.photos.find((p) => p.id === this.cameraPhotoId) ?? null : null);
  cameraDraft = $state<CameraSetup | null>(null);
  cameraBusy = $state(false);
  /** 자동 원근 효과 (2026-10-19 "좀 신비롭게 처리되는 효과"): 사진 등록 때만 — scan(읽는 중) / found(축을 잡음). 길이 반영은 조용히("조용히 그걸 원근 길이로 설정해두고 완성도 표시만") */
  cameraFx = $state<Record<string, { kind: 'scan' | 'found'; seq: number }>>({});
  private fxSeq = 0;
  private fxTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private showCameraFx(photoId: string, fx: { kind: 'scan' | 'found' }, ms = 0) {
    clearTimeout(this.fxTimers.get(photoId));
    this.cameraFx = { ...this.cameraFx, [photoId]: { ...fx, seq: ++this.fxSeq } };
    if (ms) this.fxTimers.set(photoId, setTimeout(() => this.clearCameraFx(photoId), ms));
  }
  private clearCameraFx(photoId: string) {
    clearTimeout(this.fxTimers.get(photoId));
    const { [photoId]: _, ...rest } = this.cameraFx;
    this.cameraFx = rest;
  }
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
  /** 톡 (2026-10-22): 방 목록·열린 방·보낼 링크. 회사 쪽 = 편집 권한(viewer 아님) */
  talks = $derived.by(() => (this.version, this.project.allTalks()));
  get isCompany() { return this.role !== 'viewer'; }
  /** 내 아이디: 계정 id, 로그인 안 한 손님은 기기 아이디 g:… (톡 멤버 연결, 2026-10-22 "닉은 사용하는데 아이디로 연결하라는 거지") */
  get myId(): string { return this.account?.id ?? `g:${guestId()}`; }
  talkRooms = $derived(visibleRooms(this.talks, this.myId, this.isCompany));
  /** 아이디 → 지금 이름 (접속자·보낸 메시지에서) */
  talkNames = $derived.by(() => {
    const out: Record<string, string> = {};
    for (const m of this.messages) if (m.authorId) out[m.authorId] = m.author;
    for (const p of this.peers) if (p.id) out[p.id] = p.name;
    out[this.myId] = this.nickname;
    return out;
  });
  talkOpen = $state(false);
  private startTalk: string | null = null;
  private startFocus: TalkRef | null = null;
  talkRoomId = $state<string | null>(null);
  talkRefs = $state<TalkRef[]>([]);
  /** 링크를 눌러 고른 선택은 다시 링크로 붙이지 않는다 */
  private talkSkipId: string | null = null;
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
  /** 대상별 대화 수 — 말풍선 숫자 (2026-10-22) */
  chatCounts = $derived(countByObject(this.messages));
  /** 사인물(대화 id)별 음성 메모 수 — 카드·상세의 🎙 (2026-10-18) */
  voiceCounts = $derived(voiceCounts(this.messages));
  /** 승인 대상 내용의 해시 (사인물 규격·치수·디자인·금액) */
  contentHash = $derived(contentHash(this.signs, (o) => this.sizeOf(o), this.quote));
  /** 최신 승인과 현재 내용의 관계 */
  approval = $derived(approvalState(this.settings.approvals, this.contentHash));
  /** 사인물·번호 대화의 안 읽은 수 (톡은 따로 → talkUnreadInfo) */
  unreadTotal = $derived(Object.entries(this.unread).reduce((a, [k, n]) => (roomIdOf(k) === null ? a + n : a), 0));
  /** 톡: 보이는 방의 안 읽은 수 (상단 [톡] 단추) */
  talkUnreadInfo = $derived(talkUnread(this.unread, this.talks, this.myId, this.isCompany));
  role = $derived<Role | null>(this.access.status === 'ok' ? this.access.role : null);
  /** 편집 가능 여부 (viewer 는 보기·대화만). 서버 없는 로컬 모드는 항상 편집 가능 */
  canEdit = $derived((this.role === 'owner' || this.role === 'editor') && !this.consumerLocked);
  /** 소비자: 견적을 보낸 뒤에는 보드를 못 고친다 — 요청을 취소하면 다시 (2026-10-22 "견적이 요청되면 수정이 불가능하다. 견적요청 취소 후 재 요청할수있다") */
  get consumerLocked(): boolean { return this.consumer && !!this.settings.estimateRequest; }
  /** 고객(보기 초대): 사진 보드만, 금액 없음 (2026-10-16 "고객에게 보여지는 것은 사진보드만 보인다." 금액은 제안 링크에서) */
  isCustomer = $derived(this.role === 'viewer');
  /** 원가(공급사 금액)·이익 금액은 오너만 (2026-10-16 "원가와 판매가로 이익율이 확인되어야한다. 오너와 맴버(허가시)에게만보이게") */
  seesCost = $derived(!this.consumer && (this.role === 'owner'));
  /** 이익율·손해 표시: 오너, 또는 설정의 팀 멤버 중 "정산 보기"를 켠 사람(편집 초대로 들어옴) */
  seesMargin = $derived(!this.consumer && (this.role === 'owner' || (this.role === 'editor' && this.access.status === 'ok' && !!this.access.billing))); // 소비자 모드(2026-10-21)는 이익을 안 본다

  constructor() {
    onAssetsRecovered(() => { this.assetEpoch++; });
    // 사진은 기기에 먼저 두고 뒤에서 올린다(2026-10-19) — 용량 한도는 올리는 중에 알게 되므로 여기서 알린다
    onStorageLimit((e) => { this.notice = `저장 용량 한도(${formatBytes(e.limitBytes)})를 넘어 파일(${formatBytes(e.sizeBytes)})을 서버에 올리지 못했습니다. 이 기기에서만 보이고 다른 사람에게는 보이지 않습니다. 사용 중 ${formatBytes(e.usedBytes)} — 요금제를 올려 주세요.`; });
    this.project.onChange(() => this.version++);
    this.watchSizes();
    this.history.onChange(() => this.historyVersion++);
    const url = new URL(location.href);
    if (url.pathname === '/request') location.replace(`/estimate${url.search}`); // 옛 요청 폼 → 소비자 보드 (2026-10-21)
    this.page = /^\/r\/[A-Za-z0-9_-]{16}$/.test(url.pathname) ? 'request-view' : null;
    // 서버가 없으면(오프라인 빌드) 로컬 기본 방
    this.room = this.consumer ? null : url.searchParams.get('room') ?? (SERVER_URL ? null : 'local-default'); // 소비자 방은 로그인 뒤 서버에서 (init)
    // 토스 카드 등록에서 돌아옴 (2026-10-23 결제): 결과를 읽고 주소에서 지운다 — 성공은 로그인 확인 뒤 발급·결제(applyMe)
    this.billingReturn = takeBillingReturn();
    if (this.billingReturn?.kind === 'fail') { this.notice = `카드 등록이 되지 않았습니다: ${this.billingReturn.message}`; this.billingReturn = null; }
    const inviteParam = url.searchParams.get('invite');
    this.invite = this.room ? inviteParam ?? load(`ganpanda.invite.${this.room}`) : null;
    this.proposalMode = url.searchParams.get('proposal') === '1';
    this.safeMode = url.searchParams.get('safe') === '1'; // 진단용: 무거운 겹침(2D 바탕·디자인·카드 얼굴)을 끈다 (2026-10-18 휴대폰 크래시 원인 가르기)
    // 메인 화면 톡에서 들어옴 (2026-10-22): ?talk=방&focus=종류:id — 열리면 그 방을 열고 그 대상을 화면에 잡는다
    this.startTalk = url.searchParams.get('talk');
    const f = url.searchParams.get('focus')?.match(/^(object|photo|pin):(.+)$/);
    this.startFocus = f ? { kind: f[1] as TalkRef['kind'], id: f[2], label: '' } : null;
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
    // 소비자 견적 초안 (2026-10-22 "휴대폰에서 작성한 내용을 pc에서 확인을 못하는데"): 로그인했으면 계정의 초안 방을 서버에서 받아 보통 방처럼 동기화
    if (this.consumer && this.account && SERVER_URL) {
      try { this.room = (await estimateProject()).id; }
      catch (e) {
        // 간판집 계정은 가게 사장 견적 요청을 못 쓴다 (2026-10-22 "사업자는 소비자 등록이 안된다") — 외주 요청으로 안내
        if (e instanceof AuthError && e.status === 403) this.consumerBlocked = true;
        else this.notice = '견적 초안을 열지 못했습니다. 잠시 뒤 다시 열어 주세요.';
      }
    }
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
      const { count: n, signs } = await getRequestPhotoCount(requestId);
      let right = 0;
      const photoIds: string[] = [];
      for (let i = 0; i < n; i++) {
        const blob = await fetchRequestPhoto(requestId, i);
        const assetId = await putAsset(blob);
        const { w, h } = await imageSize((await assetUrl(assetId))!);
        const width = 1200;
        photoIds.push(this.project.addPhoto({ name: `요청 사진 ${i + 1}`, assetId, w, h, x: right, y: 0, width }));
        right += width + 120;
      }
      // 소비자가 그린 사인물도 그대로 (2026-10-21): 요청 사진 번호 → 가져온 사진 id
      if (!this.objects.length) for (const o of materializeRequestSigns(signs, photoIds)) this.project.addObject(o);
    } catch (e) {
      this.notice = `요청 사진을 가져오지 못했습니다: ${e instanceof Error ? e.message : e}`;
    } finally { this.importing = false; }
  }

  async refreshMe() {
    this.applyMe(await fetchMe());
  }

  private applyMe(me: Awaited<ReturnType<typeof fetchMe>>) {
    this.applyAccount(me?.account ?? null);
    if (me?.account) { this.startPresence(); void this.beatPresence(); }
    this.usage = me ? { limits: me.limits, usage: me.usage } : null;
    this.accountPrices = me?.prices ?? null;
    const colors = validColorLibrary(me?.colors);
    if (colors) { this.colorLibrary = colors.colors; saveLocalColors(colors.colors); }
    else if (me && this.colorLibrary.length) void this.persistColors(); // 기기에만 있던 라이브러리를 계정에 올린다
    const sets = validSetLibrary(me?.sets) ? me!.sets as { sets: SignSet[] } : null;
    if (sets) { this.setLibrary = sets.sets; saveLocalSets(sets.sets); }
    else if (me && this.setLibrary.length) void this.persistSets();
    this.requestSettings = me?.requestSettings ?? null;
    this.business = me?.business ?? null;
    if (me?.account && this.billingReturn?.kind === 'success') void this.finishBilling(this.billingReturn);
    void this.refreshRequestCount();
    if (me) void this.loadSpecRules();
  }
  /** 토스 카드 등록에서 돌아온 결과 (시작 주소) */
  private billingReturn: BillingReturn | null = null;
  /** 돌아온 카드 등록 → 빌링키 발급 + 새 구독이면 첫 달 결제 → 요금제 */
  private async finishBilling(r: Extract<BillingReturn, { kind: 'success' }>) {
    this.billingReturn = null;
    try {
      const res = await issueBilling(r);
      await this.refreshMe();
      this.notice = res.changed === 'card' ? '결제 카드를 바꿨습니다.' : `${PLAN_LABEL[r.plan] ?? r.plan} 요금제가 시작되었습니다. 결제 내역과 다음 결제일은 설정 "계정 · 구독"에서 볼 수 있습니다.`;
    } catch (e) { this.notice = `결제하지 못했습니다: ${describeBillingError(e)}`; }
  }
  /** 가게 사장 → 간판집 (2026-10-22 "소비자는 사업자로 변경하고 기존 데이터는 사업자로 이관된다"): 견적 보드는 보통 프로젝트로 */
  async becomeShop() { await convertToShop(); await this.refreshMe(); }
  /** 계정 삭제 (2026-10-22 "계정삭제도 필요하다") */
  async deleteMyAccount() { await deleteAccount(); location.href = '/'; }
  /** 헤더 "견적 요청 N" (2026-10-22): 요청 받기를 켰거나 운영자이거나 받은 요청이 있으면 보인다. 2분마다 다시 */
  private requestTimer: ReturnType<typeof setInterval> | undefined;
  async refreshRequestCount() {
    if (!this.account || this.consumer || !this.requestsEnabled || !SERVER_URL) { this.requestInboxShown = false; return; }
    try {
      const [rs, mine] = await Promise.all([listRequests(), listMyRequests().catch(() => [])]);
      this.requestCount = rs.filter((r) => r.status === 'open' && !r.responded).length;
      this.requestInboxShown = rs.length > 0 || !!this.requestSettings?.receive || !!this.account.operator;
      this.sentCount = mine.filter((r) => r.status === 'open').length;
      this.sentShown = mine.length > 0;
    } catch { /* 다음에 */ }
    if (!this.requestTimer) this.requestTimer = setInterval(() => void this.refreshRequestCount(), 120_000);
  }
  private async persistSets() { saveLocalSets(this.setLibrary); if (this.account) { try { await saveSets({ version: 1, sets: this.setLibrary }); } catch { /* 다음에 */ } } }
  async addSet(set: SignSet) { this.setLibrary = [...this.setLibrary.filter((s) => s.id !== set.id), set]; await this.persistSets(); }
  async removeSet(id: string) { this.setLibrary = this.setLibrary.filter((s) => s.id !== id); await this.persistSets(); }
  async loadSpecRules() {
    try { const rules = (await getSpecRules()) as SpecRule[]; this.specRules = rules.filter(validRule); saveLocalRules(this.specRules); } catch { /* 오프라인이면 기기 사본 */ }
    try { const d = (await getSpecDefaults()) as SpecDefault[]; this.specDefaults = d.filter((r) => validRule(r)); saveLocalDefaults(this.specDefaults); } catch { /* 기기 사본 */ }
  }
  /** 못 알아본 말에 답한 뜻을 규칙으로 (같은 말은 갱신). 로그인 전엔 기기에만 */
  async saveSpecRule(rule: SpecRule) {
    if (!validRule(rule)) return;
    this.specRules = [...this.specRules.filter((r) => r.phrase !== rule.phrase), rule];
    saveLocalRules(this.specRules);
    if (this.account) { try { await putSpecRule(rule); } catch { /* 다음 로그인 때 다시 */ } }
  }
  async removeSpecRule(phrase: string) {
    this.specRules = this.specRules.filter((r) => r.phrase !== phrase);
    saveLocalRules(this.specRules);
    if (this.account) { try { await deleteSpecRule(phrase); } catch { /* 무시 */ } }
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
      const found = gray && proposeAxisLines(gray, wantedAxes(this.cameraDraft.axes)); // 창에서 고른 축 조합의 선을 찾는다 (2026-10-21 "축선을 변경하면 다시 자동으로")
      if (!gray || !found) return false;
      const ax = axesAfterProposal(this.cameraDraft.axes, found);
      if (ax.fallback) { this.notice = '고른 축 조합에 맞는 선을 찾지 못해 선은 그대로 두었습니다. 그 축의 선이 보이는 사진이어야 하고, 아니면 선을 직접 놓으세요.'; return true; }
      // 첫 쌍(가로에 가까운 선)·둘째 쌍(세로에 가까운 선)의 축은 창의 축 선 설정을 따른다(2026-10-18 사용자: "설정에 x, y 설정하고 자동으로 측정하면 x, z로 변경되어 결과가 나온다. 설정의 자동에서 따르게").
      // 설정이 '자동'이면 X 가로·Z 높이 (X·Y 수평, Z 수직 — "실내 실외 구분표시 제거, x와 y는 수평 z가 수직")
      this.cameraDraft = snapSetup(gray, { ...this.cameraDraft, x: found.x, y: found.y, axes: ax.axes });
      return true;
    } finally { this.cameraBusy = false; }
  }

  /** 원근 자동 매칭에 쓸 사인물: 크기를 넣고(추정 아님) 원근에 맞게 그린 사각·원형 사인물. 고른 것 > 그 사진의 첫 것 */
  matchSignOf(photoId: string): { o: SignObject; w: number } | null {
    const ok = (o: SignObject) => o.photoId === photoId && o.shape !== 'polygon' && o.quad.length === 4 && !!this.sizeOf(o) && !this.sizeOf(o)!.estimated;
    const pick = [this.selected, ...this.objects].find((o): o is SignObject => !!o && ok(o));
    return pick ? { o: pick, w: this.sizeOf(pick)!.w } : null;
  }
  /**
   * 원근 자동 매칭 (2026-10-19 사용자: "원근 -> 원근자동매칭 옆에 옵션버튼(네모두개겹친 아이콘)으로" → "크기를 지정하고 원근에 맞게 그려진 사인물의 코너에 중심점을 주고
   * 사인물 길이를 사용해 표준 길이도 지정 자동으로 매칭"): 창을 열지 않고 사진 머리글에서 바로.
   * 크기 있는 사인물이 있으면 그 외곽선으로(위·아래 변 = 가로 축, 좌·우 변 = 높이 축, 원점 = 왼쪽 아래 코너, 기준 길이 = 가로 mm — core/camera.ts signCameraSetup).
   * 없으면 AI 가 축 선을 찾는다(원점·기준 길이·축 지정은 저장된 것/기본 배치). 둘 다 안 되면 false (호출자가 창을 연다)
   */
  async autoMatchCamera(photoId: string): Promise<boolean> {
    const p = this.photos.find((x) => x.id === photoId);
    if (!p || !this.canEdit) return false;
    // 사람이 둘째 축을 깊이(Y)로 바꿔 두었으면 사인물(좌우 변 = Z) 대신 AI 로 그 축의 선을 찾는다 (2026-10-21 "사람이 잡은것도 축을 변경했다면 다시 자동버튼이 눌리면")
    const sign = p.camera?.axes?.second[1] === 'y' ? null : this.matchSignOf(photoId);
    if (sign) {
      const setup = signCameraFit(sign.o.quad.map((q) => [q[0], q[1]] as [number, number]), sign.w, this.sizeOf(sign.o)?.h ?? 0, p.w, p.h); // 가로세로 비율로 화각까지 (2026-10-20)
      if (setup) {
        this.updateCamera(p.id, { camera: setup, autoCamera: undefined });
        return true;
      }
    }
    this.cameraBusy = true;
    try {
      const gray = await this.grayOf(p.assetId, p.w, p.h);
      const found = gray && proposeAxisLines(gray, wantedAxes(p.camera?.axes));
      if (!gray || !found) return false;
      const base = p.camera ? (JSON.parse(JSON.stringify(p.camera)) as CameraSetup) : defaultCameraSetup(p.w, p.h);
      const ax = axesAfterProposal(base.axes, found);
      if (ax.fallback) { this.notice = '고른 축 조합에 맞는 선을 찾지 못해 선은 그대로 두었습니다.'; return true; }
      const next = snapSetup(gray, { ...base, x: found.x, y: found.y, axes: ax.axes, auto: true }); // 축 조합은 점수로(사람이 고른 조합이 있으면 그 안에서) (2026-10-21)
      this.updateCamera(p.id, { camera: next, autoCamera: undefined });
      return true;
    } finally { this.cameraBusy = false; }
  }

  /**
   * 사진 등록 즉시 자동 원근 (2026-10-19 사용자: "사진이 등록되면 바로 원근 자동으로 잡고 … 이걸 자동으로 해도 될거같아 좀 신비롭게 처리되는 효과주면서"):
   * AI 가 축 선을 찾아 auto 설정으로 저장(기준 길이 없음 — 치수가 들어오면 autoLength 가 채운다). 못 찾으면 조용히 넘어간다(치수가 들어오면 사인물로 잡는다)
   */
  async autoCameraOnAdd(photoId: string) {
    const p = this.photos.find((x) => x.id === photoId);
    if (!p || !this.canEdit || p.camera) return;
    this.showCameraFx(photoId, { kind: 'scan' });
    let ok = false;
    try {
      const gray = await this.grayOf(p.assetId, p.w, p.h);
      const found = gray && proposeAxisLines(gray);
      const now = this.photos.find((x) => x.id === photoId);
      if (gray && found && now && !now.camera && now.autoCamera !== false) { // 읽는 사이 지웠으면(자동 끔) 쓰지 않는다
        const { ref: _ref, ...base } = defaultCameraSetup(p.w, p.h);
        const next = snapSetup(gray, { ...base, x: found.x, y: found.y, axes: axesForProposal(found), auto: true }); // 기준 길이는 모른다 — 치수가 들어오면 채운다. 둘째 쌍은 기울기로 Z/Y (2026-10-21)
        if (solveCamera(next, p.w, p.h)) {
          this.editBoundary();
          this.project.updatePhoto(photoId, { camera: next });
          this.editBoundary();
          ok = true;
        }
      }
    } catch { /* 사진을 못 읽음 — 자동은 조용히 실패 */ }
    if (ok) this.showCameraFx(photoId, { kind: 'found' }, 2600); else this.clearCameraFx(photoId);
  }

  /**
   * 사인물 치수가 들어오면 자동 원근에 길이 반영 (2026-10-19): 내 편집으로 사인물의 가로·세로·외곽선이 바뀌면(원격·되돌리기는 제외) 잠시 뒤 그 사진에서 —
   * 원근이 없으면(자동 끔이 아니면) 사인물로 원근을 잡고, 자동 원근이면 근사치일 때만(signLengthSetup) 원점·기준 길이를 그 사인물로. 사람이 맞춘 원근은 손대지 않는다
   */
  private sizeSnap = new Map<string, string>();
  private lengthQueue = new Set<string>();
  private lengthTimer: ReturnType<typeof setTimeout> | undefined;
  private watchSizes() {
    const keyOf = (o: SignObject) => { const s = this.sizeOf(o); return s && !s.estimated ? `${s.w}x${s.h}|${o.quad.map((q) => q.join(',')).join(';')}` : ''; };
    this.project.doc.on('afterTransaction', (tr: { local: boolean; origin: unknown; changedParentTypes: Map<unknown, unknown> }) => {
      if (![...tr.changedParentTypes.keys()].some((t) => t === this.project.objects || (t as { parent?: unknown }).parent === this.project.objects)) return;
      const mine = tr.local && tr.origin === null; // Project 메서드는 origin 없이 — 동기화·IndexedDB·되돌리기는 origin 이 있다
      for (const o of this.project.allObjects()) {
        const k = keyOf(o), prev = this.sizeSnap.get(o.id);
        this.sizeSnap.set(o.id, k);
        if (mine && prev !== undefined && k && k !== prev && o.shape !== 'polygon' && o.quad.length === 4) this.lengthQueue.add(o.id);
      }
      if (this.lengthQueue.size) { clearTimeout(this.lengthTimer); this.lengthTimer = setTimeout(() => this.autoLength(), 700); }
    });
  }
  private autoLength() {
    const ids = [...this.lengthQueue];
    this.lengthQueue.clear();
    if (!this.canEdit) return;
    for (const id of ids) {
      const o = this.objects.find((x) => x.id === id);
      const p = o && this.photos.find((x) => x.id === o.photoId);
      const size = o && this.sizeOf(o);
      if (!o || !p || !size || size.estimated || o.shape === 'polygon' || o.quad.length !== 4) continue;
      const quad = o.quad.map((q) => [q[0], q[1]] as [number, number]);
      if (!p.camera && p.autoCamera === false) continue; // 원근을 지웠으면(자동 끔) 새로 만들지 않는다
      // 같은 사진의 다른 실측 사인물 — 지금 원근을 확인하고 있으면 안 맞는 새 사인물로 갈아엎지 않는다
      const others = this.objects.flatMap((x) => {
        if (x.id === o.id || x.photoId !== p.id || x.shape === 'polygon' || x.quad.length !== 4) return [];
        const sz = this.sizeOf(x);
        return sz && !sz.estimated ? [{ quad: x.quad.map((q) => [q[0], q[1]] as [number, number]), w: sz.w, h: sz.h }] : [];
      });
      const next = autoCameraFrom(p.camera, quad, size.w, size.h, others, p.w, p.h);
      if (!next || JSON.stringify(next) === JSON.stringify(p.camera)) continue;
      this.updateCamera(p.id, { camera: next }); // 조용히 — 완성(3)이 될 때만 화면 안내 (2026-10-20)
    }
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
    const { auto: _auto, ...manual } = $state.snapshot(this.cameraDraft) as CameraSetup; // 사람이 맞춘 원근 — 자동이 다시 손대지 않는다
    this.updateCamera(p.id, { camera: manual, autoCamera: undefined });
    this.closeCamera();
  }

  // ---------- 사진 설정: 교체 · 이미지 조절 (2026-10-21 "x 마크 대신 설정버튼으로 사진교체, 이미지 조절(크롭(크게도 가능하게),밝기), 삭제") ----------
  /** 이미지 조절 창이 열린 사진 */
  adjustPhotoId = $state<string | null>(null);
  adjustPhoto = $derived(this.adjustPhotoId ? this.photos.find((p) => p.id === this.adjustPhotoId) ?? null : null);
  photoBusy = $state(false);

  /** 크롭(원본 px, 원본 밖 = 흰 여백)·밝기를 새 그림으로 구워 바꾼다. 좌표(영역·존·축 선·말풍선)는 크롭만큼 옮겨 같은 자리에 */
  async applyPhotoAdjust(photoId: string, crop: Crop, brightness: number): Promise<boolean> {
    const p = this.photos.find((x) => x.id === photoId);
    if (!p || !this.canEdit || this.photoBusy) return false;
    const plan = adjustPlan(p, crop, brightness);
    this.photoBusy = true;
    try {
      let assetId = sourceOf(p).assetId; // 원본 그대로면 원본 에셋으로 되돌린다 (새로 굽지 않음)
      if (plan.source) {
        const { bakePhoto } = await import('./photoBake');
        const url = await assetUrl(plan.source.assetId);
        if (!url) { this.notice = '원본 사진을 아직 받지 못했습니다. 잠시 뒤 다시 해 주세요.'; return false; }
        assetId = await putAsset(await bakePhoto(url, plan.source));
      }
      this.editBoundary();
      this.project.transformPhotoPts(photoId, shiftBy(plan.shift), { assetId, w: plan.w, h: plan.h, x: plan.x, y: plan.y, width: plan.width, source: plan.source });
      this.editBoundary();
      return true;
    } catch (e) {
      this.notice = e instanceof StorageLimitError ? `저장 용량 한도(${formatBytes(e.limitBytes)})를 넘어 조절한 사진을 저장할 수 없습니다. 사용 중 ${formatBytes(e.usedBytes)}.` : '이미지 조절에 실패했습니다.';
      return false;
    } finally { this.photoBusy = false; }
  }

  /** 사진 교체: 같은 자리에서 다시 찍은 사진으로. 이름·보드 위치·존·원근·영역은 두고 좌표만 새 px 로(가로 배율), 조절 기록은 지운다 */
  async replacePhoto(photoId: string, file: File | Blob): Promise<boolean> {
    const p = this.photos.find((x) => x.id === photoId);
    if (!p || !this.canEdit || this.photoBusy) return false;
    this.photoBusy = true;
    try {
      const assetId = await putAsset(await prepareUpload(file));
      const { w, h } = await imageSize((await assetUrl(assetId))!);
      const plan = replacePlan(p, assetId, w, h);
      this.editBoundary();
      this.project.transformPhotoPts(photoId, plan.map, plan.patch);
      this.editBoundary();
      if (plan.aspectDiffers) this.notice = '새 사진의 가로세로 비율이 달라 영역·존이 세로로 어긋날 수 있습니다. 확인해 주세요.';
      return true;
    } catch (e) {
      this.notice = e instanceof StorageLimitError ? `저장 용량 한도(${formatBytes(e.limitBytes)})를 넘어 사진을 올릴 수 없습니다. 사용 중 ${formatBytes(e.usedBytes)}.` : '사진 교체에 실패했습니다.';
      return false;
    } finally { this.photoBusy = false; }
  }

  clearCamera(photoId: string) {
    if (!this.canEdit) return;
    this.editBoundary();
    this.project.updatePhoto(photoId, { camera: undefined, autoCamera: false }); // 지우면 자동도 끔 (치수가 들어와도 다시 만들지 않는다)
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
  /** 사인물마다 내용 지문 (2026-10-22 사인물별 컨펌) — 바뀐 사인물만 "다시 확인" */
  get signHashes(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const o of this.signs) { const sz = this.sizeOf(o); out[o.id] = signHash(o, sz ? { w: sz.w, h: sz.h } : null, this.quote.lines.filter((l) => l.objectId === o.id).reduce((a, l) => a + l.amount, 0)); }
    return out;
  }
  async approve(by: string, excluded: string[] = []) {
    if (!this.room) throw new Error('방이 없습니다');
    this.setNickname(by);
    const snapshot = { ...snapshotOf(this.signs, (o) => this.sizeOf(o), this.quote, this.sources), signHashes: this.signHashes };
    await postApproval(this.room, this.role === 'owner' ? null : this.invite, { by, hash: this.contentHash, snapshot, proposalId: this.settings.proposal?.id, ...(excluded.length ? { excluded } : {}) });
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
        this.access = { status: 'ok', role: a.role, projectName: a.project.name, billing: !!a.billing && !this.consumer, branding: !!a.branding, ...(a.business ? { business: a.business } : {}), ...(a.requestId ? { requestId: a.requestId } : {}), ...(a.outsource ? { outsource: true } : {}), ...(a.lost ? { lost: true } : {}) };
        // 사진 보드만 보는 고객(보기 초대)은 탭이 없으니 디자인(2D)으로 — 실측 화면에서 시작하면 디자인이 안 보인다 (2026-10-22 작업 탭)
        if (a.role === 'viewer' && !this.requestView) this.stage = '2d';
        const session = loadSession();
        const useSession = (a.role === 'owner' || !this.invite) && !!session;
        params = useSession ? { session: session! } : { invite: this.invite!, guest: guestId() };
        setAssetScope({ project: room, session: useSession ? session : null, invite: useSession ? null : this.invite });
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
    this.project.onChange(() => this.detectRestore());
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
      if (this.role === 'owner' && !this.project.settings().prices) this.project.updateSettings({ prices: mergePrices(this.consumer ? null : this.accountPrices), quoteMode: this.consumer ? 'auto' : 'manual' }); // 소비자 초안은 예시 단가 자동 계산 = "참고 금액"
    });
    this.client.setName(this.nickname, this.myId);
    if (this.startTalk || this.startFocus) this.client.whenOnline(() => this.applyStartTalk());
  }
  /** 문서가 들어올 때까지 잠깐 기다렸다가 방 열기·대상 잡기 (최대 약 6초) */
  private applyStartTalk(tries = 0) {
    const room = this.startTalk, focus = this.startFocus;
    const roomReady = !room || this.talkRooms.some((r) => r.id === room);
    const focusReady = !focus || (focus.kind === 'object' ? this.objects.some((o) => o.id === focus.id || o.sameAs === focus.id) : focus.kind === 'photo' ? this.photos.some((p) => p.id === focus.id) : this.pins.some((p) => p.id === focus.id));
    if ((!roomReady || !focusReady) && tries < 30) { setTimeout(() => this.applyStartTalk(tries + 1), 200); return; }
    this.startTalk = null; this.startFocus = null;
    if (room) this.openTalk(room);
    if (focus && focusReady) this.focusRef(focus);
  }

  /** 표시 이름: 계정 이름 > 기기에 정한 이름 > 이메일 앞부분 */
  /**
   * 같은 아이디 동시 사용 (2026-10-21): 로그인해 있고 화면이 보이는 동안 30초마다(그리고 다시 보일 때) 사용 중 신호를 보낸다.
   * 다른 기기에서도 지금 쓰고 있으면 [다른 곳 로그아웃]/[여기서 로그아웃]을 묻고, 다른 곳에서 이쪽을 로그아웃시켰으면(401) 안내하고 로그아웃.
   * 동시에 쓰지 않으면(다른 기기 신호가 70초 넘게 없음) 아무 일 없이 로그인이 유지된다
   */
  async beatPresence() {
    if (!SERVER_URL || !this.account || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
    try { const r = await sendPresence(); this.sessionConflict = r.others + 1 > (r.allowed ?? 1); } // 기기 2대까지는 함께 (2026-10-21)
    catch (e) {
      if (e instanceof AuthError && e.status === 401) {
        this.sessionConflict = false;
        saveSession(null);
        this.account = null;
        this.notice = '같은 아이디로 다른 곳에서 로그아웃을 선택해 여기서는 로그아웃되었습니다.';
      }
    }
  }
  private presenceStarted = false;
  private startPresence() {
    if (this.presenceStarted || typeof window === 'undefined') return;
    this.presenceStarted = true;
    setInterval(() => void this.beatPresence(), 30_000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void this.beatPresence(); });
  }
  /** [다른 곳 로그아웃] */
  async logoutOtherDevices() { await apiLogoutOthers(); this.sessionConflict = false; }

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
      if (!canSeeTalkMessage(m, this.talks, this.myId, this.isCompany)) continue; // 톡: 같은 방 사람에게만 (2026-10-22)
      if (this.talkOpen && this.talkRoomId === roomIdOf(m.objectId) && !document.hidden) continue; // 보고 있는 방
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
    const rid = roomIdOf(t.objectId);
    if (rid) { this.openTalk(rid); return; }
    this.view = 'board';
    if (this.project.pin(t.objectId)) this.selectPin(t.objectId); else this.openChat(t.objectId); // 사인물이면 말풍선 창 (2026-10-18)
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
  /** 평면 카드: 치수(입력·추정)가 있으면 그 크기, 없으면 임시 크기(placeholder — 2026-10-22 "사이즈를 넣지 않으면 카드로 나오지 않는다"). 임시 카드는 견적·PDF·SVG 에 안 들어간다 */
  flatCards = $derived.by(() => this.signs.map((o) => { const s = this.sizeOf(o); return s ? { o, ...s, placeholder: false } : { o, ...placeholderSize(o.quad as [number, number][]), estimated: false, placeholder: true }; }));
  /** 보드 평면 구역 축척 (px/mm) — 프로젝트 설정, 모두에게 같음. 설정이 없으면 사진 속 사인물과 같은 크기로 (autoFlatScale, 2026-10-22) */
  flatScale = $derived.by(() => {
    if (Number.isFinite(this.settings.flatScale)) return clampFlatScale(this.settings.flatScale);
    return autoFlatScale(this.flatCards.map(({ o, w, placeholder }) => {
      const p = this.photos.find((x) => x.id === o.photoId);
      if (!p || o.quad.length !== 4 || !p.w) return { mm: w, px: 0, placeholder };
      const [tl, tr, br, bl] = o.quad;
      const len = (a: number[], b: number[]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
      return { mm: w, px: ((len(tl, tr) + len(bl, br)) / 2) * (p.width / p.w), placeholder };
    }));
  });
  /** 보드 평면 구역 이동 (보드 px) — 프로젝트 설정 */
  flatOffset = $derived(this.settings.flatOffset && Number.isFinite(this.settings.flatOffset.x) && Number.isFinite(this.settings.flatOffset.y) ? this.settings.flatOffset : { x: 0, y: 0 });
  /** 카드 간격 mm (설정 flatGap, 0~3000, 기본 100 — 2026-10-24 "재정렬 간격 기본값 100으로 하고 50단위로", 전엔 600) */
  flatGap = $derived(Math.min(3000, Math.max(0, Number.isFinite(this.settings.flatGap) ? this.settings.flatGap! : 100)));
  flatPlaced = $derived(layoutList(this.flatCards.map(({ o, w, h }) => ({ id: o.id, w, h, x: o.listX, y: o.listY })), this.flatGap));
  /** 카드 배열 모드 (✥ 를 누르면): 전체 외곽선 + 상단 [재정렬]·간격 −/+ (2026-10-20) */
  flatArrange = $state(false);
  /** 상단 막대의 축척 −/+ 요청 (보드가 피봇을 지키며 적용) — 2026-10-23 도구를 헤더로 */
  flatScaleStep = $state<{ factor: number; n: number } | null>(null);
  scaleFlat(factor: number) { this.flatScaleStep = { factor, n: (this.flatScaleStep?.n ?? 0) + 1 }; }
  get flatLocked() { return !!this.settings.flatLocked; }
  setFlatLocked(v: boolean) { this.updateSettings({ flatLocked: v }); }
  /**
   * 카드 재정렬 — 사진과 같은 비율 (2026-10-22 사용자: "재정렬 예전에 똑똑하게 잘된거 같은데 자동정렬은 피봇 기본 위치에 놓는다. 그리고 사진과 같은 비율로 사진과 비슷하게 정렬해준다"; 2026-10-20 그리드는 대체됨):
   * 보드 px → mm 는 **실제 벽 축척**(치수 있는 사인물의 mm ÷ 사진 속 폭(보드 px), 중앙값 — 없으면 1/축척)으로 바꿔 사진 배치를 mm 로 옮기고, 카드 가운데 = 사진 속 사인물 가운데(core/arrange.ts arrangeLikePhotos).
   * 묶음 왼쪽 위는 기본 자리: flatOffset 도 0 으로. 카드 아래 이름 줄(보드 약 100px)도 겹침에. 한 번의 ⌘Z
   */
  arrangeFlatCards(gap = this.flatGap) {
    if (!this.canEdit || !this.flatCards.length) return;
    const k = this.flatScale;
    const ratios = this.flatCards.flatMap(({ o, w, placeholder }) => {
      const p = this.photos.find((x) => x.id === o.photoId);
      if (placeholder || !p || o.quad.length !== 4 || !p.w) return [];
      const [tl, tr, br, bl] = o.quad;
      const px = ((Math.hypot(tr[0] - tl[0], tr[1] - tl[1]) + Math.hypot(br[0] - bl[0], br[1] - bl[1])) / 2) * (p.width / p.w);
      return px > 0 ? [w / px] : [];
    }).sort((a, b) => a - b);
    const s = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1 / k; // mm / 보드 px
    const photos = this.photos.map((p) => ({ x: p.x * s, y: p.y * s, w: p.width * s, h: p.width * (p.h / p.w) * s, imgW: p.w, imgH: p.h }));
    const idx = new Map(this.photos.map((p, i) => [p.id, i]));
    // 사진별 벽면 (원근이 있으면): 정면 사인물을 벽 mm 로 편다 — 축 격자 재정렬 (2026-10-23 "원근으로 정의된 각축의 격자를 기준으로 정면 판정된 사인물들을 묶어 랩핑")
    const planes = new Map(this.photos.map((p) => [p.id, wallPlaneOf(this.objects.filter((o) => o.photoId === p.id), this.calibrations.get(p.id))]));
    const cards: GridCard[] = this.flatCards.map(({ o, w, h }) => {
      // 연결된 사인물(⇄)은 가장 정면에서 찍힌 영역이 카드의 기준 사진·자리 (2026-10-21)
      const inst = [o, ...this.objects.filter((x) => x.sameAs === o.id)].filter((x) => x.quad.length === 4 && idx.has(x.photoId));
      const home = inst.length ? homeOf(inst as (SignObject & { quad: [number, number][] })[]) : null;
      if (!home) return { id: o.id, w, h, photo: null, group: 'front', box: { x0: 0, y0: 0, x1: 0, y1: 0 } };
      const photo = this.photos.find((p) => p.id === home.photoId)!;
      const xs = home.quad.map((q) => q[0]), ys = home.quad.map((q) => q[1]);
      const pxBox = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      const plane = planes.get(home.photoId) ?? null;
      const face = plane?.source === 'calibration' ? faceOf(home, plane) : null;
      // 옆면(x)은 사진 가운데 기준 왼쪽·오른쪽, 위아래면(z)은 아래 묶음 — 그 면끼리는 사진 속 위치로 순서
      if (face && face.axis === 'x') return { id: o.id, w, h, photo: idx.get(home.photoId)!, group: (pxBox.x0 + pxBox.x1) / 2 < photo.w / 2 ? 'left' : 'right', box: pxBox };
      if (face && face.axis === 'z') return { id: o.id, w, h, photo: idx.get(home.photoId)!, group: 'bottom', box: pxBox };
      // 정면: 원근(실측 벽면)이 있으면 벽 mm 로 펴서(축선이 수평·수직), 없으면 사진 px 그대로(이미 정면)
      let box = pxBox;
      if (plane?.source === 'calibration') {
        const q = quadOnWall(plane, home);
        const wx = q.map((p) => p[0]), wy = q.map((p) => -p[1]); // 벽 y(위 +) → 아래 +
        box = { x0: Math.min(...wx), y0: Math.min(...wy), x1: Math.max(...wx), y1: Math.max(...wy) };
      }
      return { id: o.id, w, h, photo: idx.get(home.photoId)!, group: 'front', box, view: pxBox }; // view = 사진 속 자리 (흩어진 사인물 줄 묶기, 2026-10-24)
    });
    const at = arrangeByAxisGrid(cards, photos, gap, 100 / k);
    this.editBoundary();
    this.project.batch(() => { for (const [id, p] of at) this.project.updateObject(id, { listX: Math.round(p.x), listY: Math.round(p.y) }); });
    // ✥ 를 기본 자리로, 축척도 사진과 같은 비율로 (2026-10-22 사용자 스크린샷 "상태가 점점 심각해지고 있어": 저장된 축척 572% 로 그려 카드가 사진의 몇 배로 흩어졌다)
    this.updateSettings({ flatOffset: { x: 0, y: 0 }, ...(ratios.length ? { flatScale: Math.round(clampFlatScale(1 / s) * 10000) / 10000 } : {}) });
    this.editBoundary();
  }
  /** 카드 간격 바꾸고 그 간격으로 다시 정렬 */
  setFlatGap(mm: number) {
    const g = Math.min(3000, Math.max(0, Math.round(mm / 50) * 50));
    this.updateSettings({ flatGap: g });
    this.arrangeFlatCards(g);
  }
  /**
   * 자동 배치된(옮긴 적 없는) 카드를 지금 자리에 고정한다 — 카드를 끌기 시작할 때 (2026-10-19 사용자: "최상단의 카드는 내려가지 못하고 중간 카드는 하단으로 이동시 하단카드가 같이 이동한다").
   * 자동 배치는 "옮긴 카드들 중 가장 아래"의 밑에 줄 서므로, 고정하지 않으면 한 장을 내릴 때 나머지가 함께 밀려 내려갔다. 호출자의 편집 묶음(⌘Z 한 번) 안에서
   */
  freezeFlatLayout() {
    if (!this.canEdit) return;
    const loose = this.flatCards.filter(({ o }) => o.listX === undefined || o.listY === undefined);
    if (!loose.length) return;
    this.project.batch(() => { for (const { o } of loose) { const p = this.flatPlaced.get(o.id); if (p) this.project.updateObject(o.id, { listX: Math.round(p.x), listY: Math.round(p.y) }); } });
  }

  // ---------- 복사·붙여넣기·복제 (2026-10-15 사용자: "카피 페이스트 복제등이 필요하다") ----------
  /** 사인물 클립보드 (이 탭 안에서 유지 — 다른 프로젝트로 옮겨 붙일 수 있다) */
  clipboard = $state<ClipSign | null>(null);
  /** 매니퓰레이터 모드 (W 이동 · E 회전 · R 크기, 2026-10-15 사용자: "qwer 선택,이동,회전,크기") */
  /** 매니퓰레이터 모드. 기본 none = 아무것도 안 보임, [이동 ✥]을 켜야 화살표·변 막대 (2026-10-18 사용자: "이동도 이동 선택하면 나오게 기본은 안나오게"). 회전·크기는 당분간 숨김(단축키 E·R 로만) */
  gizmoMode = $state<'none' | 'rotate' | 'scale'>('none'); // 이동 매니퓰레이터는 없앰 (2026-10-19) — none = 면 직각 막대
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
  /** 컬러 카드 수정 (자리 유지) */
  async updateColorCard(card: ColorCard) { this.colorLibrary = this.colorLibrary.map((c) => (c.id === card.id ? card : c)); await this.persistColors(); }
  async removeColorCard(id: string) { this.colorLibrary = this.colorLibrary.filter((c) => c.id !== id); await this.persistColors(); }
  private async persistColors() {
    saveLocalColors(this.colorLibrary);
    if (!this.account) return;
    try { await saveColors({ version: 1, colors: this.colorLibrary }); } catch { /* 오프라인·서버 오류: 기기 사본은 남는다 */ }
  }

  /** Shift+클릭: 선택에 더하기/빼기. 마지막으로 누른 것이 주 선택(selectedId) */
  toggleSelect(id: string, kind: 'shape' | 'card' = 'shape') {
    // 카드와 사진 외곽선은 섞지 않는다 — 다른 종류를 고르면 새로 시작 (2026-10-17 "정면도와 사인물 외곽라인은 같이 선택할 수 없다. 다른게 선택되면 선택 풀어줘")
    if (!this.selectedId || kind !== this.selectionKind) { this.multiMode && this.selectedId ? this.restartSelection(id, kind) : this.selectObject(id, kind); return; }
    const all = new Set(this.selectionIds);
    if (all.has(id) && id !== this.selectedId) { all.delete(id); this.multi = [...all].filter((x) => x !== this.selectedId); return; }
    if (id === this.selectedId) { // 주 선택을 빼면 남은 것 중 마지막이 주 선택
      all.delete(id); const rest = [...all]; this.multi = rest.slice(0, -1); this.selectedId = rest.at(-1) ?? null; if (!this.selectedId) this.multiMode = false; return;
    }
    all.add(this.selectedId); all.delete(id);
    this.multi = [...all]; this.objectSettingsOpen = false; this.panelOpen = false; this.selectedId = id;
  }
  /** 다중 선택 모드 켜기/끄기 — 켤 때는 대화·패널을 닫고, 끌 때는 마지막 선택만 남긴다 */
  /** keep = 끄되 고른 것은 그대로 (Shift 를 뗄 때, 2026-10-22) */
  setMultiMode(on: boolean, keep = false) {
    this.multiMode = on; // 아무것도 안 골라도 켤 수 있다 — 도구 막대 [다중] (2026-10-22)
    if (on) { this.closeChat(); this.panelOpen = false; this.objectSettingsOpen = false; } else if (!keep) this.multi = [];
  }
  /** 선택한 사인물 모두를 한 분류로 (2026-10-19 "한번에 종류 선택 및 변경"). 이미 그 분류인 것은 그대로 — 한 번의 되돌리기 */
  applyCategoryToSelection(g: Group) {
    if (!this.canEdit || !this.selectionIds.length) return;
    this.editBoundary();
    this.project.batch(() => {
      for (const id of this.selectionIds) {
        const o = this.objects.find((x) => x.id === id);
        if (o && categoryOf(o) !== g) this.project.updateObject(id, categoryPatch(o, g, defaultProductFor(g)));
      }
    });
    this.editBoundary();
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
    this.multi = []; this.selectedId = null; this.multiMode = false;
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
    // 재질복제 (2026-10-23 "마지막선택 사인물의 재질로 일관변경 단 사이즈는 유지" → "두께도 같이 변경"): 종류·옵션·시트·두께·구성 요소 재료, 가로·세로·이름·문구·글자 배치는 그대로
    this.editBoundary();
    for (const id of this.multi) { const dst = this.objects.find((x) => x.id === id); if (dst && id !== src.id) this.project.updateObject(id, materialPatch(src, dst)); }
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
    if (id) this.talkPickObject(id); // 톡이 열려 있으면 고른 사인물이 대화 링크로 (2026-10-22)
    // 다중 선택 중에는 다른 길로 골라도(손잡이 잡기·대화 열기·새로 그리기) 풀리지 않고 그것을 주 선택으로 더한다 (2026-10-22 "다중선택 중간에 해제되는 경우도 알아봐줘") — 끝내기는 null(✕·정리)·[다중] 끄기
    if (this.multiMode && id && (!this.selectedId || kind === this.selectionKind)) {
      const all = new Set(this.selectionIds);
      all.delete(id);
      if (!this.selectedId) this.selectionKind = kind;
      this.multi = [...all]; this.selectedId = id;
      this.selectedPinId = null; this.zoneSel = null;
      return;
    }
    if (id !== this.selectedId) { this.objectSettingsOpen = false; this.panelOpen = false; this.chatObjectId = null; }
    this.multi = [];
    this.selectionKind = kind;
    this.selectedId = id;
    if (!id) this.multiMode = false;
    if (id) { this.selectedPinId = null; this.zoneSel = null; }
  }

  /** 다중 선택 모드는 켠 채 다른 종류(카드↔외곽선)로 새로 시작 */
  private restartSelection(id: string, kind: 'shape' | 'card') { const on = this.multiMode; this.multiMode = false; this.selectObject(id, kind); this.multiMode = on; }

  /**
   * 빈 곳 누름: 선택은 **탭일 때만** 푼다 (2026-10-22 사용자: "개별선택시 화면 팬이나 줌시 선택유지 되게") — 6px 넘게 움직이면(팬), 두 번째 손가락이 닿으면(핀치 줌),
   * 취소되면 그대로. 전에는 누르는 순간 풀고 팬을 시작해 화면만 옮겨도 선택이 사라졌다
   */
  clearSelectionOnTap(e: PointerEvent, onTap?: () => void) {
    const sx = e.clientX, sy = e.clientY;
    let tap = true;
    const move = (ev: PointerEvent) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) tap = false; };
    const second = (ev: PointerEvent) => { if (ev.pointerId !== e.pointerId) tap = false; };
    const done = () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerdown', second, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', cancel, true); };
    const up = (ev: PointerEvent) => { if (ev.pointerId !== e.pointerId) return; done(); if (tap) { this.selectObject(null); this.selectPin(null); this.selectZone(null); this.flatArrange = false; onTap?.(); } }; // 빈 곳 탭 = 카드 배열 모드도 끈다 (2026-10-23 "터치업에서 선택 해제")
    const cancel = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) done(); };
    window.addEventListener('pointermove', move, true); window.addEventListener('pointerdown', second, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', cancel, true);
  }

  selectPin(id: string | null) {
    this.selectedPinId = id;
    if (id && !this.multiMode) { this.selectedId = null; this.zoneSel = null; } // 다중 선택 중 말풍선을 눌러도 선택 유지 (2026-10-22)
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
    if (this.talkOpen && this.talkRoomId) { // 톡에서 찍은 번호는 대화 링크로 (2026-10-22)
      const pin = this.project.pin(id);
      this.talkRefs = addRef(this.talkRefs, { kind: 'pin', id, label: pin ? `#${pin.number}` : '#' });
      return;
    }
    this.selectPin(id);
  }

  // ── 톡 (2026-10-22 사용자: "톡방이 켜진 상태에서 사인물을 선택하면 대화에 사인물 링크가 생기고 대화에서 해당 링크를 누르면 해당 링크가 화면에 잡힌다") ──
  openTalk(roomId: string | null = this.talkRoomId) {
    this.talkOpen = true;
    this.talkRoomId = roomId && this.talkRooms.some((r) => r.id === roomId) ? roomId : null;
    if (this.talkRoomId) this.markSeen(roomKey(this.talkRoomId));
  }
  closeTalk() { this.talkOpen = false; this.talkRefs = []; }
  /** 방 만들기 — 회사 쪽만 (문서에 저장). 만든 방을 연다 */
  createTalk(name: string, members: { id: string; name: string }[]): string | null {
    if (!this.isCompany || !name.trim()) return null;
    const ms = members.filter((m, i) => m.id && m.id !== this.myId && members.findIndex((x) => x.id === m.id) === i);
    const id = this.project.addTalk({ name: name.trim().slice(0, 40), memberIds: ms.map((m) => m.id), memberNames: Object.fromEntries(ms.map((m) => [m.id, m.name])), createdById: this.myId, createdBy: this.nickname });
    this.openTalk(id);
    this.syncTalks();
    return id;
  }
  /** 서버 톡 색인 갱신 (메인 화면 톡 목록·방 멤버 접근) — 문서가 서버에 닿은 뒤 */
  private syncTalks() {
    const room = this.room;
    if (!room) return;
    setTimeout(() => void talkSync(room, this.invite).catch(() => {}), 600);
  }
  /** 사인물을 고르면 열린 방의 보낼 링크로 */
  talkPickObject(id: string | null) {
    if (!id || !this.talkOpen || !this.talkRoomId) return;
    if (this.talkSkipId === id) { this.talkSkipId = null; return; }
    const o = this.objects.find((x) => x.id === id);
    if (o) this.talkRefs = addRef(this.talkRefs, { kind: 'object', id: o.sameAs ?? o.id, label: o.name || '사인물' });
  }
  /** 사진 빈 곳을 탭하면 그 사진을 링크로 */
  talkPickPhoto(photoId: string) {
    if (!this.talkOpen || !this.talkRoomId) return;
    const p = this.photos.find((x) => x.id === photoId);
    if (p) this.talkRefs = addRef(this.talkRefs, { kind: 'photo', id: p.id, label: p.name || '사진' });
  }
  /** 링크 글: 지금 이름으로 (사인물 이름·사진 이름이 바뀌면 따라 바뀜, 지워졌으면 보낼 때 이름) — 2026-10-22 "링크를 사인물이름으로 … 사진도 사진이름으로" */
  refText(r: TalkRef): string {
    if (r.kind === 'object') return (this.objects.find((x) => x.id === r.id) ?? this.objects.find((x) => x.sameAs === r.id))?.name || r.label;
    if (r.kind === 'photo') return this.photos.find((p) => p.id === r.id)?.name || r.label;
    const pin = this.pins.find((p) => p.id === r.id);
    return pin ? `#${pin.number}` : r.label;
  }
  /** 사진 이름 바꾸기 (사진 설정, 2026-10-22) */
  renamePhoto(id: string, name: string) {
    const n = name.trim().slice(0, 40);
    if (!n || !this.canEdit) return;
    this.editBoundary(); this.project.updatePhoto(id, { name: n }); this.editBoundary();
  }
  removeTalkRef(r: TalkRef) { this.talkRefs = this.talkRefs.filter((x) => !(x.kind === r.kind && x.id === r.id)); }
  async sendTalk(text: string, attachments: Attachment[] = []) {
    const roomId = this.talkRoomId;
    const refs = this.talkRefs;
    if (!roomId || (!text.trim() && !refs.length && !attachments.length)) return;
    const objectId = roomKey(roomId);
    if (this.role === 'viewer' && this.room) await postMessage(this.room, this.invite, { objectId, author: this.nickname, authorId: this.myId, text: text.trim(), kind: 'chat', attachments, refs });
    else { this.project.addMessage(objectId, this.nickname, text.trim(), 'chat', attachments, refs, this.myId); this.syncTalks(); }
    this.talkRefs = [];
    this.markSeen(objectId);
  }
  /** 링크 누르기: 그 대상을 화면에 잡는다 (사진보드로, 고르고, 맞춘다) */
  focusRef(r: TalkRef) {
    if (this.view !== 'board') this.view = 'board';
    if (r.kind === 'object') {
      const o = this.objects.find((x) => x.id === r.id) ?? this.objects.find((x) => x.sameAs === r.id);
      if (!o) { this.notice = '지워진 사인물입니다.'; return; }
      this.talkSkipId = o.id;
      this.selectObject(o.id);
      this.reveal = { photoId: o.photoId, n: (this.reveal?.n ?? 0) + 1, objectId: o.id };
    } else if (r.kind === 'pin') {
      const pin = this.project.pin(r.id);
      if (!pin) { this.notice = '지워진 번호입니다.'; return; }
      this.reveal = { photoId: pin.photoId, n: (this.reveal?.n ?? 0) + 1, pinId: pin.id };
    } else {
      if (!this.photos.some((p) => p.id === r.id)) { this.notice = '지워진 사진입니다.'; return; }
      this.reveal = { photoId: r.id, n: (this.reveal?.n ?? 0) + 1 };
    }
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
    if (a) this.setNickname(a.name || this.nickname || a.email.split('@')[0], false); else this.client?.setName(this.nickname, this.myId);
  }

  async renameAccount(name: string) {
    this.applyAccount(await updateName(name));
  }

  async logout() {
    await apiLogout();
    this.account = null;
    this.sessionConflict = false;
    if (this.room) location.href = '/';
  }

  /** 대화·코멘트: viewer 는 서버 API 로, 그 외는 문서에 직접 */
  async sendMessage(objectId: string, text: string, kind: 'chat' | 'comment' | 'voice', attachments: Attachment[] = []) {
    if (this.role === 'viewer' && this.room) {
      await postMessage(this.room, this.invite, { objectId, author: this.nickname, authorId: this.myId, text, kind, attachments });
    } else {
      this.project.addMessage(objectId, this.nickname, text, kind, attachments, undefined, this.myId);
    }
  }

  /** 메시지(대화·코멘트·음성 메모) 지우기 (2026-10-18 사용자: "말풍선 안의 이전 녹음을 지울 수가 없다"): 편집 권한이면 아무 글이나 문서에서, viewer 는 자기 글만 서버로 */
  canDeleteMessage(m: Message): boolean { return this.canEdit || m.author === this.nickname; }
  async deleteMessage(m: Message) {
    if (!this.canDeleteMessage(m)) return;
    if (this.canEdit) { this.project.removeMessage(m.id); return; }
    if (this.room) await deleteMessage(this.room, this.invite, { id: m.id, author: this.nickname });
  }

  /** 사진 보드 위 내 커서 (world 좌표). null = 보드 밖 */
  setCursor(c: Cursor | null) {
    this.client?.setCursor(c);
  }

  setWarnMeasure(v: boolean) { this.warnMeasure = v; save('ganpanda.warnMeasure', v ? '1' : '0'); }

  setNickname(n: string, persist = true) {
    this.nickname = n;
    this.client?.setName(n, this.myId);
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
  /** 3D 글자·시트 면 축척용: 치수를 넣지 않은 사인물이면 실측 추정 치수, 넣었으면 null (2026-10-22 "3d에서 … 비정상적으로 커지는거") */
  estSize = (o: SignObject): { w: number; h: number } | null => { if (o.widthMm && o.heightMm) return null; const s = this.sizeOf(o); return s ? { w: s.w, h: s.h } : null; };
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
    ref: { axis: 'x', from: [w * 0.3, h * 0.7], to: [w * 0.55, h * 0.7], mm: 1000 }, // 시작도 원점에서 떨어뜨려 (2026-10-18)
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
    const html = await fetch('/', { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    if (!(await newVersionAvailable(document, async () => html))) return;
    if (!shouldAutoReload({ returned, busy: busy(), home: !app.room })) { app.updateAvailable = true; return; }
    // 같은 버전을 두고 되풀이 새로고침 금지 (2026-10-18 "모바일 재로딩으로 이 페이지를 열 수 없음")
    const store = { get: () => { try { return sessionStorage.getItem('ganpanda.reloadFor'); } catch { return null; } }, set: (v: string) => { try { sessionStorage.setItem('ganpanda.reloadFor', v); } catch { /* 저장 불가 */ } } };
    const plan = reloadPlan(bundleOf(html) ?? '', store);
    if (plan === 'reload') location.reload();
    else if (plan === 'reload-bust') location.replace(bustedUrl(location.href, bundleOf(html) ?? ''));
    else app.updateAvailable = true;
  };
  document.addEventListener('visibilitychange', () => check(true));
  window.addEventListener('pageshow', (e) => check(e.persisted));
  window.addEventListener('focus', () => check(false));
  setTimeout(() => check(false), 3_000);
}
