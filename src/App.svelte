<script lang="ts">
  import { app, type ViewKind } from './lib/state.svelte';
  import BoardView from './lib/views/BoardView.svelte';
  import ListView from './lib/views/ListView.svelte';
  import UvView from './lib/views/UvView.svelte';
  import ObjectPanel from './lib/ui/ObjectPanel.svelte';
  import Settings from './lib/ui/Settings.svelte';

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
  const warnCount = $derived([...app.measures.values()].filter((m) => m.warnings.length).length);
</script>

<div class="shell">
  <nav class="top">
    <span class="logo">간판다</span>
    <div class="views">
      {#each VIEWS as v (v.id)}
        <button data-testid="view-{v.id}" class:on={app.view === v.id} onclick={() => (app.view = v.id)}>
          {v.label}
          {#if v.id === 'board' && warnCount}<span class="dot" title="실측 확인 필요">{warnCount}</span>{/if}
          {#if v.id === 'list' && app.objects.length}<span class="n">{app.objects.length}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="right">
      <button class="icon" data-testid="open-settings" title="설정 (단축키)" onclick={() => (app.settingsOpen = true)}>⚙</button>
      <span class="sync" title="실시간 서버 연결은 다음 단계">● 로컬 저장</span>
      <button class="who" onclick={() => { const n = prompt('표시 이름', app.nickname); if (n?.trim()) app.setNickname(n.trim()); }}>
        {app.nickname || '이름 설정'}
      </button>
    </div>
  </nav>
  <main>
    <!-- 뷰는 전환해도 캔버스 위치를 유지하도록 숨김 처리 -->
    <div class="view" hidden={app.view !== 'board'}><BoardView /></div>
    {#if app.view === 'list'}<div class="view"><ListView /></div>{/if}
    {#if app.view === 'uv'}<div class="view"><UvView /></div>{/if}
    {#if app.selected && app.view === 'board'}
      {#key app.selected.id}<ObjectPanel obj={app.selected} />{/key}
    {/if}
  </main>
</div>
{#if app.settingsOpen}<Settings />{/if}

<style>
  .shell { display: grid; grid-template-rows: 48px 1fr; height: 100%; }
  .top { display: flex; align-items: center; gap: 16px; padding: 0 14px; background: var(--panel); border-bottom: 1px solid var(--line); }
  .logo { font-weight: 800; color: var(--accent); font-size: 17px; letter-spacing: -0.5px; }
  .views { display: flex; gap: 2px; background: var(--input); padding: 3px; border-radius: 9px; }
  .views button { background: none; border: 0; color: var(--muted); padding: 6px 14px; border-radius: 7px; font: inherit; font-size: 13px; cursor: pointer; display: flex; gap: 6px; align-items: center; }
  .views button.on { background: var(--panel); color: var(--text); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
  .dot { background: var(--warn); color: #000; border-radius: 9px; font-size: 10px; padding: 0 6px; font-weight: 700; }
  .n { color: var(--muted); font-size: 11px; }
  .right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
  .sync { font-size: 12px; color: var(--muted); }
  .who { background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 14px; padding: 4px 12px; font: inherit; font-size: 12px; cursor: pointer; }
  main { position: relative; overflow: hidden; }
  .view { position: absolute; inset: 0; }
  .view[hidden] { display: none; }
</style>
