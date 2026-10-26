<!-- 제안 보내기 (제작자): 준비 점검 → 고객용 링크 발급 (2026-10-24 "실사이미지 만들필요가 없고 링크발급으로" — 전엔 사진마다 실사 주간·야간 PNG 를 만들어 올렸다). 승인 상태도 여기서 본다 -->
<script lang="ts">
  import { nudgeClose } from './dialogGuard';
  import { app } from '../state.svelte';
  import { createInvite, retryCredit } from '../projects';
  import { AuthError, paymentsShown } from '../auth';
  import { proposalProblems, type ProposalInfo } from '../core/proposal';
  import { SERVER_URL } from '../sync';
  import { won } from '../core/quote';
  import QuoteChange from './QuoteChange.svelte';

  let busy = $state('');
  let error = $state('');
  let link = $state('');
  let copied = $state(false);
  let note = $state(app.settings.proposal?.note ?? '');
  const problems = $derived(proposalProblems(app.signs, (o) => app.sizeOf(o), app.photos));
  const proposal = $derived(app.settings.proposal);
  const approval = $derived(app.approval);
  const close = () => (app.proposalOpen = false);
  const date = (ts: number) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  function proposalLimitMessage(body: string): string {
    // 앱 안에서는 업그레이드 안내 없이 (2026-10-26 결제는 웹으로만)
    try { const j = JSON.parse(body) as { used: number; limit: number }; return paymentsShown() ? `무료 요금제는 제안 링크가 한 달 ${j.limit}건까지입니다 (이번 달 ${j.used}건). 다음 달에 다시 만들거나 베이직 요금제로 올리면 무제한입니다.` : `이번 달 제안 링크 한도(${j.limit}건)에 도달했습니다 (이번 달 ${j.used}건). 다음 달에 다시 만들 수 있습니다.`; }
    catch { return paymentsShown() ? '무료 요금제의 이번 달 제안 링크 한도에 도달했습니다. 베이직 요금제로 올리면 무제한입니다.' : '이번 달 제안 링크 한도에 도달했습니다.'; }
  }
  /** 요청 크레딧: 첫 제안 = 예약, 고객이 제안을 열 때 등록 카드로 결제 → 가게 정보·연락처가 열린다 (2026-10-25 "고객이 견적을 확인하면 그때 결제 … 간판집은 예약하고", 전엔 제안 때 결제) */
  const credit = $derived(app.access.status === 'ok' && app.access.credit && !app.access.credit.paid ? app.access.credit : null);
  async function retry() {
    if (!app.room) return;
    error = '';
    try { busy = '결제하는 중…'; await retryCredit(app.room); app.creditPaid(); }
    catch (e) { error = e instanceof AuthError && e.status === 402 ? creditError(e.message) ?? e.message : e instanceof AuthError && e.status === 409 ? '고객이 아직 제안을 열지 않았습니다.' : e instanceof Error ? e.message : String(e); }
    finally { busy = ''; }
  }
  let needCard = $state(false);
  function creditError(body: string): string | null {
    try {
      const j = JSON.parse(body) as { error?: string; fee?: number; used?: number; limit?: number; message?: string };
      // 앱 안: 결제 수단·금액 안내 없이 (2026-10-26 결제는 웹으로만)
      if (!paymentsShown() && (j.error === 'card_required' || j.error === 'credit_limit' || j.error === 'charge_failed')) return '이 계정은 지금 이 요청에 제안을 보낼 수 없습니다.';
      if (j.error === 'card_required') { needCard = true; return `결제 카드가 없습니다. 설정 → 계정 · 구독에서 카드를 등록하면 제안을 보낼 수 있습니다 — 크레딧 ${won(j.fee ?? 0)}은 고객이 제안을 열 때 결제됩니다.`; }
      if (j.error === 'credit_limit') return `이번 달 크레딧 한도(${won(j.limit ?? 0)})를 넘습니다 — 이번 달 결제 ${won(j.used ?? 0)}${(j as { reserved?: number }).reserved ? ` · 예약 ${won((j as { reserved?: number }).reserved!)}` : ''}. 다음 달 1일에 다시 열립니다.`;
      if (j.error === 'charge_failed') { needCard = true; return `카드 결제가 되지 않았습니다${j.message ? ` (${j.message})` : ''}. 카드를 바꾸거나 잠시 뒤 다시 해 주세요.`; }
      return null;
    } catch { return null; }
  }
  async function build() {
    if (problems.length || !app.room) return;
    error = '';
    try {
      busy = '링크 만드는 중…';
      // 실사 이미지는 만들지 않는다 — 고객 페이지는 가게 사진 위에 사인물 외곽선을 바로 그린다 (2026-10-24)
      const info: ProposalInfo = { id: crypto.randomUUID(), createdAt: Date.now(), author: app.nickname, renders: [], hash: app.contentHash, ...(note.trim() ? { note: note.trim() } : {}) };
      app.updateSettings({ proposal: info });
      const inv = await createInvite(app.room, 'viewer', 'proposal');
      link = `${SERVER_URL}/p/${app.room}/${inv.token}`;
      // 발행 = 박제 (2026-10-26): 고객에게는 이 발행본만 보인다 — 이후 단가·원가·배수가 바뀌어도 그대로
      app.issueQuote(info.id, note.trim() || undefined);
      copied = false;
      if (app.access.status === 'ok' && app.access.credit) app.creditReserved(); // 예약 — 고객이 열면 결제되고 가게 정보·연락처가 열린다
    } catch (e) {
      // 무료 요금제 월 건수 한도 (2026-10-17): 서버 402 proposal_limit
      error = e instanceof AuthError && e.status === 402 ? creditError(e.message) ?? proposalLimitMessage(e.message) : e instanceof Error ? e.message : String(e);
    } finally { busy = ''; }
  }
  async function copy() { await navigator.clipboard.writeText(link); copied = true; }
  const preview = () => { app.proposalMode = true; close(); };
