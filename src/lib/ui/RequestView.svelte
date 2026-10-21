<!-- 고객의 내 요청 페이지 — /r/<id>?key= 또는 로그인 세션(요청한 계정, 2026-10-21).
     2026-10-22 사용자: "견적요청 페이지는 견적 요청된 상태를 더 잘 포장해서", "취소만 남기고 환불 재요청 빼줘":
     진행 단계(접수 → 제안 도착 → 간판집 선택), 사업자 인증 배지(또는 일반 주문), 요청 요약, 받은 제안, [요청 취소](요청을 닫기만) → [새로 요청하기] -->
<script lang="ts">
  import { cancelRequest, customerPhotoUrl, getRequest, type CustomerRequestView } from '../requests';
  import { loadSession } from '../auth';
  import { SERVER_URL } from '../sync';
  import { requestSteps } from '../core/estimateRequest';
  import { formatBizNo } from '../core/business';

  const url = new URL(location.href);
  const id = url.pathname.split('/')[2] ?? '';
  const key = url.searchParams.get('key') ?? '';
  let view = $state<CustomerRequestView | null>(null);
  let error = $state(''), busy = $state(false);
  async function load() {
    try { view = await getRequest(id, key); error = ''; }
    catch { error = key ? '요청을 찾을 수 없거나 주소가 올바르지 않습니다.' : '이 요청을 보려면 요청한 계정으로 로그인하거나, 받은 주소(?key=)로 열어 주세요.'; }
  }
  $effect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); });
  const date = (ts: number) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const r = $derived(view?.request);
  const steps = $derived(view ? requestSteps(view.request.status, view.responses.length) : []);
  const signs = $derived(r?.signs ?? []);
  const measured = $derived(signs.filter((s) => s.widthMm && s.heightMm).length);
  async function cancel() {
    if (busy || !confirm('견적 요청을 취소할까요?\n\n요청이 닫혀 더는 새 제안이 오지 않아요. 이미 제안한 간판집은 연락처를 받았으니 필요하면 직접 연락이 올 수 있어요.')) return;
    busy = true;
    try { await cancelRequest(id, key); await load(); } catch { error = '취소하지 못했습니다. 잠시 뒤 다시 해 주세요.'; } finally { busy = false; }
  }
</script>

