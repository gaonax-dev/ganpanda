<!-- 고객이 보는 제안 페이지 (휴대폰 우선, 로그인 없음): 실사 주간/야간 · 사인물 목록·치수·금액 · 질문 · [진행 동의] (2026-10-22, 전에는 [이걸로 할게요]) -->
<script lang="ts">
  import { signTextOf } from '../core/parts';
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import { describeOptions } from '../core/options';
  import { productById, sheetById } from '../core/catalog';
  import { won } from '../core/quote';
  import Chat from './Chat.svelte';

  const proposal = $derived(app.settings.proposal);
  const approval = $derived(app.approval);
  const quote = $derived(app.quote);
  const projectName = $derived(app.access.status === 'ok' ? app.access.projectName : '');
  let night = $state(false);
  let urls = $state<Record<string, string>>({});
  let openChat = $state<string | null>(null);
  let detail = $state(false);
  let name = $state(app.nickname);
  let confirming = $state(false);
  let sending = $state(false);
  let error = $state('');
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  const date = (ts: number) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  /** 사인물이 있는 사진 (실사 이미지가 없는 제안은 이 사진 위에 외곽선) */
  const signPhotos = $derived(app.photos.filter((p) => app.signs.some((o) => o.photoId === p.id)));
  // 렌더 이미지 · 사진 URL 준비
  $effect(() => {
    void app.assetEpoch;
    const ids = proposal?.renders.length ? proposal.renders.flatMap((r) => [r.day, r.night]) : signPhotos.map((p) => p.assetId).filter(Boolean);
    for (const id of ids) if (!urls[id]) assetUrl(id).then((u) => { if (u) urls = { ...urls, [id]: u }; });
  });
  const photoName = (id: string) => app.photos.find((p) => p.id === id)?.name ?? '';

  // 진행 동의 (2026-10-22 "여기에 진행동의를 누르면 제작을 한다"): 사인물을 빼고 동의할 수 있다 — 뺀 것은 기록에 '제외'
  let skip = $state(new Set<string>());
  const toggleSkip = (id: string) => { const n = new Set(skip); if (n.has(id)) n.delete(id); else n.add(id); skip = n; };
  async function approve() {
    if (!name.trim()) { error = '이름을 넣어 주세요.'; return; }
    sending = true; error = '';
    try { await app.approve(name.trim(), [...skip]); confirming = false; }
    catch (e) { error = e instanceof Error ? e.message : '승인에 실패했습니다. 다시 시도해 주세요.'; }
    finally { sending = false; }
  }
</script>

