<script lang="ts">
  // 받은 견적 요청 페이지 (/requests, 2026-10-22 사용자: "견적요청표시가 메인에 있는데 헤더에 표시해도 될거 같아 그리고 페이지 이동해서 리스트 보이게"):
  // 헤더의 "견적 요청 N" 을 누르면 여기로. 목록은 이름·사인물 정보만, 누르면 요청 보드(복제), 단추는 [견적 넣기] 하나
  import { app } from '../state.svelte';
  import { listRequests, respondRequest, type ShopRequest } from '../requests';
  let requests = $state<ShopRequest[]>([]);
  let loaded = $state(false);
  let responding = $state('');
  $effect(() => { if (app.account) listRequests().then((rs) => { requests = rs; loaded = true; }).catch(() => (loaded = true)); });
  const unanswered = $derived(requests.filter((r) => r.status === 'open' && !r.responded).length);
  const date = (ts: number) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  async function respond(r: ShopRequest) {
    if (responding) return;
    responding = r.id;
    try { const p = await respondRequest(r.id, 'copy'); location.href = `/?room=${p.id}`; }
    catch (e) { app.notice = e instanceof Error ? e.message : String(e); responding = ''; }
  }
</script>

<div class="page" data-testid="request-list">
  <header>
    <h1>받은 견적 요청 {#if unanswered}<small class="hot" data-testid="request-unanswered">답 안 한 {unanswered}건</small>{/if}</h1>
    <p class="hint">{app.account?.operator ? '모든 지역 (운영자)' : app.requestSettings?.regions.join(', ') || '지역을 정하지 않았습니다'} · <button class="link" onclick={() => (app.settingsOpen = 'requests')}>요청 받기 설정</button></p>
  </header>
  {#if !app.account}<p class="hint">로그인하면 받은 요청이 보입니다.</p>
  {:else if !loaded}<p class="hint">불러오는 중…</p>
  {:else}
        {#each requests as r (r.id)}
          <!-- 이름·사인물 정보만, 누르면 요청 그대로의 보드(복제)가 바로 열린다, 단추는 [견적 넣기] 하나 (2026-10-22) -->
          {@const sized = (r.signs ?? []).filter((s) => s.widthMm && s.heightMm)}
          <div class="rcard" class:open={!!r.snapshot} data-testid="request-item" data-status={r.status} data-responded={r.responded} role="link" tabindex="0"
            onclick={() => { if (r.snapshot) location.href = `/?room=${r.snapshot.project}&request=${r.id}`; }} onkeydown={(e) => { if (e.key === 'Enter' && r.snapshot) location.href = `/?room=${r.snapshot.project}&request=${r.id}`; }}>
            <div class="rbody">
              <span><b>{r.store}</b> {#if r.bizVerified}<span class="biz" data-testid="request-biz">✓ 사업자 확인</span>{:else if r.bizStatus === 'active'}<span class="biz" data-testid="request-biz">✓ 번호 확인</span>{/if}{#if r.general}<span class="tag" data-testid="request-general">일반 주문</span>{/if}{#if r.status === 'cancelled'}<span class="tag off" data-testid="request-cancelled">취소됨</span>{/if} <span class="muted">{r.region} · {date(r.createdAt)}{r.status === 'approved' ? ' · 승인됨' : ''}</span></span>
              <p class="muted" data-testid="request-signs">✎ 사인물 {r.signs?.length ?? 0}개 · 치수 {sized.length}개{#if sized.length} — {sized.slice(0, 3).map((s) => `${s.name} ${s.widthMm!.toLocaleString()}×${s.heightMm!.toLocaleString()}`).join(', ')}{sized.length > 3 ? ' …' : ''}{/if}</p>
              {#if r.responded}<p data-testid="request-phone">📞 {r.phone}{r.email ? ` · ${r.email}` : ''} <span class="muted">— 견적을 보냈습니다</span></p>{/if}
            </div>
            <div class="ract">
              {#if r.projectId && r.status !== 'cancelled'}
                <a class="btn small" data-testid="request-open" href="/?room={r.projectId}" onclick={(e) => e.stopPropagation()}>내 견적 열기</a>
              {:else if r.status !== 'cancelled'}
                <button class="btn small primary" data-testid="request-respond" disabled={responding === r.id} onclick={(e) => { e.stopPropagation(); respond(r); }}>견적 넣기</button>
              {/if}
            </div>
          </div>
        {:else}
          <p class="hint" data-testid="request-empty">{app.account?.operator ? '아직 받은 요청이 없습니다 — 가게 사장이 [가게 사장입니다 → 견적 요청]으로 보내면 모든 지역의 요청이 여기에 나타납니다(운영자).' : '아직 이 지역의 요청이 없습니다.'}</p>
        {/each}
  {/if}
</div>

<style>
  .page { max-width: 760px; margin: 0 auto; padding: 16px 16px 60px; color: var(--text); }
  h1 { font-size: 18px; margin: 4px 0; display: flex; align-items: center; gap: 8px; }
  h1 .hot { font-size: 12px; font-weight: 600; color: var(--accent-ink); background: var(--accent); border-radius: 999px; padding: 1px 8px; }
  .hint { color: var(--muted); font-size: 12px; margin: 0 0 8px; }
  .link { background: none; border: 0; color: var(--accent); cursor: pointer; padding: 0; font-size: 12px; }
  .rcard { display: flex; gap: 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin: 8px 0; }
  .rcard.open { cursor: pointer; }
  .rcard.open:hover { border-color: var(--accent); }
  .rbody { display: flex; flex-direction: column; gap: 4px; font-size: 13px; min-width: 0; }
  .rbody p { margin: 0; }
  .muted { color: var(--muted); }
  .biz { color: var(--ok); font-size: 11px; border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; }
  .tag { font-size: 11px; border-radius: 999px; padding: 1px 7px; border: 1px solid var(--line); color: var(--muted); margin-left: 4px; }
  .tag.off { color: var(--danger); border-color: var(--danger); }
  .ract { margin-left: auto; display: flex; align-items: center; }
  a.btn { text-decoration: none; }
</style>
