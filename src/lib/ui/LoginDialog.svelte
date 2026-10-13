<!-- 이메일 매직링크 로그인 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { describeAuthError, fetchProviders, requestLink, socialStartUrl, verifyToken, type SocialProvider } from '../auth';

  const LABEL: Record<SocialProvider, string> = { kakao: '카카오로 시작', google: 'Google로 시작', apple: 'Apple로 시작' };
  let providers = $state<SocialProvider[]>([]);
  $effect(() => { fetchProviders().then((p) => (providers = p)); });
  const next = location.pathname + location.search;

  let email = $state('');
  let sent = $state<string | null>(null);
  let devLink = $state<string | null>(null);
  let busy = $state(false);
  let error = $state(app.authError);

  async function submit() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { error = '이메일 주소를 확인해 주세요.'; return; }
    busy = true; error = '';
    try {
      const r = await requestLink(email);
      sent = email.trim().toLowerCase();
      devLink = r.link ?? null;
    } catch (e) {
      error = describeAuthError(e);
    } finally { busy = false; }
  }

  /** 개발 모드: 서버가 돌려준 링크의 토큰으로 바로 로그인 */
  async function useDevLink() {
    const token = devLink && new URL(devLink).searchParams.get('token');
    if (!token) return;
    try { app.applyAccount(await verifyToken(token)); close(); } catch (e) { error = describeAuthError(e); }
  }

  function close() { app.loginOpen = false; app.authError = ''; }
</script>

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="로그인" data-testid="login-dialog">
    <header><h2>로그인</h2><button class="icon" title="닫기" onclick={close}>✕</button></header>
    {#if sent}
      <p data-testid="login-sent"><b>{sent}</b>로 로그인 링크를 보냈습니다. 메일함을 확인해 주세요. (링크는 15분간 유효)</p>
      {#if devLink}
        <button class="btn primary" data-testid="login-dev-link" onclick={useDevLink}>개발 모드: 바로 로그인</button>
      {/if}
      <button class="btn small" onclick={() => (sent = null)}>다른 이메일로</button>
    {:else}
      {#if providers.length}
        <div class="social">
          {#each providers as p (p)}
            <a class="btn social-{p}" data-testid="social-{p}" href={socialStartUrl(p, next)}>{LABEL[p]}</a>
          {/each}
        </div>
        <div class="or"><span>또는 이메일로</span></div>
      {/if}
      <!-- 브라우저 기본 검증 대신 앱이 같은 문구로 안내 -->
      <form novalidate onsubmit={(e) => { e.preventDefault(); submit(); }}>
        <label>이메일
          <input data-testid="login-email" type="email" bind:value={email} placeholder="you@example.com" autocomplete="email" />
        </label>
        <p class="hint">비밀번호 없이 이메일로 받은 링크를 눌러 로그인합니다. 처음이면 계정이 만들어집니다.</p>
        <button class="btn primary" data-testid="login-submit" type="submit" disabled={busy || !email.trim()}>로그인 링크 받기</button>
      </form>
    {/if}
    {#if error}<p class="error" data-testid="login-error">{error}</p>{/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(400px, calc(100vw - 32px)); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px 18px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); display: flex; flex-direction: column; gap: 10px; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 16px; }
  form { display: flex; flex-direction: column; gap: 10px; }
  .social { display: flex; flex-direction: column; gap: 8px; }
  .social .btn { text-decoration: none; justify-content: center; font-weight: 700; }
  .social-kakao { background: #fee500; color: #191919; border-color: #fee500; }
  .social-google { background: #fff; color: #1f1f1f; border-color: #dadce0; }
  .social-apple { background: #000; color: #fff; border-color: #000; }
  .or { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 12px; }
  .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  .error { color: var(--danger); font-size: 13px; margin: 0; }
  p { margin: 0; font-size: 13px; line-height: 1.5; }
</style>
