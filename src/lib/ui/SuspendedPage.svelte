<!-- 이용 정지 화면 (2026-10-27 약관 개정안 제5조의2): 정지된 계정은 다른 화면 대신 이것만 — 사유·기간, 이의 신청(14일), 로그아웃, 계정 삭제는 설정에서 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { postAppeal } from '../projects';
  const sp = $derived(app.account?.suspension);
  let text = $state('');
  let sent = $state(false);
  let error = $state('');
  let busy = $state(false);
  async function send() {
    if (!text.trim() || busy) return;
    busy = true; error = '';
    try { await postAppeal(text.trim()); sent = true; }
    catch (e) { error = (e as { status?: number }).status === 409 ? '이미 처리 대기 중인 이의 신청이 있습니다. 결과를 이메일로 알려 드립니다.' : '보내지 못했습니다. 잠시 뒤 다시 해 주세요.'; }
    finally { busy = false; }
  }
</script>

{#if sp}
  <div class="page" data-testid="suspended-page">
    <h1>{sp.banned ? '이용이 영구 정지되었습니다' : '이용이 정지되었습니다'}</h1>
    <p>간판다 이용약관에 따라 이 계정의 이용을 {sp.banned ? '영구 정지(이용계약 해지)' : `${new Date(sp.until!).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}까지 정지`}했습니다.</p>
    {#if sp.reason}<p class="reason" data-testid="suspended-reason">사유: {sp.reason}</p>{/if}
    <section>
      <h2>이의 신청</h2>
      {#if sent}<p class="ok" data-testid="appeal-sent">이의 신청을 받았습니다. 검토 결과를 이메일로 알려 드립니다.</p>
      {:else}
        <p class="hint">통지를 받은 날부터 14일 안에 이의를 신청할 수 있습니다. 사정을 적어 주세요.</p>
        <textarea data-testid="appeal-text" rows="4" bind:value={text} placeholder="예: 광고가 아니라 실제 고객 안내였습니다"></textarea>
        <button class="btn primary" data-testid="appeal-send" disabled={!text.trim() || busy} onclick={send}>이의 신청 보내기</button>
        {#if error}<p class="err">{error}</p>{/if}
      {/if}
    </section>
    <p class="hint">문의: <a href="mailto:support@ganpanda.co.kr">support@ganpanda.co.kr</a></p>
    <button class="btn" data-testid="suspended-logout" onclick={() => app.logout()}>로그아웃</button>
  </div>
{/if}

<style>
  .page { max-width: 520px; margin: 40px auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  h1 { margin: 0; font-size: 20px; color: #f87171; }
  h2 { margin: 0 0 6px; font-size: 15px; }
  p { margin: 0; line-height: 1.6; }
  .reason { padding: 10px 12px; border-radius: 10px; background: rgba(239, 68, 68, 0.12); }
  section { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); }
  textarea { background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 8px; font: inherit; font-size: 15px; }
  .hint { color: var(--muted); font-size: 13px; }
  .ok { color: #86efac; }
  .err { color: #f87171; font-size: 13px; }
</style>
