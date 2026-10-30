<!--
  요금제 (2026-10-30 사용자: "무료로 사용하시고 정식서비스될때 유료사용으로 전환하게 하고 바로 서비스들어간다. 유료 버전을 신청하면 1-2시간 후에 처리해주고
  정식 결제서비스 시작되면 그때 유료 전환을 요청한다." → "운영자가 아니고 서버에서"): 정식 결제 전에는 카드 결제 칸 대신 [유료 버전 신청].
  신청하면 서버가 1~2시간 안에 요금제를 올리고 결제는 없다. 정식 결제가 시작되면(서버 PAYMENTS_LIVE) 원래 구독 칸(BillingSection)
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../state.svelte';
  import { PLAN_LABEL } from '../auth';
  import { describeBillingError, fetchPlanRequest, requestPlan, type PlanRequestInfo } from '../billing';
  import BillingSection from './BillingSection.svelte';

  let info = $state<PlanRequestInfo | null>(null);
  let busy = $state(false), error = $state('');
  const load = async (tries = 3) => {
    try { info = await fetchPlanRequest(); error = ''; }
    catch (e) { if (tries > 1) { await new Promise((ok) => setTimeout(ok, 800)); return load(tries - 1); } error = describeBillingError(e); }
  };
  const reloadKey = $derived(`${app.account?.plan ?? ''}|${app.billingEpoch}`);
  $effect(() => { void reloadKey; if (app.account?.paymentsBeta !== false) untrack(() => void load()); });
  const plan = $derived(app.account?.plan ?? 'free');
  const req = $derived(info?.request ?? null); // 신청 상태는 따로 불러온다 — 정식 결제 전인지는 /api/me 로 바로 (설정이 늦게 뜨지 않게)
  const pending = $derived(!!req && !req.grantedAt);
  const time = (t: number) => new Date(t).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const PLANS = [
    { id: 'basic' as const, name: '베이직', note: '저장 5GB · 멤버 5명 · 제안 무제한', after: '30,000원/월' },
    { id: 'pro' as const, name: '프로', note: '저장 20GB · 멤버 10명 · 제안 무제한 · 버전 30일', after: '60,000원/월' },
  ];
  async function apply(id: 'basic' | 'pro') {
    busy = true; error = '';
    try { await requestPlan(id); await load(); } catch (e) { error = describeBillingError(e); } finally { busy = false; }
  }
</script>

{#if app.account?.paymentsBeta === false}<!-- 값이 없으면(옛 기억) 결제 전으로 — 카드 칸이 잠깐이라도 뜨지 않게 -->
  <BillingSection />
{:else if app.account}
  <section data-testid="plan-request">
    <h3>요금제 <small class="hint">정식 결제 시작 전 — 유료 기능을 무료로 드립니다</small></h3>
    <p class="row"><span>지금 <b>{PLAN_LABEL[plan] ?? plan}</b>{#if plan !== 'free' && req?.grantedAt} <small class="hint">(무료 제공 중)</small>{/if}</span></p>
    {#if pending && req}
      <p class="hint ok" data-testid="plan-request-status"><b>{PLAN_LABEL[req.plan] ?? req.plan}</b> 신청됨 ({time(req.requestedAt)}) — 1~2시간 안에 적용됩니다.</p>
    {:else if req?.grantedAt && plan === req.plan}
      <p class="hint" data-testid="plan-request-status"><b>{PLAN_LABEL[req.plan] ?? req.plan}</b> 적용됨 — 정식 결제가 시작되면 유료 전환(카드 등록)을 따로 안내드립니다. 그 전까지는 청구되지 않습니다.</p>
    {/if}
    <div class="plans">
      {#each PLANS as p (p.id)}
        {#if p.id !== plan && !(pending && req?.plan === p.id)}
          <button class="btn plan" class:primary={p.id === 'basic'} data-testid="plan-request-{p.id}" disabled={busy} onclick={() => apply(p.id)}>
            <b>{p.name} 신청</b><small>{p.note}</small><small class="hint">정식 결제 후 {p.after}</small>
          </button>
        {/if}
      {/each}
    </div>
    <p class="hint">신청하면 1~2시간 안에 적용됩니다. 결제는 없고, 정식 결제가 시작되면 그때 유료 전환을 요청드립니다.</p>
    {#if error}<p class="hint err">{error}</p>{/if}
  </section>
{/if}

<style>
  .plans { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
  .plan { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 14px; text-align: left; }
  .plan small { font-weight: 400; }
  .ok { color: var(--ok); }
  .err { color: #dc2626; }
</style>
