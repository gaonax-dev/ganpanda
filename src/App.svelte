<script lang="ts">
  import AskDialog from './lib/ui/AskDialog.svelte';
  import { askPrompt } from './lib/ui/ask.svelte';
  import { homeTalks } from './lib/ui/homeTalkList.svelte';
  import { saveRoomView } from './lib/core/roomView';
  import { app } from './lib/state.svelte';
  // 작업 탭을 이 기기에 기억 — 다시 열면 그 탭 (2026-10-25 "헤더 텝의 상태를 돌아왔을때 복원") · 복원은 state.svelte.ts 생성자
  $effect(() => { if (app.room && app.access.status === 'ok' && !app.proposalMode) saveRoomView(app.room, { tab: app.tab }); });
  import { PLAN_LABEL, fetchProviders, socialStartUrl, socialTarget, type SocialProvider } from './lib/auth';
  // 소비자 입구 로그인 (2026-10-21 "입구 카카오"): /estimate 는 로그인해야 보드가 열린다 — 카카오 기본
  let providers = $state<SocialProvider[]>([]);
  $effect(() => { if (app.consumer) fetchProviders().then((p) => (providers = p)); });
  import BoardView from './lib/views/BoardView.svelte';
  import ListView from './lib/views/ListView.svelte';
  import UvView from './lib/views/UvView.svelte';
  import ObjectPanel from './lib/ui/ObjectPanel.svelte';
  import ObjectChatPanel from './lib/ui/ObjectChatPanel.svelte';
  import Settings from './lib/ui/Settings.svelte';
  import LoginDialog from './lib/ui/LoginDialog.svelte';
  import PasswordDialog from './lib/ui/PasswordDialog.svelte';
  import Home from './lib/ui/Home.svelte';
  import AccessDenied from './lib/ui/AccessDenied.svelte';
  import InviteDialog from './lib/ui/InviteDialog.svelte';
  import VersionsDialog from './lib/ui/VersionsDialog.svelte';
  import PinPanel from './lib/ui/PinPanel.svelte';
  import TalkPanel from './lib/ui/TalkPanel.svelte';
  import QuickBar from './lib/ui/QuickBar.svelte';
  import { recording } from './lib/recording.svelte';
  import { recordingLabel } from './lib/core/attachments';

  // 휴대폰 녹음 (2026-10-18) — 말풍선 창과 같은 녹음 하나(lib/recording.svelte.ts, 2026-10-20). 선택이 풀리면 녹음 중이던 것은 버린다
  $effect(() => { if (!app.selectedId && !app.selectedPinId && recording.recorder) recording.cancel(); });
  import PricesDialog from './lib/ui/PricesDialog.svelte';
  import QuoteSheet from './lib/ui/QuoteSheet.svelte';
  import ObjectSettingsDialog from './lib/ui/ObjectSettingsDialog.svelte';
  import OrderDialog from './lib/ui/OrderDialog.svelte';
  import Loading from './lib/ui/Loading.svelte';
  import ProposalView from './lib/ui/ProposalView.svelte';
  import RequestView from './lib/ui/RequestView.svelte';
  import EstimateRequestDialog from './lib/ui/EstimateRequestDialog.svelte';
  import EstimateLock from './lib/ui/EstimateLock.svelte';
  import RequestBar from './lib/ui/RequestBar.svelte';
  import RequestInbox from './lib/ui/RequestInbox.svelte';
  import { ROLE_LABEL, updateProject } from './lib/projects';
  import { formatBytes } from './lib/core/format';

  // 무거운 창(three.js·폰트·렌더링)은 처음 열 때 따로 내려받는다 — 메인 번들을 가볍게 (2026-10-15 사용자: "모바일에서는 무겁다")
  const lazyRender = () => import('./lib/ui/RenderDialog.svelte');
  const lazyCamera = () => import('./lib/ui/CameraDialog.svelte');
  const lazyPhotoAdjust = () => import('./lib/ui/PhotoAdjustDialog.svelte');
  const lazyLetter3d = () => import('./lib/ui/Letter3DDialog.svelte');
  const lazyProposal = () => import('./lib/ui/ProposalDialog.svelte');

  let accountOpen = $state(false);
  let nameDraft = $state('');
  // 닉네임 메뉴는 바깥을 누르거나 Esc 로 닫힌다 (2026-10-22 "사용자 닉 클릭으로 나온 창은 다른 곳을 누르면 꺼지게")
  $effect(() => {
    if (!accountOpen) return;
    const down = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('.account')) accountOpen = false; };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') accountOpen = false; };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key); };
  });
  async function saveName() {
    const n = nameDraft.trim();
    if (n && n !== app.account?.name) await app.renameAccount(n);
    accountOpen = false;
  }

  // 리스트 뷰 견적 합계 = 계약 금액(자동): 소유자가 열어 둔 동안 바뀌면 1초 뒤 프로젝트에 저장 (홈 그룹 계산서가 읽는다)
  let quoteTimer = 0, lastSavedTotal = -1;
  $effect(() => {
    const total = app.quote.total;
    if (!app.room || app.role !== 'owner' || !app.ready) return;
    if (total === lastSavedTotal) return;
    clearTimeout(quoteTimer);
    quoteTimer = window.setTimeout(() => { lastSavedTotal = total; updateProject(app.room!, { quoteTotal: Math.round(total) }).catch(() => {}); }, 1000);
  });

  // 실측 상태 (2026-10-21 "사이즈가 입력되면 실측중 … 미측정/전체사인물수"): 사인물 수·미측정 수가 바뀌면 1초 뒤 프로젝트에 저장 (홈 카드가 읽는다, core/measureSummary.ts)
  let countTimer = 0, lastSavedCounts = '';
  $effect(() => {
    const total = app.signs.length, un = app.unmeasuredCount;
    if (!app.room || app.role !== 'owner' || !app.ready) return;
    const key = `${total}/${un}`;
    if (key === lastSavedCounts) return;
    clearTimeout(countTimer);
    countTimer = window.setTimeout(() => { lastSavedCounts = key; updateProject(app.room!, { signTotal: total, signUnmeasured: un }).catch(() => {}); }, 1000);
  });

  // 캔버스 밖에서도 브라우저 확대(Ctrl+휠·핀치)가 일어나지 않게 (xlpop 과 동일)
  $effect(() => {
    const block = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
      else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault(); // 가로 스와이프 뒤로가기 방지
    };
    // 캡처 단계 + window: 어떤 요소가 stopPropagation 해도, 어떤 상태(창·패널 열림)에서도 먼저 받는다
    window.addEventListener('wheel', block, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', block, { capture: true });
  });

  /** 휴대폰 폭에서는 짧은 라벨 (short) */
  // 작업 탭 (2026-10-22 "상단탭 실측,2d,3d,디자인,사인물리스트" — 테스트 이름은 예전 것을 그대로: 실측 view-board, 2D stage-2d, 3D stage-3d)
  const TABS: { id: 'measure' | '2d' | '3d' | 'design' | 'list'; tid: string; label: string; short: string }[] = [
    { id: 'measure', tid: 'view-board', label: '실측', short: '실측' },
    { id: '2d', tid: 'stage-2d', label: '2D', short: '2D' },
    { id: '3d', tid: 'stage-3d', label: '3D', short: '3D' },
    { id: 'design', tid: 'view-design', label: '디자인', short: '디자인' },
    { id: 'list', tid: 'view-list', label: '사인물리스트', short: '리스트' },
  ];
  const SYNC_LABEL = { local: '로컬 저장', connecting: '연결 중…', online: '실시간 연결됨', offline: '오프라인 · 재연결 중' } as const;
  const warnCount = $derived(app.warnMeasure ? [...app.measures.values()].filter((m) => m.warnings.length).length : 0);
  // 가게 사장 화면 색 (2026-10-22): :root.consumer 가 --accent 를 청록으로
  $effect(() => { document.documentElement.classList.toggle('consumer', app.consumerTheme && !app.outsourceParam); });
  // 견적 제안 화면은 파랑 (2026-10-22 "견적제안은 블루컬러로")
  $effect(() => { document.documentElement.classList.toggle('proposal', app.proposalMode); });
  // 실측 보기(받은 요청 보드)는 파랑 — 가져온 내 프로젝트는 노랑 (2026-10-22 "프로젝트가져오기 버튼을 사용하면 노랑색으로 변경하고 소비자 초대해 제안한다")
  $effect(() => { document.documentElement.classList.toggle('survey', !!app.requestView); });
  // 외주(B2B) 색 (2026-10-22): 외주 프로젝트·그 요청 보드는 핫핑크
  $effect(() => { document.documentElement.classList.toggle('outsource', app.outsourceParam || (app.access.status === 'ok' && !!app.access.outsource)); });
  // 휴대폰: 탭 = 속성창, 끌기 = 속성창 없음 (2026-10-22 "모바일에서 사인물을 선택하는 시기를 구분할 필요가 있다. 터치시 속성창 나온다. 터치드레그에는 속성창 나오지 않는다")
  // 사인물(사진 외곽선·손잡이·정면도 카드)에서 시작한 누름만 본다 — 8px 넘게 움직이면 끌기, 아니면 탭
  let gesture: { x: number; y: number; moved: boolean } | null = null;
  function gestureDown(e: PointerEvent) {
    if (!app.compact) return;
    const t = e.target as Element | null;
    gesture = t?.closest?.('g.sign, [data-testid="board-card"], [data-testid="board-standalone"]') ? { x: e.clientX, y: e.clientY, moved: false } : null;
    if (gesture) app.pressing = true;
  }
  function gestureMove(e: PointerEvent) {
    if (!gesture || gesture.moved || Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < 8) return;
    gesture.moved = true;
    app.dragHideId = app.selectedId;
  }
  function gestureUp() {
    if (gesture && !gesture.moved) app.dragHideId = null; // 탭 — 속성창
    gesture = null;
    app.pressing = false;
  }
  /** 정면도 카드 배열 막대 (2026-10-23): 배열 모드 · 사진 보드 · 편집 권한 */
  const flatBar = $derived(app.flatArrange && app.canEdit && app.view === 'board' && app.flatCards.length > 0);
