<!-- 제안 보내기 (제작자): 준비 점검 → 고객용 링크 발급 (2026-10-24 "실사이미지 만들필요가 없고 링크발급으로" — 전엔 사진마다 실사 주간·야간 PNG 를 만들어 올렸다). 승인 상태도 여기서 본다 -->
<script lang="ts">
  import { nudgeClose } from './dialogGuard';
  import { app } from '../state.svelte';
  import { createInvite } from '../projects';
  import { AuthError } from '../auth';
  import { proposalProblems, type ProposalInfo } from '../core/proposal';
  import { SERVER_URL } from '../sync';
  import { won } from '../core/quote';

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
    try { const j = JSON.parse(body) as { used: number; limit: number }; return `무료 요금제는 제안 링크가 한 달 ${j.limit}건까지입니다 (이번 달 ${j.used}건). 다음 달에 다시 만들거나 베이직 요금제로 올리면 무제한입니다.`; }
    catch { return '무료 요금제의 이번 달 제안 링크 한도에 도달했습니다. 베이직 요금제로 올리면 무제한입니다.'; }
  }
  /** 요청 크레딧 (2026-10-24): 이 요청의 첫 제안이면 크레딧 결제 → 사진·가게 정보·연락처가 열린다 */
  const credit = $derived(app.access.status === 'ok' && app.access.credit && !app.access.credit.paid ? app.access.credit : null);
  let needCard = $state(false);
  function creditError(body: string): string | null {
    try {
      const j = JSON.parse(body) as { error?: string; fee?: number; used?: number; limit?: number; message?: string };
      if (j.error === 'card_required') { needCard = true; return `결제 카드가 없습니다. 설정 → 계정 · 구독에서 카드를 등록하면 크레딧 ${won(j.fee ?? 0)}이 결제되고 제안이 만들어집니다.`; }
      if (j.error === 'credit_limit') return `이번 달 크레딧 한도(${won(j.limit ?? 0)})를 넘습니다 — 이번 달 ${won(j.used ?? 0)} 사용. 다음 달 1일에 다시 열립니다.`;
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
      copied = false;
      if (app.access.status === 'ok' && app.access.credit) app.creditPaid(); // 가게 정보·연락처가 열린다
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
          <label>고객에게 한마디 (선택)<textarea data-testid="proposal-note" rows="2" bind:value={note} placeholder="예: 야간 모습도 꼭 확인해 보세요. 궁금한 점은 사인물마다 질문 남겨 주세요."></textarea></label>
        </section>
      {/if}

      {#if credit}
        <p class="credit" data-testid="proposal-credit">이 요청에 첫 제안을 보내면 <b>크레딧 {won(credit.fee)}</b>{credit.on ? '이 등록 카드로 결제되고' : '이 쓰이고'}, 가게 사장님의 <b>가게 정보·연락처</b>가 열립니다.{#if !credit.on} <small>(지금은 정식 결제 전이라 무료입니다)</small>{/if}</p>
      {/if}
      <section>
        {#if busy}
          <p class="busy" data-testid="proposal-busy">{busy}</p>
        {:else}
          <button class="btn primary" data-testid="proposal-build" disabled={!!problems.length} onclick={build}>{proposal ? '새 링크 발급' : '링크 발급'}</button>
        {/if}
        {#if error}<p class="warn" data-testid="proposal-error">{error}</p>{/if}
        {#if needCard}<button class="btn small" data-testid="proposal-card" onclick={() => { close(); app.settingsOpen = true; }}>카드 등록하러 가기</button>{/if}
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
</style>
