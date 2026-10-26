<!--
  구독 (2026-10-23 토스 자동결제): 설정 "계정 · 구독". 사업자 확인 → [베이직/프로 구독] → 토스 카드 등록 → 첫 달 결제.
  구독 중: 다음 결제일·카드·결제 내역, [다음 결제일부터 요금제 바꾸기], [카드 바꾸기], [해지 예약]/[해지 취소]. 결제 실패 유예(7일) 안내
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { askConfirm } from './ask.svelte';
  import { app } from '../state.svelte';
  import { PLAN_LABEL } from '../auth';
  import { cancelSubscription, describeBillingError, fetchBilling, resumeSubscription, setNextPlan, startCardRegistration, type BillingInfo } from '../billing';

  let info = $state<BillingInfo | null>(null);
  let busy = $state(false), error = $state('');
  const load = async () => { try { info = await fetchBilling(); } catch (e) { error = describeBillingError(e); } };
  // 사업자 확인·요금제가 실제로 바뀌면 다시 — 객체가 아니라 값으로 (refreshMe 마다 새 객체라 매번 다시 불렀다, 2026-10-27)
  const reloadKey = $derived(`${app.business?.status ?? ''}|${app.account?.plan ?? ''}|${app.billingEpoch}`);
  $effect(() => { void reloadKey; untrack(() => void load()); });
  const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
  const day = (ts: number | null) => (ts ? new Date(ts).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '');
  const sub = $derived(info?.sub?.plan ? info.sub : null);

  async function run(fn: () => Promise<unknown>) {
    busy = true; error = '';
    try { await fn(); await load(); await app.refreshMe(); } catch (e) { error = describeBillingError(e); } finally { busy = false; }
  }
  const subscribe = (plan: string) => run(() => startCardRegistration(plan, app.account?.email ?? '', app.account?.name ?? ''));
  const cancel = async () => { if (await askConfirm(`해지를 예약할까요? ${day(sub?.periodEnd ?? null)}까지는 지금처럼 쓰고, 그 뒤로 결제하지 않습니다. 기간 안에는 해지를 취소할 수 있습니다.`)) void run(cancelSubscription); };
</script>