<div class="page" data-testid="proposal-page">
  <header class="hero">
    <small>간판 제안</small>
    <h1>{projectName}</h1>
    {#if proposal?.note}<p class="note" data-testid="proposal-note-view">{proposal.note}</p>{/if}
    {#if proposal}<small class="meta">{proposal.author} · {date(proposal.createdAt)}</small>{/if}
    <!-- 소유자의 확인된 사업자 (2026-10-21): 돈이 간판다를 거치지 않는 구조에서 고객이 믿을 근거 -->
    {#if app.access.status === 'ok' && app.access.business && app.access.business.status === 'active'}
      <small class="biz" data-testid="proposal-business" title="국세청 사업자등록 정보로 확인된 간판집입니다">✓ 사업자 확인된 간판집{app.access.business.name ? ` · ${app.access.business.name}` : ''}</small>
    {/if}
  </header>

  {#if proposal?.renders.length}
    <section class="renders">
      <div class="seg center"><button class:on={!night} onclick={() => (night = false)}>☀ 주간</button><button data-testid="proposal-night" class:on={night} onclick={() => (night = true)}>🌙 야간</button></div>
      {#each proposal.renders as r (r.photoId)}
        {@const id = night ? r.night : r.day}
        <figure>
          {#if urls[id]}<img data-testid="proposal-render" src={urls[id]} alt={photoName(r.photoId)} />{:else}<div class="loading">불러오는 중…</div>{/if}
          <figcaption>{photoName(r.photoId)} · {night ? '야간' : '주간'}</figcaption>
        </figure>
      {/each}
    </section>
  {:else}
    <!-- 실사 이미지 없이(2026-10-24 "실사이미지 만들필요가 없고 링크발급으로"): 가게 사진 위에 사인물 외곽선·이름을 바로 -->
    <section class="renders">
      {#each signPhotos as p (p.id)}
        <figure data-testid="proposal-photo">
          <svg viewBox="0 0 {p.w} {p.h}" role="img" aria-label={p.name}>
            {#if urls[p.assetId]}<image href={urls[p.assetId]} x="0" y="0" width={p.w} height={p.h} />{:else}<rect width={p.w} height={p.h} fill="#ddd" />{/if}
            {#each app.signs.filter((o) => o.photoId === p.id && o.quad.length === 4) as o (o.id)}
              {@const pts = (o.shape === 'polygon' && o.polygon?.length ? o.polygon : o.quad).map((q) => q.join(',')).join(' ')}
              {@const u = p.w / 800}
              <polygon data-testid="proposal-photo-sign" points={pts} fill="rgba(59,130,246,0.12)" stroke="var(--accent)" stroke-width={3 * u} />
              <text x={o.quad[0][0]} y={o.quad[0][1] - 10 * u} font-size={28 * u} fill="#fff" stroke="#000" stroke-width={4 * u} paint-order="stroke" font-weight="700">{o.name}</text>
            {/each}
          </svg>
          <figcaption>{p.name}</figcaption>
        </figure>
      {:else}
        <div class="loading">사진이 없습니다.</div>
      {/each}
    </section>
  {/if}

  <section class="signs">
    <h2>사인물 {app.signs.length}개</h2>
    {#each app.signs as o (o.id)}
      {@const sz = app.sizeOf(o)}
      {@const p = productById(o.productId)}
      {@const amount = quote.lines.filter((l) => l.objectId === o.id).reduce((a, l) => a + l.amount, 0)}
      {@const unread = app.unread[o.id] ?? 0}
      <article class="sign" data-testid="proposal-sign">
        <div class="row">
          <b>{o.name}</b>
          <span class="amt">{won(amount)}</span>
        </div>
        <div class="spec">
          {p?.name ?? (o.sheetIds.length ? o.sheetIds.map((id) => sheetById(id)?.name ?? id).join(', ') : '')}
          {#if p && o.sheetIds.length} · {o.sheetIds.map((id) => sheetById(id)?.name ?? id).join(', ')}{/if}
          {#each describeOptions(o, { defaults: true }) as d, i (i)} · {d}{/each}
        </div>
        <div class="spec">{sz ? `${fmt(sz.w)} × ${fmt(sz.h)} mm${sz.estimated ? ' (사진 기준 추정)' : ''}` : '치수 미정'}{#if signTextOf(o)} · “{signTextOf(o)}”{/if}</div>
        <button class="btn small" data-testid="proposal-ask" onclick={() => (openChat = openChat === o.id ? null : o.id)}>{openChat === o.id ? '질문 닫기' : `질문하기${unread ? ` (${unread})` : ''}`}</button>
        {#if openChat === o.id}<div class="chat"><Chat objectId={o.id} /></div>{/if}
      </article>
    {/each}
  </section>

  <section class="total">
    <div class="row big"><span>총 금액</span><b data-testid="proposal-total">{won(quote.total)}</b></div>
    <small>부가세 포함 · 설치·운반비 포함{quote.extras.length ? ' · 추가 항목 포함' : ''}</small>
    <button class="link" onclick={() => (detail = !detail)}>{detail ? '간단히' : '금액 자세히'}</button>
    {#if detail}
      <table>
        <tbody>
          {#each quote.lines as l, i (i)}<tr><td>{l.label}<small>{l.detail}</small></td><td class="r">{won(l.amount)}</td></tr>{/each}
          <tr><td>설치·운반비</td><td class="r">{won(quote.install)}</td></tr>
          {#each quote.extras as e (e.id)}<tr><td>{e.label}</td><td class="r">{won(e.amount)}</td></tr>{/each}
          {#if !quote.vatIncluded}<tr><td>부가세</td><td class="r">{won(quote.vat)}</td></tr>{/if}
        </tbody>
      </table>
    {/if}
  </section>

  <section class="approve" data-testid="proposal-approve" data-status={approval.status}>
    {#if approval.status === 'approved'}
      <p class="done">✅ <b>{approval.approval.by}</b> 님이 {date(approval.approval.at)}에 진행에 동의했습니다 — <b>제작</b>을 시작합니다.{#if approval.approval.excluded?.length} ({approval.approval.excluded.length}개 제외){/if}</p>
      <small>동의한 내용(사인물·치수·디자인·금액)이 기록되어 있습니다. 이후 내용이 바뀌면 다시 확인을 요청드립니다.</small>
    {:else}
      {#if approval.status === 'changed'}
        <p class="changed">⚠ {approval.approval.by} 님이 {date(approval.approval.at)}에 동의한 뒤 내용이 바뀌었습니다. 위 내용을 다시 확인하고 동의해 주세요.</p>
      {/if}
      {#if !confirming}
        <!-- 사인물 빼기: 누르면 빠짐 (2026-10-22) -->
        <div class="skip" data-testid="consent-signs">{#each app.signs as o (o.id)}<button class="chip" class:off={skip.has(o.id)} data-testid="consent-sign" onclick={() => toggleSkip(o.id)}>{skip.has(o.id) ? '○' : '✓'} {o.name}</button>{/each}</div>
        <button class="btn primary big" data-testid="proposal-approve-button" onclick={() => (confirming = true)}>진행 동의</button>
        <small>체크된 사인물을 위 모습·치수·금액으로 <b>제작</b>해도 좋다는 뜻입니다. 빼고 싶은 사인물은 눌러서 빼세요. 궁금한 점은 먼저 사인물마다 [질문하기]로 물어보세요.</small>
      {:else}
        <label>동의하는 분 이름<input data-testid="proposal-approver" bind:value={name} placeholder="예: 홍길동" /></label>
        <div class="row">
          <button class="btn primary" data-testid="proposal-approve-confirm" disabled={sending} onclick={approve}>{sending ? '보내는 중…' : skip.size ? `네, ${skip.size}개 빼고 진행합니다` : '네, 이 내용으로 진행합니다'}</button>
          <button class="btn" onclick={() => (confirming = false)}>취소</button>
        </div>
        {#if error}<p class="err">{error}</p>{/if}
      {/if}
    {/if}
  </section>

  {#if app.canEdit}
    <footer class="maker"><button class="btn small" data-testid="proposal-exit" onclick={() => (app.proposalMode = false)}>← 작업 화면으로</button></footer>
  {/if}
  <!-- 무료 요금제의 제안 페이지: 간판다 표시 (2026-10-17 — 비용 0 의 확산 경로) -->
  {#if app.access.status === 'ok' && app.access.branding}
    <footer class="brand" data-testid="proposal-branding"><a href="https://ganpanda.co.kr" target="_blank" rel="noopener">간판다로 만든 제안 · 간판집이라면 무료로 시작하세요</a></footer>
  {/if}
</div>

<style>
  .page { max-width: 720px; margin: 0 auto; padding: 0 0 60px; display: flex; flex-direction: column; gap: 14px; color: var(--text); }
  .hero { padding: 18px 16px 6px; }
  .hero small { color: var(--muted); font-size: 12px; }
  .hero h1 { margin: 2px 0 6px; font-size: 22px; }
  .note { margin: 0 0 6px; font-size: 14px; line-height: 1.5; }
  .meta { color: var(--muted); }
  .biz { display: inline-block; margin-top: 6px; color: var(--ok); border: 1px solid currentColor; border-radius: 999px; padding: 1px 8px; }
  section { padding: 0 16px; }
  .renders figure { margin: 10px 0 0; }
  .renders img, .renders svg { width: 100%; border-radius: 12px; display: block; }
  .renders figcaption { color: var(--muted); font-size: 12px; margin-top: 4px; }
  .loading { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 40px 16px; text-align: center; color: var(--muted); }
  .center { justify-content: center; max-width: 240px; margin: 0 auto; }
  .seg button { font-size: 14px; }
  h2 { font-size: 15px; margin: 6px 0 8px; }
  .sign { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 4px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .amt { font-weight: 700; }
  .spec { font-size: 13px; color: var(--muted); }
  .sign .btn { align-self: flex-start; margin-top: 4px; }
  .chat { height: 320px; display: flex; flex-direction: column; border-top: 1px solid var(--line); margin-top: 6px; }
  .total { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin: 0 16px; display: flex; flex-direction: column; gap: 4px; }
  .big b { font-size: 20px; color: var(--accent); }
  .total small { color: var(--muted); }
  .link { background: none; border: 0; color: var(--blue); cursor: pointer; align-self: flex-start; padding: 2px 0; font: inherit; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
  td { padding: 4px 0; border-top: 1px solid var(--line); vertical-align: top; }
  td small { display: block; color: var(--muted); }
  .r { text-align: right; white-space: nowrap; }
  .approve { margin: 0 16px; padding: 14px; border-radius: 12px; background: var(--panel); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
  .approve[data-status='approved'] { border-color: rgba(61, 220, 132, 0.5); }
  .btn.big { font-size: 16px; padding: 12px; }
  .done { margin: 0; font-size: 15px; }
  .changed { margin: 0; color: var(--warn); font-size: 13px; }
  .err { color: var(--danger); font-size: 12px; margin: 0; }
  .approve small { color: var(--muted); font-size: 12px; line-height: 1.4; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  .maker { padding: 0 16px; }
  .brand { padding: 8px 16px; text-align: center; font-size: 12px; }
  .brand a { color: var(--muted); text-decoration: none; }
  .brand a:hover { color: var(--accent); }
  .skip { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
  .chip { font: inherit; font-size: 12px; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--text); border-radius: 999px; padding: 3px 10px; cursor: pointer; }
  .chip.off { border-color: var(--line); background: none; color: var(--muted); text-decoration: line-through; }
</style>
