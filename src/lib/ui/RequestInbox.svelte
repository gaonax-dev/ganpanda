<script lang="ts">
  import BackLink from './BackLink.svelte';
  // 받은 견적 요청 페이지 (/requests, 2026-10-22 사용자: "견적요청표시가 메인에 있는데 헤더에 표시해도 될거 같아 그리고 페이지 이동해서 리스트 보이게"):
  // 헤더의 "견적 요청 N" 을 누르면 여기로. 목록은 이름·사인물 정보만, 누르면 요청 보드(복제), 단추는 [견적 넣기] 하나
  import { app } from '../state.svelte';
  import { listMyRequests, listRequests, requestBoard, respondRequest, shopPhotoUrl, type MyRequest, type ShopRequest } from '../requests';
  /** 옛 요청(보드 복제 전)은 사진·사인물을 창으로 */
  let viewing = $state<ShopRequest | null>(null);
  /** 실측 보기 = 가게 사장의 프로젝트를 고칠 수 없게 연다 (2026-10-22 "그냥 프로젝트 열어주면되 소비자의 프로젝트를"). 옛 요청은 서버가 지금 복제 — 안 되면 사진 창 */
  async function view(r: ShopRequest) {
    if (r.snapshot) { location.href = `/?room=${r.snapshot.project}&request=${r.id}`; return; }
    try { const p = await requestBoard(r.id); location.href = `/?room=${p}&request=${r.id}`; } catch { viewing = r; }
  }
  let requests = $state<ShopRequest[]>([]);
  /** 보낸 요청 (2026-10-22 "사업자도 요청을 올릴수 있다. 해당 내역도 헤더에 표시"): 외주(B2B) 요청 */
  let sent = $state<MyRequest[]>([]);
  let tab = $state<'received' | 'sent'>(new URLSearchParams(location.search).get('tab') === 'sent' ? 'sent' : 'received');
  let loaded = $state(false);
  let responding = $state('');
  $effect(() => { if (app.account) Promise.all([listRequests(), listMyRequests().catch(() => [])]).then(([rs, mine]) => { requests = rs; sent = mine; loaded = true; }).catch(() => (loaded = true)); });
  const setTab = (t: 'received' | 'sent') => { tab = t; history.replaceState(null, '', t === 'sent' ? '/requests?tab=sent' : '/requests'); };
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
    <BackLink label="홈" />
    <div class="tabs" role="tablist">
      <button role="tab" class:on={tab === 'received'} data-testid="inbox-tab-received" onclick={() => setTab('received')}>받은 요청 {#if unanswered}<small class="hot" data-testid="request-unanswered">{unanswered}</small>{/if}</button>
      <button role="tab" class:on={tab === 'sent'} data-testid="inbox-tab-sent" onclick={() => setTab('sent')}>보낸 요청 <small>{sent.length}</small></button>
    </div>
    {#if tab === 'received'}<p class="hint">{app.account?.operator ? '모든 지역 (운영자)' : app.requestSettings?.regions.join(', ') || '지역을 정하지 않았습니다'} · <button class="link" onclick={() => (app.settingsOpen = 'requests')}>요청 받기 설정</button></p>{:else}<p class="hint">외주 프로젝트에서 [외주 요청]으로 보낸 요청입니다. 누르면 요청 페이지로.</p>{/if}
  </header>
  {#if !app.account}<p class="hint">로그인하면 받은 요청이 보입니다.</p>
  {:else if !loaded}<p class="hint">불러오는 중…</p>
  {:else if tab === 'sent'}
    {#each sent as r (r.id)}
      <a class="rcard open" data-testid="sent-item" data-status={r.status} href="/r/{r.id}">
        <div class="rbody">
          <span><b>{r.store}</b>{#if r.b2b}<span class="tag b2b">B2B</span>{/if}{#if r.status === 'cancelled'}<span class="tag off">취소됨</span>{/if} <span class="muted">{r.region} · {date(r.createdAt)}</span></span>
          <p class="muted">✎ 사인물 {r.signs?.length ?? 0}개</p>
        </div>
        <div class="ract"><span class="resp">{r.status === 'cancelled' ? '취소됨' : r.status === 'approved' ? '선택함' : r.responses ? `견적 ${r.responses}건` : '기다리는 중'}</span></div>
      </a>
    {:else}<p class="hint" data-testid="sent-empty">보낸 요청이 없습니다. 프로젝트 ⋯ → [다른 업체에 외주 요청]으로 외주 폴더에 넣고, 열어서 [외주 요청]을 누르세요.</p>{/each}
  {:else}
        {#each requests as r (r.id)}
          <!-- 이름·사인물 정보만, 누르면 요청 그대로의 보드(복제)가 바로 열린다, 단추는 [견적 넣기] 하나 (2026-10-22) -->
          {@const sized = (r.signs ?? []).filter((s) => s.widthMm && s.heightMm)}
          <div class="rcard open" data-testid="request-item" data-id={r.id} data-status={r.status} data-responded={r.responded} role="link" tabindex="0"
            onclick={() => view(r)} onkeydown={(e) => { if (e.key === 'Enter') view(r); }}>
            <div class="rbody">
              <span class="rhead"><b>{r.store || `${r.region}${r.floor ? ` ${r.floor}` : ''} 요청`}</b> {#if r.bizVerified}<span class="biz" data-testid="request-biz">✓ 사업자 확인</span>{:else if r.bizStatus === 'active'}<span class="biz" data-testid="request-biz">✓ 번호 확인</span>{/if}{#if r.b2b}<span class="tag b2b" data-testid="request-b2b">B2B</span>{/if}{#if r.general}<span class="tag" data-testid="request-general">일반 주문</span>{/if}{#if r.status === 'cancelled'}<span class="tag off" data-testid="request-cancelled">취소됨</span>{/if} <span class="muted">{r.region} · {date(r.createdAt)}{r.status === 'approved' ? ' · 승인됨' : ''}</span></span>
              <!-- 층·크레딧 (2026-10-24): 제안을 보내면 크레딧이 쓰이고 사진·가게 정보·연락처가 열린다 -->
              <p class="muted">{#if r.floor}<span class="tag" data-testid="request-floor">{r.floor}</span> {/if}{#if !r.responded && r.fee}<span data-testid="request-fee">제안 크레딧 {r.fee.toLocaleString('ko-KR')}원</span>{/if}{#if r.locked} · 가게 정보·연락처는 제안 뒤{/if}</p>
              <p class="muted" data-testid="request-signs">✎ 사인물 {r.signs?.length ?? 0}개 · 치수 {sized.length}개{#if sized.length} — {sized.slice(0, 3).map((s) => `${s.name} ${s.widthMm!.toLocaleString()}×${s.heightMm!.toLocaleString()}`).join(', ')}{sized.length > 3 ? ' …' : ''}{/if}</p>
              <!-- 가게 사장 요구사항 (2026-10-22 "요청보기는 제거하고 카드 하단에 소비자 요구사항표시") -->
              {#if r.text}<p class="need" data-testid="request-need">“{r.text}”</p>{/if}
              {#if r.responded}<p data-testid="request-phone">📞 {r.phone}{r.email ? ` · ${r.email}` : ''} <span class="muted">— 견적을 보냈습니다</span></p>{/if}
            </div>
            <div class="ract">
              <!-- 단추는 [실측 보기] 하나 — 고칠 수 없는 요청 보드를 열고, 거기서 [내 프로젝트로 가져오기]로 복제 (2026-10-22 "내 견적보기 -> 실측보기(강조색 파란색) 수정안됨 프로젝트 창에서 내프로젝트로 가져오기로 복제하기") -->
              <button class="btn small blue" data-testid="request-view" onclick={(e) => { e.stopPropagation(); view(r); }}>실측 보기</button>
            </div>
          </div>
        {:else}
          <p class="hint" data-testid="request-empty">{app.account?.operator ? '아직 받은 요청이 없습니다 — 가게 사장이 [가게 사장입니다 → 견적 요청]으로 보내면 모든 지역의 요청이 여기에 나타납니다(운영자).' : '아직 이 지역의 요청이 없습니다.'}</p>
        {/each}
  {/if}
</div>

{#if viewing}
  {@const v = viewing}
  <div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) viewing = null; }}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="요청 보기" data-testid="request-view-dialog">
      <header><h2>{v.store} <small class="muted">{v.region}</small></h2><button class="icon" title="닫기" onclick={() => (viewing = null)}>✕</button></header>
      {#if v.text}<p>“{v.text}”</p>{/if}
      {#if v.signs?.length}<ul>{#each v.signs as s, i (i)}<li><b>{s.name}</b> {s.widthMm && s.heightMm ? `${s.widthMm.toLocaleString()}×${s.heightMm.toLocaleString()}mm` : '치수 없음'}{s.memo ? ` — ${s.memo}` : ''}</li>{/each}</ul>{/if}
      <div class="photos">{#each v.photos as p (p.n)}<img src={shopPhotoUrl(v.id, p.n)} alt="" />{/each}</div>
      <p class="hint">복제 기능 전에 보낸 요청이라 사진과 사인물 목록으로 보여 줍니다.</p>
      {#if v.status !== 'cancelled'}<footer>{#if v.projectId}<a class="btn small primary" data-testid="request-open" href="/?room={v.projectId}">내 프로젝트 열기</a>{:else}<button class="btn primary" data-testid="request-respond" disabled={responding === v.id} onclick={() => respond(v)}>내 프로젝트로 가져오기</button>{/if}</footer>{/if}
    </div>
  </div>
{/if}

<style>
  .page { max-width: 760px; margin: 0 auto; padding: 16px 16px 60px; color: var(--text); }
  .hint { color: var(--muted); font-size: 12px; margin: 0 0 8px; }
  .link { background: none; border: 0; color: var(--accent); cursor: pointer; padding: 0; font-size: 12px; }
  .rcard { display: flex; gap: 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin: 8px 0; }
  .rcard.open { cursor: pointer; }
  .rcard.open:hover { border-color: var(--accent); }
  .rbody { display: flex; flex-direction: column; gap: 8px; font-size: 13px; min-width: 0; }
  /* 위쪽 줄(가게·배지·지역) 간격 (2026-10-22 "견적요청카드 상단 내용 간격 띄워주고") */
  .rhead { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; line-height: 1.6; }
  .rhead .tag { margin-left: 0; }
  .need { margin: 0; padding: 6px 10px; border-left: 3px solid var(--accent); background: var(--input); border-radius: 0 6px 6px 0; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
  .btn.blue { background: #3b82f6; border-color: #3b82f6; color: #fff; font-weight: 700; }
  .rbody p { margin: 0; }
  .muted { color: var(--muted); }
  .biz { color: var(--ok); font-size: 11px; border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; }
  .tag { font-size: 11px; border-radius: 999px; padding: 1px 7px; border: 1px solid var(--line); color: var(--muted); margin-left: 4px; }
  .tag.off { color: var(--danger); border-color: var(--danger); }
  .ract { margin-left: auto; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(720px, calc(100vw - 24px)); max-height: calc(100dvh - 40px); overflow: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .dialog header { display: flex; align-items: center; justify-content: space-between; }
  .dialog h2 { margin: 0; font-size: 16px; }
  .dialog .photos { display: flex; flex-direction: column; gap: 8px; }
  .dialog .photos img { width: 100%; border-radius: 8px; }
  .dialog ul { margin: 0; padding-left: 18px; font-size: 13px; }
  .icon { background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 14px; }
  .tabs { display: flex; gap: 4px; margin: 4px 0 8px; }
  .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; color: var(--muted); font: inherit; font-size: 16px; font-weight: 700; padding: 6px 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
  .tabs button.on { color: var(--text); border-bottom-color: var(--accent); }
  .tabs small { font-size: 12px; font-weight: 600; background: var(--input); border-radius: 999px; padding: 0 7px; }
  .tabs small.hot { background: var(--accent); color: var(--accent-ink); }
  .tag.b2b { color: #ff3d9a; border-color: #ff3d9a; font-weight: 700; }
  a.rcard { text-decoration: none; color: var(--text); }
  .resp { color: var(--accent); font-size: 12px; white-space: nowrap; }
  a.btn { text-decoration: none; }
</style>