{#if info?.configured}
  <section data-testid="billing-section">
    <h3>구독 <small class="hint">토스페이먼츠 카드 자동결제 · 매달 같은 날</small></h3>
    {#if info.test}<p class="hint test" data-testid="billing-test">테스트 결제입니다 — 실제로 청구되지 않습니다.</p>{/if}
    {#if !info.allowed}
      <p class="hint">지금은 카드사 심사 중이라 정해진 계정만 결제할 수 있습니다. 곧 열립니다.</p>
    {:else if sub?.plan}
      <div data-testid="billing-status">
        <p class="row"><span><b>{PLAN_LABEL[sub.plan ?? ''] ?? sub.plan}</b> 구독 중{#if !sub.autoRenew} · <b class="warn">해지 예약</b> — {day(sub.periodEnd)}까지 사용{/if}</span>
          {#if sub.autoRenew}<span>다음 결제일 {day(sub.periodEnd)}</span>{/if}</p>
        {#if sub.nextPlan}<p class="hint">다음 결제일부터 {PLAN_LABEL[sub.nextPlan] ?? sub.nextPlan} ({won(info.plans.find((p) => p.id === sub.nextPlan)?.priceKrw ?? 0)}/월)</p>{/if}
        {#if sub.graceUntil}<p class="hint err" data-testid="billing-grace">결제가 되지 않았습니다{sub.lastError ? ` (${sub.lastError})` : ''}. {day(sub.graceUntil)}까지 매일 다시 시도하고, 그때까지는 지금처럼 쓸 수 있습니다. 카드를 바꾸면 바로 다시 결제합니다.</p>{/if}
      </div>
      <p class="row"><span data-testid="billing-card">결제 카드 {sub.card || '—'}</span><button class="btn small" data-testid="billing-card-change" disabled={busy} onclick={() => subscribe(sub.plan ?? 'basic')}>카드 바꾸기</button></p>
      <p class="row">
        {#if sub.autoRenew}
          <label>요금제 <select data-testid="billing-next-plan" value={sub.nextPlan ?? sub.plan} disabled={busy} onchange={(e) => run(() => setNextPlan(e.currentTarget.value))}>
            {#each info.plans as p (p.id)}<option value={p.id}>{p.name} {won(p.priceKrw)}/월{p.id === sub.plan ? ' (지금)' : ' — 다음 결제일부터'}</option>{/each}
          </select></label>
          <button class="btn small" data-testid="billing-cancel" disabled={busy} onclick={cancel}>해지 예약</button>
        {:else}
          <button class="btn small primary" data-testid="billing-resume" disabled={busy} onclick={() => run(resumeSubscription)}>해지 취소</button>
        {/if}
      </p>
    {:else if !info.business}
      <p class="hint" data-testid="billing-need-business">구독하려면 먼저 아래 <b>사업자 확인</b>을 해 주세요 (세금계산서 발행 조건).</p>
    {:else}
      <!-- 카드만 (2026-10-24 요청 크레딧): 구독 없이 견적 요청에 제안할 때 크레딧이 이 카드로 -->
      {#if info.sub?.hasCard}
        <p class="row"><span data-testid="billing-card">결제 카드 {info.sub.card || '—'} <small class="hint">견적 요청 크레딧용</small></span><button class="btn small" data-testid="billing-card-change" disabled={busy} onclick={() => subscribe('card')}>카드 바꾸기</button></p>
      {:else}
        <p class="row"><span class="hint">견적 요청에 제안할 때 크레딧(자동 견적의 0.3%, 3천~5만원)은 등록 카드로 결제됩니다.</span><button class="btn small" data-testid="billing-card-only" disabled={busy} onclick={() => subscribe('card')}>카드만 등록</button></p>
      {/if}
      <div class="plans">
        {#each info.plans as p (p.id)}
          <button class="btn plan" class:primary={p.id === 'basic'} data-testid="billing-subscribe-{p.id}" disabled={busy} onclick={() => subscribe(p.id)}>{p.name} 구독 · {won(p.priceKrw)}/월</button>
        {/each}
      </div>
      <p class="hint">카드를 등록하면 첫 달이 바로 결제되고, 매달 같은 날 자동으로 결제됩니다. 언제든 해지 예약할 수 있습니다. 결제일로부터 7일 안에 유료 기능을 쓰지 않았다면 전액 환불되고, 쓰기 시작한 기간은 청약철회가 제한됩니다.</p>
    {/if}
    {#if error}<p class="hint err" data-testid="billing-error">{error}</p>{/if}
    <p class="hint links"><a href="/terms" target="_blank" rel="noopener" data-testid="billing-terms">이용약관</a> · <a href="/refund" target="_blank" rel="noopener" data-testid="billing-refund">환불 정책</a> · <a href="/privacy" target="_blank" rel="noopener" data-testid="billing-privacy">개인정보처리방침</a> · 문의 <a href="mailto:support@ganpanda.co.kr">support@ganpanda.co.kr</a></p>
    {#if info.payments.length}
      <details data-testid="billing-history">
        <summary>결제 내역 {info.payments.length}건</summary>
        <ul>
          {#each info.payments as p (p.orderId)}
            <li><span>{day(p.at)}</span> <span>{p.kind === 'credit' ? '견적 크레딧' : PLAN_LABEL[p.plan] ?? p.plan}</span> <b>{won(p.amount)}</b> <span class:err={p.status !== 'DONE'}>{p.status === 'DONE' ? '결제됨' : p.status === 'CANCELED' ? '취소됨' : `실패${p.error ? ` (${p.error})` : ''}`}</span>{#if p.receiptUrl} <a href={p.receiptUrl} target="_blank" rel="noopener">영수증</a>{/if}</li>
          {/each}
        </ul>
      </details>
    {/if}
  </section>
{/if}

<style>
  .test { color: #b45309; }
  .warn { color: #b45309; }
  .err { color: #dc2626; }
  .plans { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
  .plan { padding: 10px 14px; font-weight: 700; }
  details ul { list-style: none; padding: 0; margin: 6px 0; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
  details li { display: flex; gap: 8px; flex-wrap: wrap; }
  label select { margin-left: 6px; }
</style>
