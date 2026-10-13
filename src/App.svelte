<script lang="ts">
  import { app, type ViewKind } from './lib/state.svelte';
  import BoardView from './lib/views/BoardView.svelte';
  import ListView from './lib/views/ListView.svelte';
  import UvView from './lib/views/UvView.svelte';
  import ObjectPanel from './lib/ui/ObjectPanel.svelte';
  import Settings from './lib/ui/Settings.svelte';
  import LoginDialog from './lib/ui/LoginDialog.svelte';
  import Home from './lib/ui/Home.svelte';
  import AccessDenied from './lib/ui/AccessDenied.svelte';
  import InviteDialog from './lib/ui/InviteDialog.svelte';
  import PinPanel from './lib/ui/PinPanel.svelte';
  import PricesDialog from './lib/ui/PricesDialog.svelte';
  import QuoteSheet from './lib/ui/QuoteSheet.svelte';
  import Letter3DDialog from './lib/ui/Letter3DDialog.svelte';
  import { ROLE_LABEL } from './lib/projects';
  import { formatBytes } from './lib/core/format';

  let accountOpen = $state(false);
  let nameDraft = $state('');
  async function saveName() {
    const n = nameDraft.trim();
    if (n && n !== app.account?.name) await app.renameAccount(n);
    accountOpen = false;
  }

  // 캔버스 밖에서도 브라우저 확대(Ctrl+휠·핀치)가 일어나지 않게 (xlpop 과 동일)
  $effect(() => {
    const block = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
      else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault(); // 가로 스와이프 뒤로가기 방지
    };
    document.addEventListener('wheel', block, { passive: false });
    return () => document.removeEventListener('wheel', block);
  });

  const VIEWS: { id: ViewKind; label: string }[] = [
    { id: 'board', label: '사진 보드' },
    { id: 'list', label: '사인물 리스트' },
    { id: 'uv', label: 'UV 뷰' },
  ];
  const PLAN_LABEL: Record<string, string> = { free: '무료', starter: '스타터', pro: '프로' };
  const SYNC_LABEL = { local: '로컬 저장', connecting: '연결 중…', online: '실시간 연결됨', offline: '오프라인 · 재연결 중' } as const;
  const warnCount = $derived([...app.measures.values()].filter((m) => m.warnings.length).length);
</script>