</script>

<svelte:window onpointerdowncapture={gestureDown} onpointermovecapture={gestureMove} onpointerupcapture={gestureUp} onpointercancelcapture={gestureUp} />

<div class="shell">
  <!-- 고객용 제안 페이지에서는 작업용 상단 바를 숨긴다 (휴대폰 폭에서 넘치지 않게) -->
  <nav class="top" class:hidden={(app.proposalMode && !app.canEdit) || !!app.page || app.embed || (app.consumer && app.authReady && !app.account)} data-testid="top-nav">
    <a class="logo" href="/" data-testid="go-projects">간판다</a>
    {#if app.room && app.access.status === 'ok'}
      <span class="project" data-testid="project-title">{app.access.projectName}</span>
      {#if app.consumer}
        <!-- 소비자 견적 요청 모드 (2026-10-21): 사진·사각/타원·치수·메모 → [견적 요청]. 금액은 예시 단가 "참고 금액" -->
        <span class="role" data-testid="consumer-badge" title="로그인 없이 이 기기에만 저장됩니다. 금액은 참고용 예시 단가입니다">가게 사장 · 참고 금액</span>
{#if app.consumerLocked}<EstimateLock />{:else}<button class="btn small primary" data-testid="estimate-button" disabled={!app.photos.length} title={app.photos.length ? '그린 사인물과 사진으로 지역 간판집에 견적 요청' : '사진을 먼저 올려 주세요'} onclick={() => (app.estimateOpen = true)}>견적 요청</button>{/if}
      {:else}
      {#if app.access.outsource}<span class="b2b" data-testid="outsource-badge" title="다른 업체에 맡기는 외주 프로젝트">B2B 외주</span>{/if}
      {#if app.outsourceProject}{#if app.settings.estimateRequest}<EstimateLock />{:else}<button class="btn small primary" data-testid="outsource-request" disabled={!app.photos.length} title={app.photos.length ? '이 보드 그대로 다른 간판집에 외주 견적 요청' : '사진을 먼저 올려 주세요'} onclick={() => (app.estimateOpen = true)}>외주 요청</button>{/if}{/if}
      <span class="role" data-testid="role-badge" data-role={app.role}>{ROLE_LABEL[app.role!]}</span>
      {#if app.canEdit && !app.proposalMode && !app.compact}<button class="btn small" data-testid="versions-open" title="버전 기록 — 이전 상태로 되돌리기 (유료)" onclick={() => (app.versionsOpen = true)}>버전</button>{/if}
      {#if app.role === 'owner'}<button class="btn small" data-testid="invite-button" onclick={() => (app.inviteOpen = true)}>{app.compact ? '초대' : '초대 링크'}</button>{/if}
      {#if app.canEdit && !app.proposalMode}<button class="btn small primary" data-testid="proposal-button" onclick={() => (app.proposalOpen = true)}>{app.compact ? '제안' : '제안 보내기'}</button>{/if}
      {/if}
      {#if app.approval.status !== 'none'}<span class="approval" data-testid="approval-status" data-status={app.approval.status} title={app.approval.status === 'approved' ? `${app.approval.approval.by} 승인` : '승인 뒤 내용이 바뀜 — 재승인 필요'}>{app.approval.status === 'approved' ? (app.compact ? '✅' : `✅ 승인됨 · ${app.approval.approval.by}`) : app.compact ? '⚠' : '⚠ 변경됨 · 재승인 필요'}</span>{/if}
    {/if}
    {#if app.room && app.access.status === 'ok' && !app.proposalMode && (app.view === 'board' || app.view === 'uv')}
      <!-- 보드 단계: 원본(실측·편집) / 3D(합성 결과를 사진에 겹침) -->
      {#if app.compact && app.selected && app.canEdit && app.view === 'board'}
        <!-- 휴대폰: 사인물을 고르면 단계 자리에 복사·붙여넣기·복제 (2026-10-18 사용자) + 말풍선·정리·녹음 (같은 날: "상단 메뉴에 녹음 버튼 … 말풍선도 여기로 … 녹음이 맨 오른쪽 같은자리에 정리버튼") -->
        <!-- [다중] 복사 앞 (2026-10-19 사용자: "모바일에 다중선택 버튼 복사 앞에 그리고 다중 선택켜지면 말풍선 녹음 사라지게") -->
        <div class="views stage" data-testid="mobile-edit">
          <button data-testid="mobile-copy" title="복사" onclick={() => app.copySelected()}>복사</button>
          <button data-testid="mobile-paste" title="붙여넣기" disabled={!app.clipboard} onclick={() => app.pasteClipboard()}>붙여넣기</button>
          <button data-testid="mobile-duplicate" title="복제" onclick={() => (app.multiMode ? app.duplicateSelection() : app.duplicateSelected())}>복제</button>
          {#if !app.multiMode}
          <button data-testid="mobile-chat" title="말풍선 (이 사인물의 대화)" onclick={() => app.openChat(app.selected!.id)}>💬{#if app.unread[app.selected.sameAs ?? app.selected.id]}<span class="n">{app.unread[app.selected.sameAs ?? app.selected.id]}</span>{/if}</button>
          {/if}
          <!-- 다중 선택 중에는 [정리] 대신 아래 막대의 [마지막 사인물 ▾] — 끝내기는 [다중] 끄기 (2026-10-24 "정리버튼 대신") -->
          {#if !app.multiMode}<button data-testid="mobile-done" title="정리 — 선택을 풀고 편집을 마칩니다" onclick={() => { app.closeChat(); app.panelOpen = false; app.selectObject(null); }}>정리</button>{/if}
          {#if !app.multiMode}
          <button class="rec" class:on={!!recording.recorder} data-testid="mobile-record" title={recording.recorder ? '녹음 마침 — 음성 메모로 저장' : '녹음 — 이 사인물에 음성 메모'} disabled={recording.busy || (!!recording.recorder && recording.target !== (app.selected?.sameAs ?? app.selected?.id))} onclick={() => recording.toggle(app.selected!.sameAs ?? app.selected!.id)}>{recording.recorder ? recordingLabel(recording.sec) : '🎙 녹음'}</button>
          {/if}
        </div>
      {:else if flatBar}
      <!-- 정면도 카드 배열 도구 (2026-10-23 "글과 버튼들을 상단 헤더의 창으로 이동해줘 여기에 정면도 사인물 고정 토글버튼도"): 배열 모드일 때 작업 탭 자리에 -->
      <div class="views stage flatbar" data-testid="flat-bar" title="정면도 카드 배열 — 카드는 끌어서 배치(리스트와 같은 배치)">
        <button class="primary" data-testid="flat-rearrange" title="사진 순서대로, 사진 구도대로 다시 배열 (옆면·아랫면 사인물은 펴서)" onclick={() => app.arrangeFlatCards()}>재정렬</button>
        <span class="grp" title="카드 간격 (mm) — 바꾸면 그 간격으로 다시 배열">↔
          <button class="sq" data-testid="flat-gap-down" onclick={() => app.setFlatGap(app.flatGap - 50)}>−</button><span data-testid="flat-gap-value">{app.flatGap}</span><button class="sq" data-testid="flat-gap-up" onclick={() => app.setFlatGap(app.flatGap + 50)}>+</button>
        </span>
        <button data-testid="flat-lock" class:on={app.flatLocked} title={app.flatLocked ? '고정 풀기 — 카드를 끌어 옮길 수 있게' : '고정 — 카드를 끌어도 움직이지 않게 (모두에게 같음)'} onclick={() => app.setFlatLocked(!app.flatLocked)}>{app.flatLocked ? '🔒 고정' : '🔓 고정'}</button>
        <span class="grp" data-testid="flat-scale" title="평면 구역 전체 크기 (모두에게 같음)">
          <button class="sq" data-testid="flat-scale-down" title="작게" onclick={() => app.scaleFlat(1 / 1.25)}>−</button><span data-testid="flat-scale-value">{Math.round((app.flatScale / 0.1) * 100)}%</span><button class="sq" data-testid="flat-scale-up" title="크게" onclick={() => app.scaleFlat(1.25)}>+</button>
        </span>
        <button data-testid="flat-arrange-done" onclick={() => (app.flatArrange = false)}>완료</button>
      </div>
      {:else}
      {#if app.tab === 'design'}
      <!-- 디자인 탭 (2026-10-22 "디자인은 디자이너와 소통하는 곳으로 사진보드 그대로인데 사인물 디자인파일 연결하는 곳이다. 여기에 디자이너가 일러스트 파일도 올린다"):
           사진보드(2D) 그대로 + 디자인 파일 올리기 · 파일 보기·연결 · 고른 사인물에 연결 -->
      <div class="views stage designbar" data-testid="design-bar">
        {#if app.canEdit && !app.boardOnly}<label class="up" data-testid="design-upload" title="일러스트(.ai, PDF 호환)·PDF·SVG·그림">＋ {app.compact ? '파일' : '일러스트·SVG 올리기'}<input data-testid="design-upload-input" type="file" accept=".ai,.pdf,.svg,image/*" hidden onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) app.addSourceFile(f); e.currentTarget.value = ''; }} /></label>{/if}
        <button data-testid="view-uv" class:on={app.view === 'uv'} title="올린 디자인 파일을 보고 영역을 그려 사인물에 연결" onclick={() => { if (app.view === 'uv') { app.view = 'board'; } else { app.view = 'uv'; } }}>{app.view === 'uv' ? '← 사진보드' : `디자인 파일 ${app.sources.length}`}</button>
        {#if app.selected && app.view === 'board' && app.canEdit}<button data-testid="design-link-selected" title="이 사인물에 디자인 파일 영역 연결" onclick={() => (app.view = 'uv')}>이 사인물에 연결</button>{/if}
        {#if app.converting}<span class="muted">변환 중…</span>{/if}
      </div>
      {/if}
      {/if}
    {/if}
    <!-- 휴대폰: 사인물을 고르면 편집 막대(복사·붙여넣기·복제·정리)가 작업 탭 자리에 — 상단 바 높이가 그대로라 사진이 밀리지 않는다 (2026-10-22 "터치에 속성외에 화면 팬이 있는데 이것도 제거해줘") -->
    <div class="views" data-testid="work-tabs" class:hidden={flatBar || !app.room || app.access.status !== 'ok' || (app.proposalMode && !app.canEdit) || app.boardOnly || (app.compact && !!app.selected && app.canEdit && app.view === 'board' && !app.proposalMode)}>
      {#each TABS.filter((t) => (app.isCustomer ? t.id !== 'design' && (t.id !== 'list' || !!app.requestView) : true)) as t (t.id)}
        <button data-testid={t.tid} class:on={app.tab === t.id} title={t.id === 'measure' ? `실측 — 사진 그대로, 외곽선·치수만${app.unmeasuredCount ? ` · 미실측 ${app.unmeasuredCount}개 (가로·세로 미입력)` : ''}` : t.id === '2d' ? '바탕색·디자인·글자를 사진 위에 평면으로' : t.id === '3d' ? '사진 위 입체 합성' : t.id === 'design' ? '디자이너와 소통 — 사진보드 그대로, 사인물에 디자인 파일(일러스트·SVG) 연결' : ''} onclick={() => app.setTab(t.id)}>
          {app.compact ? t.short : t.label}
          {#if t.id === 'measure' && app.unreadTotal}<span class="dot chat" data-testid="unread-total" title="안 읽은 메시지">💬 {app.unreadTotal}</span>{/if}
          {#if t.id === 'measure' && warnCount}<span class="dot" title="실측 확인 필요">{warnCount}</span>{/if}
          {#if t.id === 'measure' && app.unmeasuredCount}<span class="dot" data-testid="unmeasured-count" title="가로·세로를 아직 넣지 않은 사인물">{app.unmeasuredCount}</span>{/if}
          {#if t.id === 'list' && app.signs.length}<span class="n">{app.signs.length}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="right">
      <!-- 받은 견적 요청 (2026-10-22 "헤더에 표시해도 될거 같아 그리고 페이지 이동해서 리스트 보이게"). 받은 요청 페이지 안에서는 감춘다 — 페이지에 받은/보낸 탭이 있다 ("견적요청 페이지에 견적요청 링크가 있는데 이건 감춰줘") -->
      <!-- 프로젝트 안에서는 감춘다 — 홈에서만 (2026-10-25 "프로젝트 뷰에서 요청 제거해주고 톡을 키워줘") -->
      {#if app.sentShown && !app.consumer && !app.inbox && !app.room}<a class="reqs sent" data-testid="request-sent-link" href="/requests?tab=sent" title="내가 보낸 견적·외주 요청 — 진행 중인 수">{app.compact ? '보냄' : '보낸 요청'} <b data-testid="sent-count">{app.sentCount}</b></a>{/if}
      {#if app.requestInboxShown && !app.consumer && !app.inbox && !app.room}<a class="reqs" class:hot={app.requestCount > 0} data-testid="request-inbox-link" href="/requests" title="받은 견적 요청 — 답 안 한 요청 수">{app.compact ? '요청' : '견적 요청'} <b data-testid="request-count">{app.requestCount}</b></a>{/if}
      <!-- 톡 (2026-10-22 "톡은 메인화면의 상단에 톡버튼") -->
      {#if app.room && app.access.status === 'ok' && !app.inbox}<button class="talkbtn" class:on={app.talkOpen} data-testid="talk-open" title="톡 — 회사 멤버·고객과 방별 대화" onclick={() => (app.talkOpen ? app.closeTalk() : app.openTalk())}>톡{#if app.talkUnreadInfo.total}<b data-testid="talk-unread">{app.talkUnreadInfo.total}</b>{/if}</button>
      <!-- 홈: 내 모든 프로젝트의 톡 목록 창 (2026-10-25 "메인화면에 톡을 헤더로 이동시키고 누르면 톡 목록으로") — 수는 새 대화가 있는 방 -->
      {:else if !app.room && app.account && !app.page && !app.inbox}<button class="talkbtn" class:on={homeTalks.open} data-testid="talk-open" title="톡 — 내 모든 프로젝트의 톡방" onclick={() => (homeTalks.open = !homeTalks.open)}>톡{#if homeTalks.newCount}<b data-testid="talk-unread">{homeTalks.newCount}</b>{/if}</button>{/if}
      <!-- 설정 ⚙ 는 로그인하면 닉네임 메뉴 안으로 (2026-10-22 "기어마크 설정버튼을 사용자닉에 메뉴로 추가") — 로그인 전에는 메뉴가 없어 여기 -->
      {#if !app.account}<button class="icon" data-testid="open-settings" title="설정 (단축키)" onclick={() => (app.settingsOpen = true)}>⚙</button>{/if}
      <span class="peers">
        {#each app.peers as p (p.name)}
          <span class="peer" data-testid="peer" title={p.name}><i style:background={p.color}></i>{p.name}</span>
        {/each}
      </span>
      {#if app.room}
        <span class="sync" data-testid="sync-status" data-status={app.sync} title={SYNC_LABEL[app.sync]}>● {app.compact ? '' : SYNC_LABEL[app.sync]}</span>
      {/if}
      {#if app.account}
        <span class="account">
          <button class="who" data-testid="account-menu" onclick={() => { nameDraft = app.account!.name || app.nickname; accountOpen = !accountOpen; if (accountOpen) app.refreshMe(); }}>
            {app.account.name || app.nickname || app.account.email.split('@')[0]}
          </button>
          {#if accountOpen}
            <div class="menu" role="menu" data-testid="account-menu-list">
              <small>{app.account.email} · {PLAN_LABEL[app.account.plan] ?? app.account.plan}</small>
              {#if app.usage}
                <small data-testid="usage-storage">저장 용량 {formatBytes(app.usage.usage.storageBytes)} / {formatBytes(app.usage.limits.storageBytes)}</small>
                <small data-testid="usage-members">멤버 {app.usage.usage.members} / {app.usage.limits.members}명</small>
                <small data-testid="usage-proposals">이번 달 제안 {app.usage.usage.proposals}{app.usage.limits.proposalsPerMonth === null ? '건' : ` / ${app.usage.limits.proposalsPerMonth}건`}</small>
              {/if}
              <label>표시 이름
                <input data-testid="account-name" bind:value={nameDraft} onkeydown={(e) => { if (e.key === 'Enter') saveName(); }} onblur={saveName} />
              </label>
              <button class="btn small" data-testid="open-settings" onclick={() => { accountOpen = false; app.settingsOpen = true; }}>⚙ 설정</button>
              <button class="btn small" data-testid="open-password" onclick={() => { accountOpen = false; app.passwordOpen = 'change'; }}>{app.account.hasPassword ? '비밀번호 바꾸기' : '비밀번호 만들기'}</button>
              <button class="btn small" data-testid="logout" onclick={() => { accountOpen = false; app.logout(); }}>로그아웃</button>
              <!-- 약관·개인정보 (2026-10-24 로그인 후 홈 푸터 대신) — 사업자 정보는 각 페이지 아래에 -->
              <nav class="legal" data-testid="account-legal"><a href="/pricing" target="_blank" rel="noopener">요금제</a><a href="/terms" target="_blank" rel="noopener">이용약관</a><a href="/refund" target="_blank" rel="noopener">환불 정책</a><a href="/privacy" target="_blank" rel="noopener"><b>개인정보처리방침</b></a></nav>
            </div>
          {/if}
        </span>
      {:else if app.authReady || app.sync === 'local'}
        <button class="who" data-testid="login-button" onclick={() => (app.loginOpen = true)}>로그인</button>
        <button class="icon small-name" title="이름만 설정 (로그인 없이)" onclick={async () => { const n = await askPrompt('표시 이름', app.nickname); if (n?.trim()) app.setNickname(n.trim()); }}>{app.nickname || '이름'}</button>
      {/if}
    </div>
  </nav>
  {#if app.requestView && app.room && app.access.status === 'ok'}<RequestBar />{/if}
  {#if app.access.status === 'ok' && app.access.lost && !app.proposalMode}
    <!-- 다른 간판집 확정 (2026-10-22): 변심할 수 있어 지우지 않고 정지 -->
    <div class="banner lost" data-testid="project-lost-banner">가게 사장님이 <b>다른 간판집과 진행</b>하기로 했습니다. 마음을 바꿔 다시 연락할 수 있어 프로젝트는 지우지 않고 <b>정지</b>로 두었습니다.</div>
  {:else if app.access.status === 'ok' && app.access.requestId && app.role === 'owner' && !app.settings.proposal && !app.proposalMode}
    <!-- 요청에서 가져온 프로젝트: 가게 사장님께 제안 (제안 링크 = 초대, 요청 페이지에 도착) -->
    <div class="banner next" data-testid="request-next">요청에서 가져온 프로젝트입니다. 견적을 정리한 뒤 <b>가게 사장님께 제안</b>을 보내면 요청 페이지에 바로 도착합니다. <button class="btn small primary" data-testid="request-propose" onclick={() => (app.proposalOpen = true)}>가게 사장님께 제안 보내기</button></div>
  {/if}
  <main>
    <!-- 알림 영역: 본문 위에 떠 있는 겹층 — 나타나고 사라져도 다른 요소가 밀리지 않는다 (2026-10-18 사용자: "동시접속 안내 … 화면이 재정렬되고 사라지면 다시 제위치로 간다. 이건 문제다") -->
    <div class="banners">
      {#if app.sessionConflict}
        <!-- 같은 아이디 동시 사용 (2026-10-21 "동시에 같은 아이디로 작동시 로그아웃 선택하도록 동시에 사용하지 않으면 로그인 유지") -->
        <div class="banner warn" data-testid="session-conflict">
          같은 아이디를 지금 3대 이상의 기기에서 쓰고 있습니다(2대까지 함께 쓸 수 있습니다). 어느 쪽을 로그아웃할까요?
          <button class="btn small primary" data-testid="conflict-logout-others" onclick={() => app.logoutOtherDevices()}>다른 곳 로그아웃</button>
          <button class="btn small" data-testid="conflict-logout-here" onclick={() => app.logout()}>여기서 로그아웃</button>
        </div>
      {/if}
      {#if app.updateAvailable}
        <div class="banner warn" data-testid="update-available">새 버전이 배포되었습니다. 새로고침하면 최신 기능이 적용됩니다. <button class="btn small primary" onclick={() => location.reload()}>새로고침</button><button class="icon" onclick={() => (app.updateAvailable = false)}>✕</button></div>
      {/if}
      {#if app.notice}
        <div class="banner warn" data-testid="notice">{app.notice}<button class="icon" onclick={() => (app.notice = '')}>✕</button></div>
      {/if}
    </div>
    {#if app.page === 'request-view'}
      <div class="proposal"><RequestView /></div>
    {:else if app.consumer && app.consumerBlocked}
      <!-- 간판집 계정은 가게 사장 견적 요청을 못 쓴다 (2026-10-22 "사업자는 소비자 등록이 안된다") -->
      <section class="gate" data-testid="consumer-blocked">
        <h1>간판집 계정입니다</h1>
        <p>간판집 계정은 가게 사장 견적 요청을 쓸 수 없습니다. 다른 업체에 맡기려면 프로젝트를 만들 때 <b>[외주]</b>에 체크하거나, 프로젝트 ⋯ → <b>[다른 업체에 외주 요청]</b>을 쓰세요.</p>
        <a class="btn primary" href="/">홈으로</a>
      </section>
    {:else if app.consumer && app.authReady && !app.account}
      <!-- 소비자 입구 (2026-10-21 "입구 카카오 견적요청 사본으로 자동입력"): 로그인 먼저, 그 뒤 보드 -->
      <section class="gate" data-testid="consumer-gate">
        <h1>간판 견적 요청</h1>
        <p>사진에 간판을 그려 참고 견적을 보고, 동네 간판집에 견적을 요청합니다. 먼저 <b>로그인</b>해 주세요 — 허위 요청을 막고, 받은 제안을 나중에 다시 볼 수 있게 하기 위해서입니다.</p>
        {#if providers.includes('kakao')}<a class="btn kakao big" data-testid="consumer-login-kakao" href={socialStartUrl('kakao', '/estimate')} target={socialTarget()}>카카오로 시작</a>{/if}
        <button class="btn" data-testid="consumer-login-other" onclick={() => (app.loginOpen = true)}>다른 방법으로 로그인</button>
        <p class="hint"><a href="/">간판집입니다 → 홈으로</a></p>
      </section>
    {:else if app.inbox}
      <RequestInbox />
    {:else if !app.room}
      <Home />
    {:else if app.access.status === 'denied'}
      <AccessDenied />
    {:else if app.access.status === 'ok' && app.proposalMode}
      <div class="proposal"><ProposalView /></div>
    {:else if app.access.status === 'ok'}
      <!-- 뷰는 전환해도 캔버스 위치를 유지하도록 숨김 처리 -->
      <!-- 고객(viewer)은 사진 보드만 (2026-10-16) -->
      <div class="view" hidden={app.view !== 'board' && !app.boardOnly}><BoardView /></div>
      {#if app.view === 'list' && !app.boardOnly}<div class="view"><ListView /></div>{/if}
      {#if app.view === 'uv' && !app.isCustomer}<div class="view"><UvView /></div>{/if}
      {#if app.talkOpen}
        <!-- 톡이 열려 있으면 사인물을 골라도 속성창 대신 대화 링크로 (2026-10-22) -->
        <TalkPanel />
      {:else if app.selected && app.chatObjectId === app.selected.id && app.view === 'list'}
        <!-- 리스트 뷰의 정면도 말풍선에서 연 대화 (2026-10-18) -->
        {#key app.selected.id}<ObjectChatPanel obj={app.selected} />{/key}
      {:else if app.selected && (app.view === 'board' || app.boardOnly)}
        <!-- 휴대폰 폭: 빠른 막대(치수 입력)만, [속성]을 누르면 전체 패널 -->
        <!-- 빠른 막대는 key 없이: 사이즈 입력 줄을 연 채 다음 사인물로 넘어갈 수 있게 -->
        {#if app.chatObjectId === app.selected.id}{#key app.selected.id}<ObjectChatPanel obj={app.selected} />{/key}
        {:else if app.compact && !app.panelOpen}
          <!-- 누르는 동안·끌어서 고른 것은 숨김 — 뗄 때(탭) 나온다 (2026-10-22 "터치 업에 속성창나오게"). 지우지 않고 숨겨 사이즈 입력 줄 등 상태는 그대로 -->
          <div class="qb" hidden={app.pressing || app.dragHideId === app.selected.id}><QuickBar obj={app.selected} /></div>
        {:else}{#key app.selected.id}<ObjectPanel obj={app.selected} />{/key}{/if}
      {:else if app.selectedPin && app.view === 'board'}
        {#key app.selectedPin.id}<PinPanel pin={app.selectedPin} />{/key}
      {/if}
    {/if}
  </main>
</div>
<!-- 원근 완성 안내 (2026-10-20 "화면 기준으로 휘발성 안내"): 화면 위쪽 가운데, 다른 요소를 밀지 않고 누르기를 막지 않으며 잠깐 뒤 사라진다 -->
{#if app.flash}
  {#key app.flash.seq}<div class="flash" data-testid="perspective-done" role="status" aria-live="polite">{app.flash.text}</div>{/key}
{/if}
<div class="toasts">
  {#each app.toasts as t (t.id)}
    <button class="toast" data-testid="toast" onclick={() => app.openFromToast(t)}>
      <b>{t.author}</b><span>{t.text}</span>
    </button>
  {/each}
</div>
{#if app.settingsOpen}<Settings />{/if}
{#if app.estimateOpen && (app.consumer || app.outsourceProject)}<EstimateRequestDialog />{/if}
{#if app.loginOpen}<LoginDialog />{/if}
<AskDialog />
{#if app.passwordOpen && app.account}<PasswordDialog />{/if}
{#if app.inviteOpen}<InviteDialog />{/if}
{#if app.versionsOpen && app.room}<VersionsDialog />{/if}
{#if app.pricesOpen}<PricesDialog />{/if}
{#if app.quoteSheetOpen && !app.noPrices}<QuoteSheet />{/if}
{#if app.orderOpen && !app.noPrices}<OrderDialog />{/if}
{#if app.proposalOpen}{#await lazyProposal()}<Loading text="제안 도구 불러오는 중…" />{:then m}<m.default />{/await}{/if}
{#if app.adjustPhoto}{#key app.adjustPhoto.id}{#await lazyPhotoAdjust()}<Loading text="이미지 조절 불러오는 중…" />{:then m}<m.default photo={app.adjustPhoto} />{/await}{/key}{/if}
{#if app.cameraPhoto && app.cameraDraft}{#key app.cameraPhoto.id}{#await lazyCamera()}<Loading text="원근 맞추기 불러오는 중…" />{:then m}<m.default photo={app.cameraPhoto} />{/await}{/key}{/if}
{#if app.objectSettingsOpen && app.selected}{#key app.selected.id}<ObjectSettingsDialog obj={app.selected} />{/key}{/if}
{#if app.renderPhotoId}{@const rp = app.photos.find((p) => p.id === app.renderPhotoId)}{#if rp}{#key rp.id}{#await lazyRender()}<Loading text="렌더링 불러오는 중…" />{:then m}<m.default photo={rp} />{/await}{/key}{/if}{/if}
{#if app.letter3dOpen && app.selected}{#key app.selected.id}{#await lazyLetter3d()}<Loading text="입체 보기 불러오는 중…" />{:then m}<m.default obj={app.selected} />{/await}{/key}{/if}
<!-- 방 확인·문서 불러오기 동안 로딩 표시 -->
{#if app.room && app.access.status === 'loading'}<Loading text="프로젝트 확인 중…" />{:else if app.room && app.access.status === 'ok' && !app.ready}<Loading text="프로젝트 불러오는 중…" />{/if}

<style>
  .proposal { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; }
  .gate { max-width: 420px; margin: 60px auto; padding: 0 16px; display: flex; flex-direction: column; gap: 12px; text-align: center; }
  .gate h1 { margin: 0; font-size: 22px; }
  .gate p { margin: 0; color: var(--muted); line-height: 1.6; font-size: 14px; }
  .gate .btn { justify-content: center; text-decoration: none; font-weight: 700; }
  .gate .big { padding: 12px; font-size: 15px; }
  .gate .kakao { background: #fee500; color: #191919; border-color: #fee500; }
  .gate .hint a { color: var(--muted); }
  .approval { font-size: 12px; color: var(--ok); white-space: nowrap; }
  .approval[data-status='changed'] { color: var(--warn); }
  /* 안전 영역 (2026-10-24 iOS 앱: 노치·홈 바와 겹치지 않게) — 브라우저에선 0 */
  .shell { display: grid; grid-template-rows: auto 1fr; height: 100%; overflow-x: hidden; box-sizing: border-box; padding-top: env(safe-area-inset-top, 0px); }
  /* 상단 바를 숨겨도 행 배치가 밀리지 않게 행을 고정 */
  .top { grid-row: 1; } main { grid-row: 2; }
  .top.hidden { display: none; }
  /* 알림은 본문 위 겹층: 흐름 밖(absolute)이라 나타나고 사라져도 아래 요소가 밀리지 않는다 (2026-10-18) */
  .banners { position: absolute; left: 0; right: 0; top: env(safe-area-inset-top, 0px); z-index: 40; display: flex; flex-direction: column; pointer-events: none; }
  .banner { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 8px 16px; font-size: 13px; pointer-events: auto; }
  .banner.warn { background: rgba(60, 46, 10, 0.96); border-bottom: 1px solid rgba(255, 170, 0, 0.5); color: var(--text); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35); }
  /* 넘치면 옆으로 민다 (2026-10-25 폴더블 가로 ~830px 에서 오른쪽이 잘렸다) — 막대는 숨김 */
  .top { display: flex; align-items: center; gap: 16px; padding: 0 14px; min-height: 48px; background: var(--panel); border-bottom: 1px solid var(--line); overflow-x: auto; overflow-y: hidden; white-space: nowrap; scrollbar-width: none; }
  .top::-webkit-scrollbar { display: none; }
  .project { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .logo { font-weight: 800; color: var(--accent); font-size: 17px; letter-spacing: -0.5px; text-decoration: none; }
  .project { font-weight: 600; font-size: 14px; }
  .role { font-size: 11px; color: var(--muted); border: 1px solid var(--line); border-radius: 10px; padding: 1px 8px; }
  .views.hidden { visibility: hidden; }
  .views button.rec.on { background: rgba(255, 70, 70, 0.22); color: #ff8080; font-variant-numeric: tabular-nums; }
  .views button .n { font-size: 11px; background: var(--accent); color: #fff; border-radius: 8px; padding: 0 5px; }
  .views { display: flex; gap: 2px; background: var(--input); padding: 3px; border-radius: 9px; }
  .views button { background: none; border: 0; color: var(--muted); padding: 6px 14px; border-radius: 7px; font: inherit; font-size: 13px; cursor: pointer; display: flex; gap: 6px; align-items: center; }
  .views button.on { background: var(--panel); color: var(--text); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
  .dot { background: var(--warn); color: #000; border-radius: 9px; font-size: 10px; padding: 0 6px; font-weight: 700; }
  .dot.chat { background: var(--accent); }
  .flash { position: fixed; left: 50%; top: 64px; transform: translateX(-50%); z-index: 45; pointer-events: none; padding: 10px 20px; border-radius: 999px; white-space: nowrap; max-width: calc(100vw - 32px); overflow: hidden; text-overflow: ellipsis;
    background: rgba(22, 12, 44, 0.92); color: #efe8ff; font-size: 15px; font-weight: 600; letter-spacing: 0.03em; text-shadow: 0 0 8px #b39dff;
    border: 1px solid rgba(185, 164, 255, 0.6); box-shadow: 0 0 24px rgba(160, 130, 255, 0.55), 0 8px 30px rgba(0, 0, 0, 0.45); animation: flash-in 3.2s ease-out both; }
  @keyframes flash-in { 0% { opacity: 0; transform: translate(-50%, -12px) scale(0.96); } 10% { opacity: 1; transform: translate(-50%, 0) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .flash { animation: none; } }
  /* 톡은 크게 — 누르기 쉽게 (2026-10-25 "톡을 키워줘") */
  .talkbtn { background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 18px; padding: 7px 18px; min-height: 38px; font: inherit; font-size: 15px; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; }
  .talkbtn.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
  .talkbtn b { background: #ef4444; color: #fff; border-radius: 10px; padding: 0 7px; font-size: 12px; }
  .toasts { position: fixed; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; z-index: 40; }
  .toast { display: flex; flex-direction: column; gap: 2px; text-align: left; width: 300px; background: var(--panel); border: 1px solid var(--accent); border-radius: 10px; padding: 10px 12px; color: var(--text); font: inherit; font-size: 13px; cursor: pointer; box-shadow: 0 10px 30px rgba(0,0,0,0.45); }
  .toast span { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .n { color: var(--muted); font-size: 11px; }
  .right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
  .sync { font-size: 12px; color: var(--muted); }
  .sync[data-status='online'] { color: var(--ok); }
  .sync[data-status='offline'] { color: var(--warn); }
  .peers { display: flex; gap: 6px; }
  .peer { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; background: var(--input); border: 1px solid var(--line); border-radius: 12px; padding: 2px 9px 2px 6px; }
  .peer i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .account { position: relative; }
  /* 상단 바(.top)가 overflow: hidden 이라 absolute 면 잘려 로그아웃이 안 보였다(휴대폰, 2026-10-21) → fixed 로 바 바깥에 */
  .menu { position: fixed; right: 10px; top: 44px; width: 240px; max-width: calc(100vw - 20px); background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.45); z-index: 20; }
  .menu small { color: var(--muted); font-size: 11px; }
  .menu .legal { display: flex; flex-wrap: wrap; gap: 2px 10px; padding-top: 6px; border-top: 1px solid var(--line); font-size: 11px; }
  .menu .legal a { color: var(--muted); }
  .small-name { font-size: 12px; }
  .who { background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 14px; padding: 4px 12px; font: inherit; font-size: 12px; cursor: pointer; }
  main { position: relative; overflow: hidden; }
  .view { position: absolute; inset: 0; }
  .view[hidden] { display: none; }
  /* (스타일 끝에 두어 같은 우선순위의 위 규칙들을 덮는다) */
  /* 휴대폰 폭: 두 줄(위 = 프로젝트·버튼·계정, 아래 = 뷰 탭), 라벨은 축약, 접속자·역할은 숨김 */
  @media (max-width: 720px) {
    .top { flex-wrap: wrap; gap: 6px 4px; padding: 6px 8px; }
    /* 위 줄은 한 줄로 (2026-10-22 "모바일 헤더 최상단이 2줄이 되었다. 한줄로"): 프로젝트 이름이 먼저 줄어든다(기준 폭 0 — 줄바꿈 계산에 안 잡히게), 알약은 아이콘+숫자, 숨은 탭은 자리도 없게 */
    .project { flex: 1 1 0; min-width: 40px; max-width: 40vw; font-size: 13px; }
    .views.hidden { display: none; }
    .right { min-width: 0; }
    .role, .peers { display: none; }
    .views { order: 10; flex-basis: 100%; justify-content: stretch; height: 38px; box-sizing: border-box; } /* 탭 줄과 편집 막대 줄 높이를 같게 — 바뀌어도 사진이 밀리지 않게 (2026-10-22) */
    .views.stage { order: 11; }
    .views button { flex: 1; justify-content: center; padding: 6px 8px; }
    .right { gap: 4px; }
    .who { max-width: 90px; overflow: hidden; text-overflow: ellipsis; }
    .toasts { left: 12px; right: 12px; bottom: 76px; }
    .flash { top: 136px; font-size: 14px; } /* 휴대폰: 여러 줄 상단 바 아래 */
    .toast { width: auto; }
  }
  .reqs { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); text-decoration: none; border: 1px solid var(--line); border-radius: 999px; padding: 3px 4px 3px 10px; white-space: nowrap; }
  .reqs b { background: var(--input); color: var(--text); border-radius: 999px; padding: 0 7px; font-size: 12px; }
  .reqs.hot { color: var(--text); border-color: var(--accent); }
  .reqs.hot b { background: var(--accent); color: var(--accent-ink); }
  .b2b { font-size: 11px; font-weight: 700; color: var(--accent-ink); background: var(--accent); border-radius: 999px; padding: 2px 8px; white-space: nowrap; }
  .banner.next { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 12px; background: var(--panel); border-bottom: 1px solid var(--line); font-size: 13px; }
  .banner.lost { justify-content: flex-start; padding: 8px 12px; background: var(--panel); border-bottom: 1px solid var(--line); font-size: 13px; color: var(--muted); }
  /* 휴대폰: 견적 요청 알약은 짧게 — 위 .reqs 기본 규칙보다 뒤에 둬야 이긴다 (2026-10-22 "모바일 헤더 최상단이 2줄") */
  @media (max-width: 720px) {
    .reqs { padding: 1px 2px 1px 6px; gap: 3px; font-size: 11px; }
    .reqs b { padding: 0 5px; font-size: 11px; }
    .talkbtn { padding: 1px 5px; font-size: 11px; gap: 3px; }
    .views.flatbar { flex: 1 1 100%; overflow-x: auto; gap: 4px; } .views.flatbar button { padding: 6px 7px; }
    .talkbtn b { padding: 0 4px; font-size: 10px; }
  }
  .qb[hidden] { display: none; }
  .designbar .up { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 7px; font-size: 13px; color: var(--accent); cursor: pointer; font-weight: 600; }
  .views.flatbar { gap: 2px; align-items: center; flex-wrap: nowrap; flex: 0 0 auto; overflow: visible; } /* 데스크톱: 막대는 줄지 않고 프로젝트 이름이 먼저 준다 */
  .flatbar .grp { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; color: var(--muted); white-space: nowrap; }
  .flatbar .grp span { color: var(--text); min-width: 32px; text-align: center; }
  .views.flatbar button { padding: 4px 8px; font-size: 12px; }
  .views.flatbar .sq { width: 22px; padding: 4px 0; justify-content: center; }
  .flatbar .grp span { min-width: 30px; }
  .flatbar .primary { background: var(--accent); color: var(--accent-ink); font-weight: 700; }
  .flatbar button.on { background: var(--accent); color: var(--accent-ink); }
  .designbar .muted { color: var(--muted); font-size: 12px; align-self: center; }
</style>