<div class="page" data-testid="request-page">
  {#if error && !view}<p class="warn">{error}</p>
  {:else if !view || !r}<p class="hint">불러오는 중…</p>
  {:else}
    <header class="hero" data-status={r.status}>
      <div class="top">
        <small>간판 견적 요청 · {date(r.createdAt)}</small>
        {#if r.bizVerified}<span class="badge ok" data-testid="request-badge" data-kind="verified">✓ 사업자 인증</span>
        {:else if r.general}<span class="badge plain" data-testid="request-badge" data-kind="general">일반 주문</span>{/if}
      </div>
      <h1>{r.store}</h1>
      <p class="sub">{r.address || r.region}{r.bizNo ? ` · ${formatBizNo(r.bizNo)}` : ''}</p>
      <ol class="steps" data-testid="request-steps">
        {#each steps as s (s.id)}<li data-state={s.state}><i></i><span>{s.label}</span></li>{/each}
      </ol>
    </header>

    <section class="card status" data-testid="request-status" data-status={r.status}>
      {#if r.status === 'cancelled'}
        <b>취소한 요청입니다.</b> 더는 새 제안이 오지 않아요. 이미 제안한 간판집과는 직접 이야기를 이어 갈 수 있어요.
        <a class="btn primary" data-testid="request-again" href="/estimate">고쳐서 새로 요청하기</a>
      {:else if r.status === 'approved'}
        ✅ <b>{view.request.approvedShop}</b>의 제안을 골랐습니다. 이후 일정·계약은 그 간판집과 직접 진행하세요.
      {:else if view.responses.length}
        <b>제안 {view.responses.length}건이 도착했어요.</b> 각 제안에서 내 가게 사진 위 모습과 금액을 보고, 마음에 드는 곳을 <b>[이걸로 할게요]</b>로 골라 주세요.
      {:else}
        <b>간판집에 요청을 전달했어요.</b> 보통 하루 안에 제안이 옵니다. 제안이 오면 여기에 바로 보여요.
        <span class="pulse" aria-hidden="true"></span>
      {/if}
    </section>

    {#if view.responses.length}
      <h2>받은 제안</h2>
      {#each view.responses as p (p.proposalPath)}
        <a class="card proposal" data-testid="request-proposal" href={SERVER_URL + p.proposalPath}>
          <span><b>{p.shop}</b><small>{date(p.createdAt)}</small></span>
          <span class="go">제안 보기 →</span>
        </a>
      {/each}
    {/if}

    {#if r.snapshot}
      <!-- 요청한 그대로의 보드 (2026-10-22 "그 상태를 요청페이지로 복제") — 읽기 전용 요청 프로젝트를 넣어 보여 준다 -->
      <h2>요청한 그대로 <a class="open" data-testid="request-board-open" href="/?room={r.snapshot.project}&c=1" target="_blank" rel="noopener">크게 보기 ↗</a></h2>
      {#if loadSession()}
        <iframe class="board" data-testid="request-board" title="요청한 보드" src="/?room={r.snapshot.project}&embed=1&c=1"></iframe>
      {:else}<p class="hint">요청한 계정으로 로그인하면 요청한 보드가 그대로 보입니다.</p>{/if}
    {/if}
    <h2>요청 내용</h2>
    <section class="card summary" data-testid="request-summary">
      <dl>
        <dt>사인물</dt><dd>{signs.length}개 <small>(치수 입력 {measured}개)</small></dd>
        <dt>사진</dt><dd>{r.snapshot ? r.snapshot.photos.length : r.photos.length}장</dd>
        <dt>지역</dt><dd>{r.region}</dd>
        {#if r.text}<dt>요청</dt><dd>{r.text}</dd>{/if}
      </dl>
      {#if signs.length}<ul class="signs">{#each signs as s, i (i)}<li><b>{s.name}</b>{#if s.widthMm && s.heightMm}<small>{s.widthMm.toLocaleString()}×{s.heightMm.toLocaleString()}mm</small>{:else}<small class="warn">치수 없음</small>{/if}</li>{/each}</ul>{/if}
      {#if !r.snapshot && r.photos.length}<div class="photos">{#each r.photos as p (p.n)}<img src={customerPhotoUrl(id, key, p.n)} alt="" />{/each}</div>{/if}
    </section>

    {#if r.status === 'open'}
      <button class="btn danger" data-testid="request-cancel" disabled={busy} onclick={cancel}>{busy ? '취소하는 중…' : '요청 취소'}</button>
      <p class="fine">보낸 요청은 고칠 수 없어요. 고치려면 취소하고 새로 요청해 주세요.</p>
    {/if}
    {#if error}<p class="warn">{error}</p>{/if}
    <p class="fine">계약과 결제는 간판집과 직접 하시고, 간판다는 요청을 전달하고 합의 내용(승인)을 기록합니다.</p>
  {/if}
</div>

<style>
  .page { max-width: 560px; margin: 0 auto; padding: 0 16px 60px; display: flex; flex-direction: column; gap: 12px; color: var(--text); }
  .hero { padding: 20px 0 4px; }
  .hero .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .hero small { color: var(--muted); font-size: 12px; }
  .hero h1 { margin: 6px 0 2px; font-size: 24px; }
  .sub { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
  .badge { border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .badge.ok { background: rgba(60, 200, 120, 0.15); color: var(--ok); border: 1px solid rgba(60, 200, 120, 0.6); }
  .badge.plain { background: var(--panel); color: var(--muted); border: 1px solid var(--line); }
  .steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); position: relative; }
  .steps li { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); position: relative; }
  .steps li::before { content: ''; position: absolute; top: 7px; left: -50%; right: 50%; height: 2px; background: var(--line); z-index: 0; }
  .steps li:first-child::before { display: none; }
  .steps li i { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--line); background: var(--panel); z-index: 1; }
  .steps li[data-state='done'] { color: var(--text); }
  .steps li[data-state='done'] i { background: var(--ok); border-color: var(--ok); }
  .steps li[data-state='done']::before, .steps li[data-state='now']::before { background: var(--ok); }
  .steps li[data-state='now'] { color: var(--accent); font-weight: 700; }
  .steps li[data-state='now'] i { border-color: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 20%, transparent); }
  .steps li[data-state='cancelled'] { text-decoration: line-through; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; line-height: 1.6; }
  .status { position: relative; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .status[data-status='open'] { border-color: color-mix(in srgb, var(--accent) 50%, transparent); }
  .status[data-status='approved'] { border-color: rgba(60, 200, 120, 0.6); }
  .status .btn { text-decoration: none; }
  .pulse { position: absolute; top: 14px; right: 14px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); animation: pulse 1.4s ease-out infinite; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 60%, transparent); } 100% { box-shadow: 0 0 0 12px color-mix(in srgb, var(--accent) 0%, transparent); } }
  h2 { margin: 8px 0 0; font-size: 14px; color: var(--muted); }
  .proposal { display: flex; justify-content: space-between; align-items: center; text-decoration: none; color: var(--text); }
  .proposal small { display: block; color: var(--muted); font-size: 12px; }
  .go { color: var(--accent); font-weight: 600; white-space: nowrap; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin: 0; font-size: 13px; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  dd small { color: var(--muted); }
  .signs { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .signs li { background: var(--input); border: 1px solid var(--line); border-radius: 8px; padding: 4px 8px; font-size: 12px; display: flex; gap: 6px; }
  .signs small { color: var(--muted); }
  .board { width: 100%; height: min(70vh, 560px); border: 1px solid var(--line); border-radius: 14px; background: var(--canvas); }
  h2 .open { float: right; font-size: 12px; color: var(--accent); text-decoration: none; font-weight: 600; }
  .photos { display: flex; gap: 8px; overflow-x: auto; margin-top: 10px; }
  .photos img { height: 110px; border-radius: 8px; }
  .btn.danger { align-self: flex-start; color: var(--danger); border-color: var(--danger); background: none; }
  .warn { color: #ffb347; }
  small.warn { color: var(--warn); }
  .hint, .fine { color: var(--muted); font-size: 12px; margin: 0; }
</style>
