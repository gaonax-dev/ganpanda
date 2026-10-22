<script lang="ts">
  // 간판집이 받은 요청을 열었을 때 (2026-10-22 사용자: "사업자는 페이지에서도 리스트는 이름 사인물 정보만 표시하고 클릭하면 복제된 페이지 바로보이게 해줘 그리고 견적넣기 버튼만 있으면 될거 같아"):
  // 요청 프로젝트(보드 복제, 읽기 전용 = 실측 보기) 위에 요청 정보 한 줄 + [내 프로젝트로 가져오기] — 누르면 요청 그대로 복제해 연다 (2026-10-22)
  import { app } from '../state.svelte';
  import { bizDocUrl, listRequests, respondRequest, type ShopRequest } from '../requests';

  let req = $state<ShopRequest | null>(null);
  let busy = $state(false);
  $effect(() => { if (app.requestView) listRequests().then((rs) => (req = rs.find((r) => r.id === app.requestView) ?? null)).catch(() => undefined); });
  async function quote() {
    if (!req || busy) return;
    busy = true;
    try { const p = await respondRequest(req.id, 'copy'); location.href = `/?room=${p.id}`; }
    catch (e) { app.notice = e instanceof Error ? e.message : String(e); busy = false; }
  }
</script>

{#if req}
  <div class="bar" data-testid="request-bar">
    <div class="info">
      <b>{req.store}</b>{#if req.b2b}<span class="b2b" data-testid="request-b2b">B2B</span>{/if}
      {#if req.bizVerified}<span class="biz" data-testid="request-biz">✓ 사업자 확인</span>{:else if req.general}<span class="tag">일반 주문</span>{/if}
      <span class="muted" data-testid="request-address">{req.address || req.region}</span>
      {#if req.text}<span class="text" data-testid="request-text">“{req.text}”</span>{/if}
      {#if req.bizDoc}<span class="muted" data-testid="request-bizdoc">📄 사업자등록증 {#if req.responded}<a href={bizDocUrl(req.id)} target="_blank" rel="noopener">열기</a>{:else}— 견적을 넣으면 열립니다{/if}</span>{/if}
    </div>
    <!-- 견적 요청서 = 사인물 리스트 뷰 (2026-10-22 "견적요청서 리스트가 있어야 견적이 쉽다" → "모바일에서는 문제가 있는데 사인물 리스트를 사용하면 안되나?") -->
    <button class="btn small" class:on={app.view === 'list'} data-testid="request-sheet-toggle" onclick={() => (app.view = app.view === 'list' ? 'board' : 'list')}>{app.view === 'list' ? '사진 보드' : `요청서 리스트 (${app.signs.length})`}</button>
    {#if req.status === 'cancelled'}<span class="muted">취소된 요청</span>
    {:else if req.projectId}<a class="btn small primary" data-testid="request-open" href="/?room={req.projectId}">내 프로젝트 열기</a>
    {:else}<button class="btn primary" data-testid="request-respond" disabled={busy} onclick={quote} title="사진·사인물·치수를 그대로 복제해 내 프로젝트로 — 여기서 견적을 만든다">{busy ? '가져오는 중…' : '내 프로젝트로 가져오기'}</button>{/if}
  </div>
{/if}

<style>
  .bar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--panel); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .info { flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 13px; min-width: 0; }
  .muted { color: var(--muted); font-size: 12px; }
  .text { font-size: 12px; }
  .biz { color: var(--ok); font-size: 11px; border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; }
  .b2b { color: #ff3d9a; border: 1px solid #ff3d9a; font-size: 11px; font-weight: 700; border-radius: 999px; padding: 0 6px; }
  .tag { color: var(--muted); font-size: 11px; border: 1px solid var(--line); border-radius: 999px; padding: 0 6px; }
  a { color: var(--accent); }
  a.btn { text-decoration: none; color: var(--accent-ink); }
  .btn.on { border-color: var(--accent); color: var(--accent); }
</style>
