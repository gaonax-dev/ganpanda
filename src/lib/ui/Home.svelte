<!-- 홈: 로그인하면 내 프로젝트 목록, 아니면 로그인 안내 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { createProject, listProjects, type ProjectInfo } from '../projects';

  let projects = $state<ProjectInfo[] | null>(null);
  let name = $state('');
  let busy = $state(false);

  $effect(() => {
    if (app.account) listProjects().then((p) => (projects = p)).catch(() => (projects = []));
    else projects = null;
  });

  async function create() {
    const n = name.trim();
    if (!n || busy) return;
    busy = true;
    try {
      const p = await createProject(n);
      location.href = `/?room=${p.id}`;
    } finally { busy = false; }
  }
  const date = (ts: number) => new Date(ts).toLocaleDateString('ko-KR');
</script>

<div class="home">
  {#if !app.authReady}
    <p class="hint">확인 중…</p>
  {:else if app.account}
    <section data-testid="project-list">
      <h1>내 프로젝트</h1>
      <form class="new" onsubmit={(e) => { e.preventDefault(); create(); }}>
        <input data-testid="new-project-name" placeholder="새 프로젝트 이름 (예: 간판다 카페)" bind:value={name} />
        <button class="btn primary" data-testid="new-project-submit" type="submit" disabled={busy || !name.trim()}>만들기</button>
      </form>
      {#if projects === null}
        <p class="hint">불러오는 중…</p>
      {:else if !projects.length}
        <p class="hint">아직 프로젝트가 없습니다. 매장 이름으로 첫 프로젝트를 만들어 보세요.</p>
      {:else}
        <ul>
          {#each projects as p (p.id)}
            <li><a data-testid="project-item" href="/?room={p.id}"><b>{p.name}</b><small>{date(p.createdAt)}</small></a></li>
          {/each}
        </ul>
      {/if}
    </section>
  {:else}
    <section class="landing">
      <h1>간판다</h1>
      <p>건물 사진 위에서 사인물을 함께 정하고 견적까지. 제작자는 로그인해 프로젝트를 만들고, 고객은 초대 링크로 들어옵니다.</p>
      <button class="btn primary" onclick={() => (app.loginOpen = true)}>이메일로 로그인</button>
    </section>
  {/if}
</div>

<style>
  .home { position: absolute; inset: 0; overflow-y: auto; display: flex; justify-content: center; padding: 48px 16px; }
  section { width: min(560px, 100%); }
  h1 { font-size: 22px; margin: 0 0 16px; }
  .new { display: flex; gap: 8px; margin-bottom: 18px; }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
  li a { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; color: var(--text); text-decoration: none; background: var(--panel); }
  li a:hover { border-color: var(--accent); }
  li small { color: var(--muted); }
  .landing { text-align: center; margin-top: 60px; }
  .landing p { color: var(--muted); line-height: 1.6; margin-bottom: 20px; }
</style>
