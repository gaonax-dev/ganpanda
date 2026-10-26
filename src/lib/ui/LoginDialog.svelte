<!--
  로그인: 이메일·비밀번호가 기본 (2026-10-15 사용자: "oauth 는 유지하는데 기본 이메일 비밀번호 방식이 필요해").
  가입 · 비밀번호 찾기(재설정 메일) · 이메일 링크 로그인 · 카카오/구글/애플은 그대로
-->
<script lang="ts">
  import TermsNotice from './TermsNotice.svelte';
  import { nudgeClose } from './dialogGuard';
  import PasswordField from './PasswordField.svelte';
  import { app } from '../state.svelte';
  import { BUSINESS_ERROR } from '../business';
  import { bizStartDate, formatBizNo, isValidBizNo } from '../core/business';
  import { AuthError, describeAuthError, fetchProviders, inviteSignup, passwordLogin, requestLink, resendVerify, signup, socialStartUrl, socialTarget, verifyLink, PASSWORD_MIN, type SocialProvider } from '../auth';

  // 카카오가 기본 (2026-10-21 결정: 사람 = 카카오 로그인, 이메일은 대안). 서버가 카카오 키를 갖고 있을 때만 보인다
  const LABEL: Record<SocialProvider, string> = { kakao: '카카오로 시작', google: 'Google로 시작', apple: 'Apple로 시작' };
  let providers = $state<SocialProvider[]>([]);
  $effect(() => { fetchProviders().then((p) => (providers = p)); });
  const next = location.pathname + location.search;

  type Mode = 'login' | 'signup' | 'forgot' | 'link';
  /** 멤버 초대 링크로 들어옴 (2026-10-24) — 가입 화면, 이메일 고정, 사업자 칸 없음 */
  const invite = app.teamInvite;
  let mode = $state<Mode>(invite ? 'signup' : 'login');
  let email = $state(invite?.email ?? '');
  let password = $state('');
  let password2 = $state('');
  let name = $state('');
  // 이메일 가입 = 사업자 확인 (2026-10-24 — 간판집·가게 사장 모두. 카카오는 그대로)
  let bizNo = $state('');
  let bizOwner = $state('');
  let bizStart = $state('');
  let bizName = $state('');
  /** 메일 링크 로그인에 처음 보는 이메일 → [회원가입] 안내 */
  let noAccount = $state(false);
  let sent = $state<string | null>(null);
  /** 보낸 메일의 종류 */
  let sentKind = $state<'login' | 'reset' | 'verify'>('login');
  /** 인증 전 계정으로 로그인 시도 → [인증 메일 다시 받기] */
  let unverified = $state(false);
  let devLink = $state<string | null>(null);
  let busy = $state(false);
  let error = $state(app.authError);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function go(m: Mode) { mode = m; error = ''; sent = null; devLink = null; unverified = false; noAccount = false; }
  function close() { app.loginOpen = false; app.authError = ''; }
  async function run(f: () => Promise<void>, kind: Parameters<typeof describeAuthError>[1]) {
    busy = true; error = '';
    try { await f(); } catch (e) { error = serverError(e) ?? describeAuthError(e, kind); } finally { busy = false; }
  }
  /** 서버가 JSON 오류 코드로 답한 경우 (사업자 확인·가입된 계정 없음) */
  function serverError(e: unknown): string | null {
    if (!(e instanceof AuthError)) return null;
    let code = '';
    try { code = (JSON.parse(e.message) as { error?: string }).error ?? ''; } catch { return null; }
    if (code === 'no_account') { noAccount = true; return '가입된 계정이 없습니다. 회원가입하거나 카카오로 시작해 주세요.'; }
    if (code === 'business_required') return BUSINESS_ERROR.bad_input;
    if (code === 'expired' || code === 'not_found') return '초대 링크가 만료되었거나 이미 쓰였습니다. 초대한 분께 다시 보내 달라고 해 주세요.';
    if (code === 'email_mismatch') return '초대받은 이메일로만 가입할 수 있습니다.';
    return BUSINESS_ERROR[code] ?? null;
  }

  function submit() {
    const em = email.trim();
    if (!EMAIL_RE.test(em)) { error = '이메일 주소를 확인해 주세요.'; return; }
    if (mode === 'login') {
      if (!password) { error = '비밀번호를 입력해 주세요.'; return; }
      unverified = false;
      return run(async () => {
        try { app.applyAccount(await passwordLogin(em, password)); app.refreshMe(); close(); }
        catch (e) { if (e instanceof AuthError && e.status === 403) unverified = true; throw e; }
      }, 'login');
    }
    if (mode === 'signup') {
      if (password.length < PASSWORD_MIN) { error = `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`; return; }
      if (password !== password2) { error = '두 비밀번호가 다릅니다.'; return; }
      if (invite) {
        return run(async () => {
          const r = await inviteSignup(invite.email || em, password, name.trim(), invite.token);
          if ('verify' in r) { sent = em.toLowerCase(); sentKind = 'verify'; devLink = r.link ?? null; return; } // 링크 초대: 인증 메일을 열면 팀에
          app.applyAccount(r.account);
          app.teamInvite = null;
          app.notice = `${invite.ownerName}님의 팀에 들어왔습니다. 그룹과 프로젝트를 함께 봅니다.`;
          app.refreshMe();
          close();
        }, 'signup');
      }
      const startDate = bizStartDate(bizStart);
      if (!isValidBizNo(bizNo) || !bizOwner.trim() || !startDate) { error = BUSINESS_ERROR.bad_input; return; }
      const business = { no: bizNo, ownerName: bizOwner.trim(), startDate, name: bizName.trim() };
      return run(async () => { const r = await signup(em, password, name.trim(), business, linkNext()); sent = em.toLowerCase(); sentKind = 'verify'; devLink = r.link ?? null; }, 'signup');
    }
    // 비밀번호 찾기 / 이메일 링크
    return run(async () => {
      const r = await requestLink(em, mode === 'forgot', mode === 'forgot' ? undefined : linkNext());
      sent = em.toLowerCase();
      sentKind = mode === 'forgot' ? 'reset' : 'login';
      devLink = r.link ?? null;
    }, 'link');
  }

  /** 가게 사장 화면(/estimate)에서 가입·로그인하면 메일 링크도 그 화면으로 돌아온다 — 첫 화면(간판집)에 떨어져 간판집 계정이 되지 않게 (2026-10-24) */
  const linkNext = () => (location.pathname === '/estimate' ? '/estimate' : undefined);

  /** 개발 모드: 서버가 돌려준 링크의 토큰으로 바로 */
  async function useDevLink() {
    const token = devLink && new URL(devLink).searchParams.get('token');
    if (!token) return;
    try {
      const r = await verifyLink(token);
      app.applyAccount(r.account);
      close();
      if (r.reset) app.passwordOpen = 'reset';
    } catch (e) { error = describeAuthError(e); }
  }
  async function resend() {
    const em = email.trim();
    await run(async () => { const r = await resendVerify(em, linkNext()); sent = em.toLowerCase(); sentKind = 'verify'; devLink = r.link ?? null; error = ''; unverified = false; }, 'link');
  }
  const TITLE: Record<Mode, string> = { login: '로그인', signup: '회원가입', forgot: '비밀번호 찾기', link: '이메일 링크로 로그인' };
