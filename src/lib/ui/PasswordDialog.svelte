<!-- 비밀번호 정하기·바꾸기 (재설정 링크로 들어온 직후에는 현재 비밀번호 없이) -->
<script lang="ts">
  import { nudgeClose } from './dialogGuard';
  import PasswordField from './PasswordField.svelte';
  import { app } from '../state.svelte';
  import { describeAuthError, setPassword, PASSWORD_MIN } from '../auth';

  const reset = $derived(app.passwordOpen === 'reset');
  const needCurrent = $derived(!reset && !!app.account?.hasPassword);
  let current = $state('');
  let pw = $state('');
  let pw2 = $state('');
  let error = $state('');
  let done = $state(false);
  let busy = $state(false);
  function close() { app.passwordOpen = null; }
  async function submit() {
    error = '';
    if (pw.length < PASSWORD_MIN) { error = `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`; return; }
    if (pw !== pw2) { error = '두 비밀번호가 다릅니다.'; return; }
    busy = true;
    try {
      await setPassword(pw, needCurrent ? current : undefined);
      done = true;
      if (app.account) app.account = { ...app.account, hasPassword: true };
    } catch (e) { error = describeAuthError(e, 'password'); }
    finally { busy = false; }
  }
</script>

<div class="backdrop" role="presentation" onpointerdown={nudgeClose}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="비밀번호" data-testid="password-dialog">
    <header><h2>{reset ? '새 비밀번호 정하기' : app.account?.hasPassword ? '비밀번호 바꾸기' : '비밀번호 만들기'}</h2><button class="icon" data-close title="닫기" onclick={close}>✕</button></header>
    {#if done}
      <p data-testid="password-done">비밀번호를 저장했습니다. 다음부터 이메일과 비밀번호로 로그인하세요.</p>
      <button class="btn primary" onclick={close}>확인</button>
    {:else}
      <form novalidate onsubmit={(e) => { e.preventDefault(); submit(); }}>
        {#if needCurrent}<label>현재 비밀번호<PasswordField testid="password-current" bind:value={current} /></label>{/if}
        <label>새 비밀번호 ({PASSWORD_MIN}자 이상)<PasswordField testid="password-new" bind:value={pw} autocomplete="new-password" /></label>
        <label>새 비밀번호 확인<PasswordField testid="password-new2" bind:value={pw2} autocomplete="new-password" /></label>
        <button class="btn primary" data-testid="password-save" type="submit" disabled={busy}>저장</button>
      </form>
    {/if}
    {#if error}<p class="error" data-testid="password-error">{error}</p>{/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 65; }
  .dialog { width: min(380px, calc(100vw - 32px)); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px 18px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); display: flex; flex-direction: column; gap: 10px; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 16px; }
  form { display: flex; flex-direction: column; gap: 10px; }
  .error { color: var(--danger); font-size: 13px; margin: 0; }
  p { margin: 0; font-size: 13px; line-height: 1.5; }
</style>
