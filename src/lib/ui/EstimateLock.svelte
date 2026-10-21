<script lang="ts">
  // 견적을 보낸 뒤 보드 잠금 (2026-10-22 사용자: "견적이 요청되면 수정이 불가능하다. 견적요청 취소 후 재 요청할수있다"):
  // 상단 바에 "견적 요청 중" + [요청 보기] + [취소]. 다른 기기·요청 페이지에서 취소했으면 열 때 알아채고 잠금을 푼다
  import { app } from '../state.svelte';
  import { cancelRequest, getRequest } from '../requests';
  const req = $derived(app.settings.estimateRequest);
  let busy = $state(false);
  function unlock(id: string) { app.project.updateSettings({ estimateRequest: undefined, estimatePrev: id }); }
  // 열 때 한 번: 요청이 이미 취소됐으면 잠금 해제
  let checked = '';
  $effect(() => {
    const r = req;
    if (!r || checked === r.id) return;
    checked = r.id;
    getRequest(r.id, '').then((v) => { if (v.request.status === 'cancelled') unlock(r.id); }).catch(() => undefined);
  });
  async function cancel() {
    if (!req || busy) return;
    if (!confirm('견적 요청을 취소할까요?\n\n제안을 보낸 간판집에는 제안 건수를 돌려 드리고, 보드를 다시 고칠 수 있어요. 고친 뒤 다시 보내면 그 간판집들에도 재견적을 요청합니다.')) return;
    busy = true;
    try { await cancelRequest(req.id); unlock(req.id); app.showFlash('요청을 취소했습니다 — 보드를 고친 뒤 다시 보내세요'); }
    catch (e) { app.notice = `취소하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`; }
    finally { busy = false; }
  }
</script>

{#if req}
  <span class="locked" data-testid="estimate-locked" title="보낸 요청은 고칠 수 없습니다 — 취소하면 다시 고칠 수 있어요">🔒 견적 요청 중</span>
  <a class="btn small primary" data-testid="estimate-view" href={req.url}>요청 보기</a>
  <button class="btn small" data-testid="estimate-cancel" disabled={busy} onclick={cancel}>요청 취소</button>
{/if}

<style>
  .locked { font-size: 12px; color: var(--accent); white-space: nowrap; }
  a.btn { text-decoration: none; }
</style>