</script>

<div class="backdrop" role="presentation" onpointerdown={nudgeClose}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={TITLE[mode]} data-testid="login-dialog" data-mode={mode}>
    <header><h2>{TITLE[mode]}</h2><button class="icon" data-close title="닫기" onclick={close}>✕</button></header>
    {#if sent}
      {#if sentKind === 'verify'}
        <p data-testid="login-sent"><b>{sent}</b>로 <b>가입 인증 메일</b>을 보냈습니다. 메일의 [이메일 인증하기]를 누르면 가입이 끝나고 로그인됩니다. (링크는 24시간 유효) 메일이 안 보이면 스팸함도 확인해 주세요.</p>
      {:else}
        <p data-testid="login-sent"><b>{sent}</b>로 {sentKind === 'reset' ? '비밀번호 재설정' : '로그인'} 링크를 보냈습니다. 메일함을 확인해 주세요. (링크는 15분간 유효)</p>
      {/if}
      {#if devLink}<button class="btn primary" data-testid="login-dev-link" onclick={useDevLink}>개발 모드: 바로 열기</button>{/if}
      <button class="btn small" onclick={() => go('login')}>로그인으로 돌아가기</button>
    {:else}
      {#if invite && mode === 'signup'}<p class="invite-banner" data-testid="invite-banner"><b>{invite.ownerName}</b>님이 팀 멤버로 초대했습니다. {invite.email ? '카카오로 들어가거나, 아래에서 비밀번호만 정하면 바로 시작합니다.' : '카카오로 들어가면 바로, 이메일로 가입하면 인증 메일을 연 뒤 팀에 들어갑니다.'}</p>{/if}
      {#if providers.length && (mode === 'login' || mode === 'signup')}
        <div class="social">
          {#each providers as p (p)}<a class="btn social-{p}" class:big={p === 'kakao'} data-testid="social-{p}" href={socialStartUrl(p, next, invite?.token)} target={socialTarget()}>{invite && p === 'kakao' ? '카카오로 팀 들어가기' : LABEL[p]}</a>{/each}
          {#if invite}<p class="hint" data-testid="social-hint">카카오 이메일이 초대받은 이메일과 달라도 됩니다. 이 링크에서 시작하면 팀에 들어갑니다.</p>
          {:else if providers.includes('kakao')}<p class="hint" data-testid="social-hint">간판집·직원 모두 카카오로 시작하는 걸 권합니다. 휴대폰에서 한 번에 됩니다.</p>{/if}
        </div>
        <div class="or"><span>또는 이메일로</span></div>
      {/if}
      <!-- 브라우저 기본 검증 대신 앱이 같은 문구로 안내 -->
      <form novalidate onsubmit={(e) => { e.preventDefault(); submit(); }}>
        <label>이메일<input data-testid="login-email" type="email" bind:value={email} placeholder="you@example.com" autocomplete="email" disabled={!!invite?.email && mode === 'signup'} /></label>
        {#if mode === 'login' || mode === 'signup'}
          <label>비밀번호{mode === 'signup' ? ` (${PASSWORD_MIN}자 이상)` : ''}<PasswordField testid="login-password" bind:value={password} autocomplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label>
        {/if}
        {#if mode === 'signup'}
          <label>비밀번호 확인<PasswordField testid="login-password2" bind:value={password2} autocomplete="new-password" /></label>
          <label>이름 (선택)<input data-testid="login-name" bind:value={name} placeholder="예: 간판다 김사장" /></label>
          {#if !invite}
          <fieldset class="biz" data-testid="signup-business">
            <legend>사업자 확인</legend>
            <p class="why" data-testid="signup-biz-why">간판다는 <b>확인된 사업자와</b> 만나는 곳입니다. 간판집은 진짜 가게의 요청만, 가게 사장은 진짜 간판집의 견적만 받도록 사업자등록을 한 번 확인합니다. 카카오로 가입하면 이 단계 없이 바로 시작합니다.</p>
            <label>사업자등록번호<input data-testid="biz-no" inputmode="numeric" placeholder="123-45-67890" value={bizNo} oninput={(e) => (bizNo = formatBizNo(e.currentTarget.value))} /></label>
            <label>대표자 성명<input data-testid="biz-owner" placeholder="사업자등록증의 성명" bind:value={bizOwner} /></label>
            <label>개업일자 <small>(등록증의 개업연월일)</small><input data-testid="biz-start" type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} bind:value={bizStart} /></label>
            <label>상호 <small>(선택)</small><input data-testid="biz-name" placeholder="가게·간판집 이름" bind:value={bizName} /></label>
          </fieldset>
          {/if}
        {/if}
        {#if mode === 'forgot'}<p class="hint">가입한 이메일로 재설정 링크를 보냅니다. 링크를 열면 로그인되고 새 비밀번호를 정할 수 있습니다.</p>{/if}
        {#if mode === 'signup' && !invite}<p class="hint">가입하면 인증 메일을 보냅니다. 메일의 링크를 열면 가입이 끝납니다.</p>{/if}
        {#if mode === 'link'}<p class="hint">비밀번호 없이 이메일로 받은 링크를 눌러 로그인합니다. 가입한 계정만 쓸 수 있습니다.</p>{/if}
        <button class="btn primary" data-testid="login-submit" type="submit" disabled={busy || !email.trim()}>
          {mode === 'login' ? '로그인' : mode === 'signup' ? '가입하기' : mode === 'forgot' ? '재설정 링크 받기' : '로그인 링크 받기'}
        </button>
      </form>
      {#if mode === 'login' || mode === 'signup'}<TermsNotice />{/if}
      <div class="links">
        {#if mode !== 'login'}<button class="link" data-testid="login-mode-login" onclick={() => go('login')}>로그인</button>{/if}
        {#if mode !== 'signup'}<button class="link" data-testid="login-mode-signup" onclick={() => go('signup')}>회원가입</button>{/if}
        {#if mode !== 'forgot'}<button class="link" data-testid="login-mode-forgot" onclick={() => go('forgot')}>비밀번호 찾기</button>{/if}
        {#if mode !== 'link'}<button class="link" data-testid="login-mode-link" onclick={() => go('link')}>이메일 링크로 로그인</button>{/if}
      </div>
    {/if}
    {#if error}<p class="error" data-testid="login-error">{error}</p>{/if}
    {#if noAccount && !sent}<button class="btn small" data-testid="login-error-signup" onclick={() => go('signup')}>회원가입하기</button>{/if}
    {#if unverified && !sent}<button class="btn small" data-testid="login-resend-verify" disabled={busy} onclick={resend}>인증 메일 다시 받기</button>{/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(400px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px 18px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); display: flex; flex-direction: column; gap: 10px; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 16px; }
  form { display: flex; flex-direction: column; gap: 10px; }
  .social { display: flex; flex-direction: column; gap: 8px; }
  .social .btn { text-decoration: none; justify-content: center; font-weight: 700; }
  .social-kakao { background: #fee500; color: #191919; border-color: #fee500; }
  .social .big { padding: 11px; font-size: 15px; }
  .social .hint { margin: 0; color: var(--muted); font-size: 11px; text-align: center; }
  .social-google { background: #fff; color: #1f1f1f; border-color: #dadce0; }
  .social-apple { background: #000; color: #fff; border-color: #000; }
  .or { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 12px; }
  .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  .links { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
  .link { background: none; border: 0; color: var(--blue); cursor: pointer; font: inherit; font-size: 12px; padding: 0; }
  .invite-banner { background: color-mix(in srgb, var(--accent, #ffcc00) 16%, transparent); border-radius: 8px; padding: 8px 10px; }
  .biz { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px 10px; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .biz legend { font-size: 12px; font-weight: 700; padding: 0 4px; }
  .biz .why { font-size: 12px; color: var(--muted); }
  .biz .why b { color: var(--text); }
  .error { color: var(--danger); font-size: 13px; margin: 0; }
  p { margin: 0; font-size: 13px; line-height: 1.5; }
</style>
