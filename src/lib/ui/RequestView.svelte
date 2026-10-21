<!-- 고객의 내 요청 페이지 — /r/<id>?key= 또는 로그인 세션(요청한 계정, 2026-10-21): 요청 내용·사진·상태, 받은 제안 목록 → 제안 링크 -->
<script lang="ts">
  import { customerPhotoUrl, getRequest, type CustomerRequestView } from '../requests';
  import { SERVER_URL } from '../sync';

  const url = new URL(location.href);
  const id = url.pathname.split('/')[2] ?? '';
  const key = url.searchParams.get('key') ?? '';
  let view = $state<CustomerRequestView | null>(null);
  let error = $state('');
  async function load() {
    try { view = await getRequest(id, key); error = ''; }
    catch { error = key ? '요청을 찾을 수 없거나 주소가 올바르지 않습니다.' : '이 요청을 보려면 요청한 계정으로 로그인하거나, 받은 주소(?key=)로 열어 주세요.'; }
  }
  $effect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); });
  const date = (ts: number) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
</script>

<div class="page" data-testid="request-page">
  {#if error}<p class="warn">{error}</p>
  {:else if !view}<p class="hint">불러오는 중…</p>
  {:else}
    <header class="hero">
      <small>간판 견적 요청 · {date(view.request.createdAt)}</small>
      <h1>{view.request.store}</h1>
      <p>{view.request.region}{view.request.text ? ` · ${view.request.text}` : ''}</p>
      {#if view.request.photos.length}<div class="photos">{#each view.request.photos as p (p.n)}<img src={customerPhotoUrl(id, key, p.n)} alt="" />{/each}</div>{/if}
    </header>
    <section class="card" data-testid="request-status" data-status={view.request.status}>
      {#if view.request.status === 'approved'}
        ✅ <b>{view.request.approvedShop}</b>의 제안을 승인했습니다. 이후 일정·계약은 그 간판집과 직접 진행하세요.
      {:else if view.responses.length}
        제안 {view.responses.length}건이 왔습니다. 각 제안에서 내 가게 사진 위 모습과 금액을 보고, 마음에 드는 것을 <b>[이걸로 할게요]</b>로 승인하세요.
      {:else}
        아직 제안이 없습니다. 이 지역 간판집들에게 요청을 전달했습니다 — 보통 하루 안에 옵니다. 이 페이지를 다시 열면 확인할 수 있습니다.
      {/if}
    </section>
    {#each view.responses as r (r.proposalPath)}
      <a class="card proposal" data-testid="request-proposal" href={SERVER_URL + r.proposalPath}>
        <span><b>{r.shop}</b><small>{date(r.createdAt)}</small></span>
        <span class="go">제안 보기 →</span>
      </a>
    {/each}
    <p class="fine">계약과 결제는 간판집과 직접 하시고, 간판다는 요청을 전달하고 합의 내용(승인)을 기록합니다.</p>
  {/if}
</div>

<style>
  .page { max-width: 560px; margin: 0 auto; padding: 0 16px 60px; display: flex; flex-direction: column; gap: 12px; color: var(--text); }
  .hero { padding: 20px 0 4px; }
  .hero small { color: var(--muted); font-size: 12px; }
  .hero h1 { margin: 4px 0; font-size: 22px; }
  .hero p { margin: 0 0 10px; color: var(--muted); }
  .photos { display: flex; gap: 8px; overflow-x: auto; }
  .photos img { height: 120px; border-radius: 8px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; line-height: 1.5; }
  .proposal { display: flex; justify-content: space-between; align-items: center; text-decoration: none; color: var(--text); }
  .proposal small { display: block; color: var(--muted); font-size: 12px; }
  .go { color: var(--accent); font-weight: 600; white-space: nowrap; }
  .warn { color: #ffb347; }
  .hint, .fine { color: var(--muted); font-size: 12px; }
</style>
