<!-- 방 접근 불가 안내 -->
<script lang="ts">
  import { app } from '../state.svelte';
  const code = $derived(app.access.status === 'denied' ? app.access.code : 0);
</script>

<div class="denied" data-testid="access-denied">
  {#if code === 404}
    <h2>존재하지 않는 프로젝트입니다</h2>
    <p>주소가 맞는지, 프로젝트가 삭제되지 않았는지 확인해 주세요.</p>
  {:else if code === 401}
    <h2>초대 링크가 필요합니다</h2>
    <p>이 프로젝트를 보려면 제작자가 보낸 초대 링크로 들어오거나, 소유자 계정으로 로그인하세요.</p>
    {#if !app.account}<button class="btn primary" onclick={() => (app.loginOpen = true)}>로그인</button>{/if}
  {:else if code === 403}
    <h2>이 프로젝트에 권한이 없습니다</h2>
    <p>다른 계정의 프로젝트이거나 초대 링크가 폐기되었습니다. 제작자에게 새 링크를 요청하세요.</p>
  {:else}
    <h2>서버에 연결할 수 없습니다</h2>
    <p>잠시 후 다시 시도해 주세요.</p>
  {/if}
  <a class="btn small" href="/">홈으로</a>
</div>

<style>
  .denied { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; gap: 10px; padding: 16px; }
  h2 { margin: 0; font-size: 20px; }
  p { color: var(--muted); max-width: 420px; line-height: 1.6; margin: 0; }
  .btn { justify-self: center; }
</style>
