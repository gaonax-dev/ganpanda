<script lang="ts">
  // 견적을 보낸 뒤 보드 잠금 (2026-10-22 사용자: "견적이 요청되면 수정이 불가능하다. 견적요청 취소 후 재 요청할수있다"):
  // 상단 바에 "견적 요청 중" + [요청 보기] + [취소]. 다른 기기·요청 페이지에서 취소했으면 열 때 알아채고 잠금을 푼다. 취소는 요청을 닫기만 (환불·재요청 없음)
  import { app } from '../state.svelte';
  import { cancelRequest, getRequest } from '../requests';
  const req = $derived(app.settings.estimateRequest);
  let busy = $state(false);
  function unlock() { app.project.updateSettings({ estimateRequest: undefined }); }
  // 열 때 한 번: 요청이 이미 취소됐으면 잠금 해제
  let checked = '';
  $effect(() => {
    const r = req;
    if (!r || checked === r.id) return;
    checked = r.id;
    getRequest(r.id, '').then((v) => { if (v.request.status === 'cancelled') unlock(); }).catch(() => undefined);
  });
  async function cancel() {
    if (!req || busy) return;
    if (!confirm('견적 요청을 취소할까요?\n\n요청이 닫혀 더는 새 제안이 오지 않아요. 이미 제안한 간판집은 연락처를 받았으니 필요하면 직접 연락이 올 수 있어요. 보드는 다시 고칠 수 있고, 새로 요청할 수 있어요.')) return;
    busy = true;
    try { await cancelRequest(req.id); unlock(); app.showFlash('요청을 취소했습니다 — 보드를 다시 고칠 수 있어요'); }
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
