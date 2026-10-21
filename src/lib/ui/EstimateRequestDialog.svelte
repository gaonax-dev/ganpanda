<script lang="ts">
  import { untrack } from 'svelte';
  import type { EstimateDraft } from '../core/model';
  // 소비자 견적 요청 보내기 (2026-10-21 "소비자는 간판견적을 보고 견적 요청하는 방식 … 도형그리기 사이즈 그리고 메모로 견적을 요청하게"):
  // /estimate 보드에서 그린 사진·사인물(영역·치수·종류·메모)을 요청판 요청으로 보낸다 → 지역 간판사 홈 "받은 요청" → 제안 링크 → 고객 요청 페이지
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import { createRequest, scanBizDoc, uploadRequestBizDoc, uploadRequestPhoto } from '../requests';
  import { serializeRequestSigns } from '../core/requestSigns';
  import { AuthError, fetchProviders, socialStartUrl, type SocialProvider } from '../auth';
  import { bizStartDate, formatBizNo, isValidBizNo } from '../core/business';
  import { regionOfAddress } from '../core/region';
  // 로그인 필수 (2026-10-21 "카카오톡으로 로그인하게해줘 인증이되야 할거 같아"): 카카오가 기본, 다른 방법은 로그인 창
  let providers = $state<SocialProvider[]>([]);
  $effect(() => { fetchProviders().then((p) => (providers = p)); });
  $effect(() => { if (app.account && !email) email = app.account.email.includes('@noemail.') ? '' : app.account.email; });

  // 적던 내용은 남긴다 (2026-10-21 "사업자등록정보 등록했는데 사라져": 창을 닫거나 카카오 로그인으로 돌아오면 비어 있던 문제). 보내면 지운다. 파일은 못 남긴다.
  // 어디에: **계정의 견적 초안 방 설정**(settings.estimateDraft — 2026-10-22 "사업자등록기록이 다른 기기에서 연동되지 않는다"; 휴대폰에서 적은 것이 PC 에 온다). 기기 localStorage 는 옛 초안 읽기·오프라인 대비용
  const DRAFT_KEY = 'ganpanda.estimateDraft';
  type Draft = EstimateDraft;
  const localDraft = ((): Partial<Draft> => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Partial<Draft>; } catch { return {}; } })();
  // svelte-ignore state_referenced_locally
  const draft0: Partial<Draft> = app.settings.estimateDraft ?? localDraft;
  let base = JSON.stringify(draft0); // 마지막으로 방과 맞춘 내용 — 이와 다르면 사용자가 고친 것
  let store = $state(draft0.store ?? ''), phone = $state(draft0.phone ?? ''), email = $state(draft0.email ?? ''), text = $state(draft0.text ?? '');
  // 주소·사업자번호는 선택 (2026-10-21 "둘다 작성하는 걸로"): 번호는 국세청 상태조회로 "사업자 확인" 배지 — 주소는 국세청이 안 주므로 직접
  let address = $state(draft0.address ?? ''), bizNo = $state(draft0.bizNo ?? '');
  // 사본이 없으면 직접 넣는 검증 요소 (2026-10-21 "사본이 없으면 직접입력 필요한 우리가 필요한 검증 요소만 입력"): 번호 + 대표자 성명 + 개업일 → 국세청 진위확인
  let ownerName = $state(draft0.ownerName ?? ''), startDate = $state(draft0.startDate ?? '');
  let pushTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const d: Draft = { store, phone, email, text, address, bizNo, ownerName, startDate };
    const j = JSON.stringify(d);
    if (j === base) return; // 처음 값·방에서 받은 값 그대로면 쓰지 않는다 (빈 폼이 방의 초안을 덮지 않게)
    try { localStorage.setItem(DRAFT_KEY, j); } catch { /* 저장 못 해도 됨 */ }
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { base = j; app.updateSettings({ estimateDraft: d }); }, 400);
    return () => clearTimeout(pushTimer);
  });
  // 방이 나중에 맞춰지면(열자마자 동기화 중) 아직 안 고친 폼에 그 내용을 들인다
  $effect(() => {
    const s = app.settings.estimateDraft;
    if (!s) return;
    const j = JSON.stringify(s);
    if (j === base || untrack(() => JSON.stringify({ store, phone, email, text, address, bizNo, ownerName, startDate })) !== base) return;
    base = j; store = s.store ?? ''; phone = s.phone ?? ''; email = s.email ?? ''; text = s.text ?? ''; address = s.address ?? ''; bizNo = s.bizNo ?? ''; ownerName = s.ownerName ?? ''; startDate = s.startDate ?? '';
  });
  // 사업자등록증 사본 (2026-10-21 "사업자 사본 받아야 겠다" → "사업자등록증 무조건 넣어줘"): **필수**, 그림·PDF 8MB — 제안을 보낸 간판집만 연다
  let bizDoc = $state<File | null>(null);
  let scanState = $state<'' | 'scanning' | 'ok' | 'failed'>('');
  /** 사본을 고르면 바로 읽어 빈 칸을 채운다 — 못 읽으면 "직접 입력" (2026-10-21 "분석 실패하면 수동입력") */
  async function pickDoc(f: File | null) {
    bizDoc = f; scanState = '';
    if (!f || !app.account) return;
    scanState = 'scanning';
    try {
      const r = await scanBizDoc(f);
      if (!r) { scanState = 'failed'; return; }
      if (r.bizNo && !bizNo.trim()) bizNo = formatBizNo(r.bizNo);
      if (r.name && !store.trim()) store = r.name;
      if (r.address && !address.trim()) address = r.address;
      if (r.owner && !ownerName.trim()) ownerName = r.owner;
      if (r.startDate && !startDate) startDate = r.startDate;
      scanState = 'ok';
    } catch { scanState = 'failed'; }
  }
  let busy = $state(''), error = $state(''), done = $state<{ url: string } | null>(null), copied = $state(false);
  const digits = $derived(phone.replace(/\D/g, ''));
  const photos = $derived(app.photos);
  const signs = $derived(serializeRequestSigns(app.photos, app.signs).signs);
  const measured = $derived(signs.filter((s) => s.widthMm && s.heightMm).length);
  // 보내기 전 안내 (2026-10-21 "견적 넣기전에 사인물 수량 확인하고 실사이즈가 없으면 견적 응답이 적을수 있습니다. 안내")
  const unmeasured = $derived(signs.length - measured);
  const bizOk = $derived(!bizNo.trim() || isValidBizNo(bizNo));
  const docOk = $derived(!!bizDoc && bizDoc.size <= 8 * 1024 * 1024);
  const manualOk = $derived(isValidBizNo(bizNo) && !!ownerName.trim() && !!bizStartDate(startDate));
  // 지역은 주소에서 (2026-10-21 "지역입력은 주소와 중복된다") — 주소가 필수가 된다
  const region = $derived(regionOfAddress(address));
  const canSend = $derived(!!store.trim() && !!region && /^\d{9,11}$/.test(digits) && photos.length > 0 && bizOk && (docOk || manualOk) && !busy);
  const close = () => (app.estimateOpen = false);

  async function send() {
    if (!canSend) return;
    error = ''; busy = '보내는 중…';
    try {
      const { photoOrder, signs } = serializeRequestSigns(app.photos, app.signs);
      const r = await createRequest({ store: store.trim(), region, text: text.trim(), phone: digits, ...(email.trim() ? { email: email.trim() } : {}), ...(address.trim() ? { address: address.trim() } : {}), ...(bizNo.trim() ? { bizNo: bizNo.replace(/\D/g, '') } : {}), ...(manualOk ? { ownerName: ownerName.trim(), startDate: bizStartDate(startDate)! } : {}), ...(docOk ? { bizDocPending: true } : {}), signs });
      for (let i = 0; i < photoOrder.length; i++) {
        busy = `사진 올리는 중… ${i + 1}/${photoOrder.length}`;
        const url = await assetUrl(photoOrder[i].assetId);
        if (!url) throw new Error('사진을 읽을 수 없습니다');
        const blob = await (await fetch(url)).blob();
        await uploadRequestPhoto(r.id, r.key, new File([blob], `${photoOrder[i].name}.jpg`, { type: blob.type || 'image/jpeg' }));
      }
      if (bizDoc) { busy = '사업자등록증 올리는 중…'; await uploadRequestBizDoc(r.id, r.key, bizDoc); }
      // 내 요청 주소를 기기에 기억 (나중에 다시 열어 제안을 본다)
      try { const mine = JSON.parse(localStorage.getItem('ganpanda.myRequests') ?? '[]') as string[]; localStorage.setItem('ganpanda.myRequests', JSON.stringify([r.url, ...mine].slice(0, 20))); } catch { /* 저장 못 해도 됨 */ }
      done = { url: r.url };
      clearTimeout(pushTimer); base = '';
      app.updateSettings({ estimateDraft: undefined });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* 무시 */ }
    } catch (e) {
      const code = (() => { try { return e instanceof AuthError ? (JSON.parse(e.message) as { error?: string }).error : undefined; } catch { return undefined; } })();
      if (e instanceof AuthError && e.status === 429) error = '이미 3건의 요청이 진행 중입니다. 받은 제안을 먼저 확인해 주세요.';
      else if (code === 'biz_closed') error = '국세청 기준 폐업한 사업자번호입니다. 번호를 확인하거나 비워 주세요.';
      else if (code === 'bad_biz_no') error = '사업자등록번호 10자리를 확인해 주세요.';
      else if (code === 'mismatch') error = '국세청 등록 정보와 일치하지 않습니다. 사업자등록증의 대표자 성명·개업일자를 그대로 넣어 주세요.';
      else if (code === 'not_registered') error = '국세청에 등록되지 않은 사업자등록번호입니다.';
      else if (code === 'verification_required') error = '사업자등록증 사본을 올리거나, 번호·대표자 성명·개업일자를 넣어 주세요.';
      else error = e instanceof Error ? e.message : String(e);
    } finally { busy = ''; }
  }
  async function copy() { try { await navigator.clipboard.writeText(done!.url); copied = true; setTimeout(() => (copied = false), 1500); } catch { /* 길게 눌러 복사 */ } }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') close(); }} />

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="견적 요청" data-testid="estimate-dialog">
    <header><h2>간판 견적 요청</h2><button class="icon" data-testid="estimate-close" title="닫기" onclick={close}>✕</button></header>
    {#if !app.account}
      <div class="gate" data-testid="estimate-login">
        <p>견적 요청을 보내려면 <b>로그인</b>이 필요합니다. 허위 요청을 막고, 받은 제안을 나중에 다시 볼 수 있게 하기 위해서입니다. 그린 내용은 이 기기에 그대로 남습니다.</p>
        {#if providers.includes('kakao')}<a class="btn kakao" data-testid="estimate-login-kakao" href={socialStartUrl('kakao', '/estimate')}>카카오로 시작</a>{/if}
        <button class="btn" data-testid="estimate-login-other" onclick={() => { app.estimateOpen = false; app.loginOpen = true; }}>다른 방법으로 로그인</button>
      </div>
    {:else if done}
      <p class="ok" data-testid="estimate-done">요청을 보냈습니다. 이 지역 간판집들이 보고 제안을 보내면 아래 주소에서 비교할 수 있습니다(지역에 가입 간판집이 아직 없으면 간판다가 직접 확인해 연결해 드립니다). <b>주소를 꼭 저장해 두세요.</b></p>
      <div class="link"><input data-testid="estimate-done-link" readonly value={done.url} /><button class="btn small" data-testid="estimate-copy" onclick={copy}>{copied ? '복사됨' : '복사'}</button></div>
      <footer><a class="btn primary" href={done.url} data-testid="estimate-open">내 요청 페이지 열기</a><button class="btn" onclick={close}>닫기</button></footer>
    {:else}
      <p class="sum" data-testid="estimate-summary">사진 {photos.length}장 · 사인물 {signs.length}개 (치수 입력 {measured}개){photos.length === 0 ? ' — 사진을 먼저 올려 주세요' : ''}</p>
      {#if signs.length === 0}
        <p class="advice" data-testid="estimate-advice">사인물이 없습니다. 사진 위에 간판 자리를 사각으로 그려 주면 간판집이 바로 견적을 낼 수 있습니다. 그대로 보내면 응답이 적을 수 있습니다.</p>
      {:else if unmeasured > 0}
        <p class="advice" data-testid="estimate-advice">사인물 {signs.length}개 중 <b>{unmeasured}개는 실제 크기(가로·세로)가 없습니다.</b> 크기가 없으면 간판집이 금액을 잡기 어려워 견적 응답이 적을 수 있습니다. 줄자로 잰 치수를 넣고 보내는 걸 권합니다.</p>
      {/if}
      <form onsubmit={(e) => { e.preventDefault(); send(); }}>
        <label>가게 이름 *<input data-testid="est-store" bind:value={store} placeholder="예: 바로바로 정육점" /></label>
        <label>전화 *<input data-testid="est-phone" inputmode="tel" bind:value={phone} placeholder="010-0000-0000" /></label>
        <label>가게 주소 * <small>(지역은 주소에서 — {region ? `${region} 간판집에 전달` : '시/도부터 도로명까지'})</small><input data-testid="est-address" bind:value={address} placeholder="경기도 성남시 중원구 성남대로 1" />{#if address.trim() && !region}<small class="err">시/군/구가 들어간 주소로 적어 주세요</small>{/if}</label>
        <label>사업자등록증 사본 <small>(그림·PDF — 제안을 보낸 간판집만 봅니다. 고르면 번호·상호·대표자·주소를 자동으로 읽어 채웁니다)</small><span class="pick"><label class="btn file" data-testid="est-bizdoc-pick">📄 {bizDoc ? '다른 파일 고르기' : '사진·파일 고르기'}<input data-testid="est-bizdoc" type="file" accept="image/*,application/pdf" hidden onchange={(e) => pickDoc(e.currentTarget.files?.[0] ?? null)} /></label>{#if bizDoc}<span class="fname" data-testid="est-bizdoc-name">{bizDoc.name}</span>{/if}</span>{#if scanState === 'scanning'}<small class="hint" data-testid="est-scan">등록증 읽는 중…</small>{:else if scanState === 'ok'}<small class="ok" data-testid="est-scan">읽었습니다 — 아래 칸을 확인해 주세요</small>{:else if scanState === 'failed'}<small class="err" data-testid="est-scan">자동 인식이 안 됐습니다 — 아래 칸에 직접 입력해 주세요</small>{/if}{#if bizDoc && bizDoc.size > 8 * 1024 * 1024}<small class="err">8MB 까지입니다</small>{:else if !bizDoc}<small class="hint">사본이 없으면 아래 번호·대표자 성명·개업일자를 직접 넣어 국세청 확인을 받습니다</small>{/if}</label>
        <label>사업자등록번호 {docOk ? '' : '*'}<small>(국세청 확인 배지가 붙어 간판집이 믿고 봅니다)</small><input data-testid="est-bizno" inputmode="numeric" placeholder="123-45-67890" value={bizNo} oninput={(e) => (bizNo = formatBizNo(e.currentTarget.value))} />{#if bizNo.trim() && !bizOk}<small class="err">10자리를 확인해 주세요</small>{/if}</label>
        {#if !docOk}
          <div class="two">
            <label>대표자 성명 *<input data-testid="est-owner" bind:value={ownerName} placeholder="사업자등록증의 성명" /></label>
            <label>개업일자 *<input data-testid="est-start" type="date" bind:value={startDate} /></label>
          </div>
        {/if}
        <label>이메일 <small>(선택)</small><input data-testid="est-email" type="email" bind:value={email} /></label>
        <label>요청 내용 <small>(선택 — 원하는 것, 예산, 기한)</small><textarea data-testid="est-text" rows="3" bind:value={text}></textarea></label>
        {#if error}<p class="err" data-testid="estimate-error">{error}</p>{/if}
        <footer>
          <small class="hint">보낸 뒤 간판집이 제안을 보내야 연락처가 그 간판집에 보입니다. 돈은 간판집과 직접.</small>
          <button class="btn primary" type="submit" data-testid="estimate-send" disabled={!canSend}>{busy || '견적 요청 보내기'}</button>
        </footer>
      </form>
    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(480px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); overflow: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 16px; }
  .icon { background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 14px; }
  form { display: flex; flex-direction: column; gap: 8px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .pick { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .btn.file { cursor: pointer; font-weight: 600; }
  .fname { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; max-width: 220px; white-space: nowrap; }
  textarea { background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 7px; padding: 7px 9px; font: inherit; font-size: 13px; resize: vertical; }
  .sum { margin: 0; font-size: 13px; color: var(--muted); }
  .advice { margin: 0; font-size: 13px; line-height: 1.5; padding: 8px 10px; border-radius: 8px; background: rgba(255, 170, 0, 0.1); border: 1px solid rgba(255, 170, 0, 0.5); }
  .ok { margin: 0; font-size: 13px; line-height: 1.5; }
  .link { display: flex; gap: 6px; }
  .err { color: var(--danger); font-size: 12px; margin: 0; }
  .ok { color: var(--ok); font-size: 12px; }
  .gate { display: flex; flex-direction: column; gap: 10px; }
  .gate p { margin: 0; font-size: 13px; line-height: 1.5; }
  .gate .btn { justify-content: center; text-decoration: none; font-weight: 700; }
  .kakao { background: #fee500; color: #191919; border-color: #fee500; }
  .hint { color: var(--muted); font-size: 11px; }
  footer { display: flex; align-items: center; gap: 10px; justify-content: space-between; margin-top: 4px; }
</style>
