<script lang="ts">
  // 간판집이 받은 요청을 열었을 때 (2026-10-22 사용자: "사업자는 페이지에서도 리스트는 이름 사인물 정보만 표시하고 클릭하면 복제된 페이지 바로보이게 해줘 그리고 견적넣기 버튼만 있으면 될거 같아"):
  // 요청 프로젝트(보드 복제, 읽기 전용 = 실측 보기) 위에 요청 정보 한 줄 + [내 프로젝트로 가져오기] — 누르면 요청 그대로 복제해 연다 (2026-10-22)
  import { app } from '../state.svelte';
  import { bizDocUrl, listRequests, respondRequest, type ShopRequest } from '../requests';
  import { requestSheet } from '../core/requestSheet';
  import { productById } from '../core/catalog';
  // 견적 요청서 표 (2026-10-22 "견적요청서 리스트가 있어야 견적이 쉽다") — 보드의 사인물(연결 복사본 제외)로
  let sheetOpen = $state(true);
  const sheet = $derived(requestSheet(app.signs.map((o) => ({ id: o.id, name: o.name, widthMm: o.widthMm, heightMm: o.heightMm, productId: o.productId, note: o.note })), (id) => productById(id)?.name));
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
    <button class="btn small" class:on={sheetOpen} data-testid="request-sheet-toggle" onclick={() => (sheetOpen = !sheetOpen)}>요청서 ({sheet.total.count})</button>
    {#if req.status === 'cancelled'}<span class="muted">취소된 요청</span>
    {:else if req.projectId}<a class="btn small primary" data-testid="request-open" href="/?room={req.projectId}">내 프로젝트 열기</a>
    {:else}<button class="btn primary" data-testid="request-respond" disabled={busy} onclick={quote} title="사진·사인물·치수를 그대로 복제해 내 프로젝트로 — 여기서 견적을 만든다">{busy ? '가져오는 중…' : '내 프로젝트로 가져오기'}</button>{/if}
  </div>
  {#if sheetOpen}
    <div class="sheet" data-testid="request-sheet">
      <header><b>견적 요청서</b><span class="muted">{req.store} · {req.address || req.region}</span><button class="icon" title="접기" onclick={() => (sheetOpen = false)}>✕</button></header>
      {#if req.text}<p class="need" data-testid="request-sheet-need">“{req.text}”</p>{/if}
      <table>
        <thead><tr><th>#</th><th>사인물</th><th>가로 × 세로 (mm)</th><th>면적</th><th>종류</th><th>메모</th></tr></thead>
        <tbody>
          {#each sheet.rows as r (r.id)}
            <tr data-testid="request-sheet-row" class:sel={app.selectedId === r.id} class:unsized={!r.area} onclick={() => app.selectObject(r.id)}>
              <td>{r.no}</td><td>{r.name}</td><td class="num">{r.size}</td><td class="num">{r.area ? `${r.area}㎡` : '—'}</td><td>{r.kind || '—'}</td><td class="memo">{r.memo || '—'}</td>
            </tr>
          {:else}<tr><td colspan="6" class="muted">그린 사인물이 없습니다 — 사진만 보냈습니다.</td></tr>{/each}
        </tbody>
        {#if sheet.rows.length}<tfoot><tr data-testid="request-sheet-total"><td></td><td>합계 {sheet.total.count}개</td><td class="num">치수 {sheet.total.measured}개</td><td class="num">{sheet.total.area}㎡</td><td colspan="2"></td></tr></tfoot>{/if}
      </table>
    </div>
  {/if}
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
  .sheet { position: fixed; left: 12px; top: 110px; z-index: 30; width: min(560px, calc(100vw - 24px)); max-height: calc(100dvh - 140px); overflow: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.4); padding: 10px 12px; font-size: 13px; }
  .sheet header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .sheet header .muted { flex: 1; }
  .sheet .icon { background: none; border: 0; color: var(--muted); cursor: pointer; }
  .sheet .need { margin: 0 0 8px; padding: 6px 10px; border-left: 3px solid var(--accent); background: var(--input); border-radius: 0 6px 6px 0; white-space: pre-wrap; }
  .sheet table { width: 100%; border-collapse: collapse; }
  .sheet th, .sheet td { text-align: left; padding: 5px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .sheet th { color: var(--muted); font-weight: 600; font-size: 12px; white-space: nowrap; }
  .sheet td.num { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .sheet td.memo { color: var(--muted); }
  .sheet tbody tr { cursor: pointer; }
  .sheet tbody tr:hover, .sheet tr.sel { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .sheet tr.unsized td.num { color: var(--warn); }
  .sheet tfoot td { font-weight: 700; border-bottom: 0; }
  @media (max-width: 720px) { .sheet { top: auto; bottom: 8px; max-height: 45dvh; } }
</style>