<div class="shell">
  <nav class="top">
    <a class="logo" href="/" data-testid="go-projects">간판다</a>
    {#if app.room && app.access.status === 'ok'}
      <span class="project" data-testid="project-title">{app.access.projectName}</span>
      <span class="role" data-testid="role-badge" data-role={app.role}>{ROLE_LABEL[app.role!]}</span>
      {#if app.role === 'owner'}<button class="btn small" data-testid="invite-button" onclick={() => (app.inviteOpen = true)}>초대 링크</button>{/if}
    {/if}
    <div class="views" class:hidden={!app.room || app.access.status !== 'ok'}>
      {#each VIEWS as v (v.id)}
        <button data-testid="view-{v.id}" class:on={app.view === v.id} onclick={() => (app.view = v.id)}>
          {v.label}
          {#if v.id === 'board' && app.unreadTotal}<span class="dot chat" data-testid="unread-total" title="안 읽은 메시지">💬 {app.unreadTotal}</span>{/if}
          {#if v.id === 'board' && warnCount}<span class="dot" title="실측 확인 필요">{warnCount}</span>{/if}
          {#if v.id === 'list' && app.objects.length}<span class="n">{app.objects.length}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="right">
      <button class="icon" data-testid="open-settings" title="설정 (단축키)" onclick={() => (app.settingsOpen = true)}>⚙</button>
      <span class="peers">
        {#each app.peers as p (p.name)}
          <span class="peer" data-testid="peer" title={p.name}><i style:background={p.color}></i>{p.name}</span>
        {/each}
      </span>
      {#if app.room}
        <span class="sync" data-testid="sync-status" data-status={app.sync} title={SYNC_LABEL[app.sync]}>● {SYNC_LABEL[app.sync]}</span>
      {/if}
      {#if app.account}
        <span class="account">
          <button class="who" data-testid="account-menu" onclick={() => { nameDraft = app.account!.name || app.nickname; accountOpen = !accountOpen; if (accountOpen) app.refreshMe(); }}>
            {app.account.name || app.nickname || app.account.email.split('@')[0]}
          </button>
          {#if accountOpen}
            <div class="menu" role="menu">
              <small>{app.account.email} · {PLAN_LABEL[app.account.plan] ?? app.account.plan}</small>
              {#if app.usage}
                <small data-testid="usage-storage">저장 용량 {formatBytes(app.usage.usage.storageBytes)} / {formatBytes(app.usage.limits.storageBytes)}</small>
                <small data-testid="usage-seats">동시접속 {app.usage.usage.seats} / {app.usage.limits.seats}명</small>
              {/if}
              <label>표시 이름
                <input data-testid="account-name" bind:value={nameDraft} onkeydown={(e) => { if (e.key === 'Enter') saveName(); }} onblur={saveName} />
              </label>
              <button class="btn small" data-testid="logout" onclick={() => { accountOpen = false; app.logout(); }}>로그아웃</button>
            </div>
          {/if}
        </span>
      {:else if app.authReady || app.sync === 'local'}
        <button class="who" data-testid="login-button" onclick={() => (app.loginOpen = true)}>로그인</button>
        <button class="icon small-name" title="이름만 설정 (로그인 없이)" onclick={() => { const n = prompt('표시 이름', app.nickname); if (n?.trim()) app.setNickname(n.trim()); }}>{app.nickname || '이름'}</button>
      {/if}
    </div>
  </nav>
  <!-- 알림 영역: 비어 있어도 항상 있어 그리드 행이 유지된다 -->
  <div class="banners">
    {#if app.seatLimit && app.sync !== 'online'}
      <div class="banner warn" data-testid="seat-limit">
        동시접속 한도({app.seatLimit.limit}명)에 도달해 연결을 기다리고 있습니다. 현재 {app.seatLimit.used}명 접속 중 — 자리가 나면 자동으로 연결됩니다. 더 많은 인원이 필요하면 요금제를 올려 주세요.
      </div>
    {/if}
    {#if app.notice}
      <div class="banner warn" data-testid="notice">{app.notice}<button class="icon" onclick={() => (app.notice = '')}>✕</button></div>
    {/if}
  </div>
  <main>
    {#if !app.room}
      <Home />
    {:else if app.access.status === 'denied'}
      <AccessDenied />
    {:else if app.access.status === 'ok'}
      <!-- 뷰는 전환해도 캔버스 위치를 유지하도록 숨김 처리 -->
      <div class="view" hidden={app.view !== 'board'}><BoardView /></div>
      {#if app.view === 'list'}<div class="view"><ListView /></div>{/if}
      {#if app.view === 'uv'}<div class="view"><UvView /></div>{/if}
      {#if app.selected && app.view === 'board'}
        {#key app.selected.id}<ObjectPanel obj={app.selected} />{/key}
      {:else if app.selectedPin && app.view === 'board'}
        {#key app.selectedPin.id}<PinPanel pin={app.selectedPin} />{/key}
      {/if}
    {/if}
  </main>
</div>
<div class="toasts">
  {#each app.toasts as t (t.id)}
    <button class="toast" data-testid="toast" onclick={() => app.openFromToast(t)}>
      <b>{t.author}</b><span>{t.text}</span>
    </button>
  {/each}
</div>
{#if app.settingsOpen}<Settings />{/if}
{#if app.loginOpen}<LoginDialog />{/if}
{#if app.inviteOpen}<InviteDialog />{/if}
{#if app.pricesOpen}<PricesDialog />{/if}
{#if app.quoteSheetOpen}<QuoteSheet />{/if}
{#if app.letter3dOpen && app.selected}{#key app.selected.id}<Letter3DDialog obj={app.selected} />{/key}{/if}

<style>
  .shell { display: grid; grid-template-rows: 48px auto 1fr; height: 100%; }
  .banner { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 8px 16px; font-size: 13px; }
  .banner.warn { background: rgba(255, 170, 0, 0.14); border-bottom: 1px solid rgba(255, 170, 0, 0.5); color: var(--text); }
  .top { display: flex; align-items: center; gap: 16px; padding: 0 14px; background: var(--panel); border-bottom: 1px solid var(--line); }
  .logo { font-weight: 800; color: var(--accent); font-size: 17px; letter-spacing: -0.5px; text-decoration: none; }
  .project { font-weight: 600; font-size: 14px; }
  .role { font-size: 11px; color: var(--muted); border: 1px solid var(--line); border-radius: 10px; padding: 1px 8px; }
  .views.hidden { visibility: hidden; }
  .views { display: flex; gap: 2px; background: var(--input); padding: 3px; border-radius: 9px; }
  .views button { background: none; border: 0; color: var(--muted); padding: 6px 14px; border-radius: 7px; font: inherit; font-size: 13px; cursor: pointer; display: flex; gap: 6px; align-items: center; }
  .views button.on { background: var(--panel); color: var(--text); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
  .dot { background: var(--warn); color: #000; border-radius: 9px; font-size: 10px; padding: 0 6px; font-weight: 700; }
  .dot.chat { background: var(--accent); }
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
  .menu { position: absolute; right: 0; top: 36px; width: 240px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.45); z-index: 20; }
  .menu small { color: var(--muted); font-size: 11px; }
  .small-name { font-size: 12px; }
  .who { background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 14px; padding: 4px 12px; font: inherit; font-size: 12px; cursor: pointer; }
  main { position: relative; overflow: hidden; }
  .view { position: absolute; inset: 0; }
  .view[hidden] { display: none; }
</style>