</script>

<div class="backdrop" role="presentation" onpointerdown={nudgeClose}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="제안 보내기" data-testid="proposal-dialog">
    <header><h2>제안 보내기</h2><button class="icon" data-close data-testid="close-proposal" title="닫기" onclick={close}>✕</button></header>
    <div class="body">
      <p class="hint">고객에게 보낼 링크 하나: 가게 사진 위 간판 자리 · 사인물 치수 · 총 금액 · 질문 · <b>[진행 동의]</b>. 로그인 없이 휴대폰에서 열리고, 다른 사람에게 그대로 전달할 수 있습니다.</p>

      {#if approval.status !== 'none'}
        <div class="approval" data-testid="proposal-approval" data-status={approval.status}>
          {#if approval.status === 'approved'}✅ <b>{approval.approval.by}</b> 님이 {date(approval.approval.at)}에 진행에 동의했습니다 (합계 {won(approval.approval.snapshot.total)}).
          {:else}⚠ {approval.approval.by} 님이 {date(approval.approval.at)}에 승인한 뒤 <b>내용이 바뀌었습니다</b>. 다시 제안을 보내 재승인을 받으세요.{/if}
        </div>
      {/if}

      {#if problems.length}
        <section>
          <h3>먼저 채워야 할 것</h3>
          <ul class="problems" data-testid="proposal-problems">{#each problems as p, i (i)}<li>{p}</li>{/each}</ul>
        </section>
      {:else}
        <section>
          <h3>내용</h3>
          <p class="sum" data-testid="proposal-summary">사인물 {app.signs.length}개 · 사진 {app.photos.filter((p) => app.signs.some((o) => o.photoId === p.id)).length}장 · 합계 {won(app.quote.total)}{app.quote.vatIncluded ? ' (부가세 포함)' : ' (부가세 포함)'}</p>
          {#if app.latestIssue}
            <p class="issued" data-testid="proposal-issued">발행 #{app.latestIssue.no} · {date(app.latestIssue.at)} · 합계 {won(app.latestIssue.snapshot.total)}{#if !app.issueChanged} — <b>지금 내용 그대로</b>{:else} — <b>발행 뒤 바뀜</b>, 다시 발행하면 고객에게 변경 견적 #{app.latestIssue.no + 1}으로 갑니다{/if}</p>
          {/if}
          {#if app.issueChanged && app.draftDiff}
            <!-- 고객에게 이렇게 보입니다 (2026-10-26 고객 안전장치): 계약 견적(없으면 마지막 발행본)과 비교 -->
            <div class="preview" data-testid="proposal-change-preview">
              <h3>고객에게 이렇게 보입니다</h3>
              <QuoteChange diff={app.draftDiff.diff} risks={app.draftDiff.risks} baseLabel={app.customerQuote.contract ? `계약 #${app.draftDiff.base.no}` : `발행 #${app.draftDiff.base.no}`} nextLabel="이번 발행" />
            </div>
          {/if}
          <label>고객에게 한마디 (선택)<textarea data-testid="proposal-note" rows="2" bind:value={note} placeholder="예: 야간 모습도 꼭 확인해 보세요. 궁금한 점은 사인물마다 질문 남겨 주세요."></textarea></label>
        </section>
      {/if}

      {#if credit && paymentsShown()}
        {#if credit.error}
          <p class="credit err" data-testid="proposal-credit-failed">고객이 제안을 열었지만 <b>크레딧 {won(credit.fee)}</b> 카드 결제가 되지 않았습니다 ({credit.error}). 카드를 확인하고 다시 결제하면 <b>가게 정보·연락처</b>가 열립니다. <button class="btn small primary" data-testid="proposal-credit-retry" disabled={!!busy} onclick={retry}>다시 결제</button></p>
        {:else if credit.reserved}
          <p class="credit" data-testid="proposal-credit-reserved"><b>크레딧 {won(credit.fee)} 예약됨</b> — 고객이 제안을 열 때 등록 카드로 결제되고, 그때 가게 사장님의 <b>가게 정보·연락처</b>가 열립니다.</p>
        {:else}
          <p class="credit" data-testid="proposal-credit">이 요청에 첫 제안을 보내면 <b>크레딧 {won(credit.fee)}</b>이 예약되고, 고객이 제안을 열 때 등록 카드로 결제됩니다. 그때 가게 사장님의 <b>가게 정보·연락처</b>가 열립니다.{#if !credit.on} <small>(지금은 정식 결제 전이라 무료 — 제안을 보내면 바로 열립니다)</small>{/if}</p>
        {/if}
      {/if}
      <section>
        {#if busy}
          <p class="busy" data-testid="proposal-busy">{busy}</p>
        {:else}
          <button class="btn primary" data-testid="proposal-build" disabled={!!problems.length} onclick={build}>{app.latestIssue && app.issueChanged ? `변경 견적 발행 (#${app.latestIssue.no + 1})` : proposal ? '새 링크 발급' : '링크 발급'}</button>
        {/if}
        {#if error}<p class="warn" data-testid="proposal-error">{error}</p>{/if}
        {#if needCard && paymentsShown()}<button class="btn small" data-testid="proposal-card" onclick={() => { close(); app.settingsOpen = true; }}>카드 등록하러 가기</button>{/if}
        {#if link}
          <div class="url">
            <input data-testid="proposal-link" readonly value={link} onfocus={(e) => e.currentTarget.select()} />
            <button class="btn small" data-testid="proposal-copy" onclick={copy}>{copied ? '복사됨 ✓' : '복사'}</button>
          </div>
          <p class="hint">카카오톡·문자에 붙여 넣으면 가게 사진 미리보기와 함께 보입니다. 링크를 받은 사람은 보기·질문·승인만 할 수 있습니다.</p>
        {/if}
        {#if proposal}
          <p class="hint">마지막 제안: {date(proposal.createdAt)} · {proposal.author}{#if proposal.hash !== app.contentHash} · <b>그 뒤 내용이 바뀜</b>{/if}</p>
          <button class="btn small" data-testid="proposal-preview" onclick={preview}>고객이 보는 제안 페이지 미리보기</button>
        {/if}
      </section>
    </div>
  </div>
</div>

<style>
  .credit { font-size: 13px; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .credit.err { background: color-mix(in srgb, #ef4444 14%, transparent); }
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 64px); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  header { display: flex; align-items: center; gap: 6px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  h2 { flex: 1; margin: 0; font-size: 16px; }
  .body { overflow: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
  section { display: flex; flex-direction: column; gap: 8px; }
  h3 { margin: 0; font-size: 12px; color: var(--muted); }
  .hint { color: var(--muted); font-size: 12px; margin: 0; line-height: 1.5; }
  .sum { margin: 0; font-size: 13px; }
  .problems { margin: 0; padding-left: 18px; color: var(--warn); font-size: 13px; }
  .approval { border-radius: 10px; padding: 10px 12px; font-size: 13px; background: rgba(61, 220, 132, 0.1); border: 1px solid rgba(61, 220, 132, 0.4); }
  .approval[data-status='changed'] { background: rgba(255, 170, 0, 0.1); border-color: rgba(255, 170, 0, 0.5); }
  .busy { color: var(--accent); font-size: 13px; margin: 0; }
  .warn { color: var(--warn); font-size: 12px; margin: 0; }
  .url { display: flex; gap: 6px; }
  .url input { flex: 1; }
  label { display: flex; flex-direction: row; align-items: flex-start; gap: 8px; font-size: 12px; color: var(--muted); white-space: nowrap; }
  label > textarea { flex: 1; min-width: 0; white-space: normal; }
  textarea { width: 100%; box-sizing: border-box; }
  .issued { font-size: 13px; color: var(--muted); margin: 4px 0; }
  .preview { border: 1px solid var(--line); border-radius: 10px; padding: 10px; margin: 6px 0; }
  .preview h3 { margin: 0 0 6px; font-size: 13px; }
</style>
