<script lang="ts">
  // 컨펌 아래 줄 (2026-10-22 사용자: "사진보드와 같은데 이런저런 표시없이 사인물(러프포함) 디자인과 사진에 올라간 상태가 있고 여기에 진행동의를 누르면 제작을 한다"):
  // 동의 상태 · 사인물 빼기(일부만 진행) · [진행 동의] → 제작(서버가 프로젝트를 진행중으로) · [고객에게 보내기](제안 링크)
  import { app } from '../state.svelte';
  import { customerSignState, memberCheckState } from '../core/proposal';
  // 사인물마다 멤버 확인·고객 동의는 정면도 카드에서 (2026-10-22 "현재방식은 대상을 파악하기 어렵다. 사인물마다") — 여기는 요약
  const memberOk = $derived(app.signs.filter((o) => memberCheckState(app.settings.signChecks?.[o.id], app.signHashes[o.id] ?? '').valid.length).length);
  const custOk = $derived(app.signs.filter((o) => customerSignState(app.approval.status === 'none' ? undefined : app.approval.approval, o.id, app.signHashes[o.id] ?? '', app.approval.status === 'approved') === 'ok').length);
  function send() {
    if (memberOk < app.signs.length && !confirm(`멤버 확인이 ${app.signs.length - memberOk}개 남았습니다. 그래도 고객에게 보낼까요?`)) return;
    app.proposalOpen = true;
  }
  const approval = $derived(app.approval);
  const signs = $derived(app.signs);
  const excluded = $derived(new Set(app.confirmExcluded));
  const lastExcluded = $derived(approval.status !== 'none' ? new Set(approval.approval.excluded ?? []) : new Set<string>());
  let busy = $state(false);
  const date = (ts: number) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  async function consent() {
    if (busy || !signs.length) return;
    const n = signs.length - excluded.size;
    if (!n) { app.notice = '진행할 사인물이 없습니다. 하나 이상 남겨 주세요.'; return; }
    if (!confirm(`사인물 ${n}개를 이 모습으로 제작합니다${excluded.size ? ` (${excluded.size}개 제외)` : ''}. 진행에 동의할까요?\n\n간판집이 대신 기록하는 경우 "간판집 기록"으로 남습니다.`)) return;
    busy = true;
    try { await app.approve(`${app.nickname || '간판집'} (간판집 기록)`, [...excluded]); app.showFlash('진행 동의를 기록했습니다 — 제작을 시작합니다'); }
    catch (e) { app.notice = e instanceof Error ? e.message : String(e); }
    finally { busy = false; }
  }
</script>

<div class="bar" data-testid="confirm-bar" data-status={approval.status}>
  <div class="state" data-testid="confirm-state">
    {#if approval.status === 'approved'}<b class="ok">✓ 진행 동의</b> {approval.approval.by} · {date(approval.approval.at)}{#if lastExcluded.size} · {lastExcluded.size}개 제외{/if} — <b>제작</b>
    {:else if approval.status === 'changed'}<b class="warn">⚠ 다시 동의 필요</b> {approval.approval.by} 님이 동의한 뒤 내용이 바뀌었습니다
    {:else}<span class="muted">아직 진행 동의 전 — 고객이 이 화면에서 [진행 동의]를 누르면 제작이 시작됩니다</span>{/if}
  </div>
  <div class="sum" data-testid="confirm-summary">
    <span class="pill" class:ok={memberOk === signs.length && signs.length > 0} data-testid="confirm-member-sum">멤버 확인 {memberOk}/{signs.length}</span>
    <span class="pill" class:ok={custOk === signs.length - (approval.status !== 'none' ? (approval.approval.excluded?.length ?? 0) : 0) && custOk > 0} data-testid="confirm-customer-sum">고객 동의 {custOk}/{signs.length}</span>
    {#if excluded.size}<span class="pill" data-testid="confirm-skip-sum">다음 동의에서 뺄 것 {excluded.size}</span>{/if}
    <span class="muted">— 사인물마다 정면도 카드 아래에서 확인</span>
  </div>
  <div class="acts">
    {#if app.canEdit}<button class="btn small" data-testid="confirm-send" onclick={send} title="고객에게 이 화면을 링크로 — 고객이 진행 동의">고객에게 보내기</button>{/if}
    <button class="btn primary" data-testid="confirm-consent" disabled={busy || !signs.length} onclick={consent}>{approval.status === 'approved' ? '다시 동의' : '진행 동의'}</button>
  </div>
</div>

<style>
  .bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 25; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 14px; background: var(--panel); border-top: 1px solid var(--line); box-shadow: 0 -8px 24px rgba(0,0,0,0.3); }
  .state { font-size: 13px; flex: 1 1 260px; }
  .ok { color: var(--ok); }
  .warn { color: var(--warn); }
  .muted { color: var(--muted); }
  .sum { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex: 2 1 300px; font-size: 12px; }
  .pill { border-radius: 999px; padding: 1px 9px; border: 1px solid var(--line); }
  .pill.ok { color: var(--ok); border-color: currentColor; }
  .acts { display: flex; gap: 8px; margin-left: auto; }
</style>
