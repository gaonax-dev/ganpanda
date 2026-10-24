<script lang="ts">
  // 소비자 견적 요청 (2026-10-21 "소비자는 간판견적을 보고 견적 요청하는 방식 …") — 2026-10-22 사용자:
  // "견적요청 버튼 클릭하면 사업자등록확인 요청 대화식으로 등록증 요청한다. 하단에는 수동입력버튼도 준비한다. 이미지가 들어오면 내용을 추출하는 효과를 표현하고
  //  완료되면 수동입력 폼이 나타나고 수집한 내용을 다시 확인한다. 사업자 확인이되면 사업자 인증 배지가 표시된 견적요청 페이지가 나온다.
  //  만약 사업자없으면 일반 주문으로 표시하고 불이익도 안내해준다. 인증배지 옆에 변경도 만들어준다. 사업자 추가도 있어야한다. 선택가능하게"
  // 단계: who(대화: 등록증·직접 입력·일반 주문·등록한 사업자 고르기) → scan(읽는 효과) → confirm(읽은 내용 확인 → 국세청 인증) → form(요청) → done
  import { onDestroy, untrack } from 'svelte';
  import type { EstimateDraft } from '../core/model';
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import { addStore, createRequest, listStores, scanBizDoc, uploadRequestPhoto, uploadStoreDoc, type BizDocFields, type Store } from '../requests';
  import { serializeRequestSigns } from '../core/requestSigns';
  import { AuthError, fetchProviders, socialStartUrl, type SocialProvider } from '../auth';
  import { bizStartDate, formatBizNo, isValidBizNo } from '../core/business';
  import { regionOfAddress } from '../core/region';
  import { missingForRequest } from '../core/estimateRequest';

  // 로그인 필수 (2026-10-21): 카카오가 기본
  let providers = $state<SocialProvider[]>([]);
  $effect(() => { fetchProviders().then((p) => (providers = p)); });
  $effect(() => { if (app.account && !email) email = app.account.email.includes('@noemail.') ? '' : app.account.email; });

  // ---------- 적던 내용: 계정 초안 방 설정 settings.estimateDraft (2026-10-22 기기 사이 연동) ----------
  const DRAFT_KEY = 'ganpanda.estimateDraft';
  const localDraft = ((): Partial<EstimateDraft> => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Partial<EstimateDraft>; } catch { return {}; } })();
  // svelte-ignore state_referenced_locally
  const draft0: Partial<EstimateDraft> = app.settings.estimateDraft ?? localDraft;
  let base = JSON.stringify(draft0);
  let store = $state(draft0.store ?? ''), phone = $state(draft0.phone ?? ''), email = $state(draft0.email ?? ''), text = $state(draft0.text ?? ''), address = $state(draft0.address ?? ''), floor = $state(draft0.floor ?? '');
  const draftNow = (): EstimateDraft => ({ store, phone, email, text, address, bizNo: '', ownerName: '', startDate: '', floor });
  let pushTimer: ReturnType<typeof setTimeout> | undefined;
  let pending: EstimateDraft | null = null;
  const flush = () => { clearTimeout(pushTimer); if (pending) { base = JSON.stringify(pending); app.updateSettings({ estimateDraft: pending }); pending = null; } };
  $effect(() => {
    const d = draftNow();
    const j = JSON.stringify(d);
    if (j === base) return;
    try { localStorage.setItem(DRAFT_KEY, j); } catch { /* 저장 못 해도 됨 */ }
    clearTimeout(pushTimer);
    pending = d;
    pushTimer = setTimeout(flush, 400);
  });
  onDestroy(flush); // 바로 닫아도 적던 내용이 방에 남게
  $effect(() => {
    const s = app.settings.estimateDraft;
    if (!s) return;
    const j = JSON.stringify(s);
    if (j === base || untrack(() => JSON.stringify(draftNow())) !== base) return;
    base = j; store = s.store ?? ''; phone = s.phone ?? ''; email = s.email ?? ''; text = s.text ?? ''; address = s.address ?? ''; floor = s.floor ?? '';
  });

  // ---------- 신원: 등록한 사업자(여럿) 또는 일반 주문 ----------
  let stores = $state<Store[]>([]);
  let storesLoaded = $state(false);
  const identityId = $derived(app.settings.estimateIdentity ?? '');
  const chosen = $derived(stores.find((s) => s.id === identityId && s.verified) ?? null);
  /** 간판집 자신의 확인된 사업자 (설정 "사업자 확인") — 외주 요청에서 (2026-10-22) */
  const accountBiz = $derived(app.business && app.business.status !== 'closed' ? app.business : null);
  const useAccount = $derived(identityId === 'account' && !!accountBiz);
  const b2b = $derived(!app.consumer);
  const general = $derived(identityId === 'general');
  type Step = 'who' | 'scan' | 'confirm' | 'form' | 'done';
  let step = $state<Step>('who');
  $effect(() => {
    if (!app.account) return;
    listStores().then((s) => {
      stores = s; storesLoaded = true;
      untrack(() => { if (step === 'who' && (identityId === 'general' || (identityId === 'account' && !!accountBiz) || s.some((x) => x.id === identityId && x.verified))) step = 'form'; });
    }).catch(() => (storesLoaded = true));
  });
  const setIdentity = (id: string) => app.updateSettings({ estimateIdentity: id });
  function pickStore(s: Store) {
    setIdentity(s.id);
    if (!store.trim()) store = s.name;
    if (!address.trim()) address = s.address;
    step = 'form';
  }
  function pickGeneral() { setIdentity('general'); step = 'form'; }
  function pickAccount() { setIdentity('account'); if (!store.trim() && accountBiz) store = accountBiz.name; step = 'form'; }

  // ---------- 등록증 → 읽는 효과 → 확인 폼 ----------
  let docFile = $state<File | null>(null);
  let docPreview = $state('');
  let scanned = $state<BizDocFields | null>(null);
  let revealed = $state(0); // 읽는 효과: 칸이 하나씩 채워진다
  let scanFailed = $state(false);
  let f = $state({ bizNo: '', name: '', owner: '', startDate: '', address: '' });
  const FIELDS: { key: keyof typeof f; label: string }[] = [{ key: 'bizNo', label: '등록번호' }, { key: 'name', label: '상호' }, { key: 'owner', label: '대표자' }, { key: 'startDate', label: '개업일' }, { key: 'address', label: '사업장 주소' }];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function pickDoc(file: File | null) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { error = '사업자등록증 파일은 8MB 까지입니다.'; return; }
    error = ''; docFile = file; scanned = null; revealed = 0; scanFailed = false;
    if (docPreview) URL.revokeObjectURL(docPreview);
    docPreview = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    step = 'scan';
    const [r] = await Promise.all([scanBizDoc(file).catch(() => null), sleep(900)]); // 효과가 보일 만큼은 기다린다
    scanned = r;
    f = { bizNo: r?.bizNo ? formatBizNo(r.bizNo) : '', name: r?.name ?? '', owner: r?.owner ?? '', startDate: r?.startDate ?? '', address: r?.address ?? '' };
    if (!r) { scanFailed = true; await sleep(500); step = 'confirm'; return; }
    for (let i = 1; i <= FIELDS.length; i++) { revealed = i; await sleep(220); }
    await sleep(350);
    step = 'confirm';
  }
  function manual() { docFile = null; scanned = null; scanFailed = false; f = { bizNo: '', name: store, owner: '', startDate: '', address }; step = 'confirm'; }
  const confirmOk = $derived(isValidBizNo(f.bizNo) && !!f.owner.trim() && !!bizStartDate(f.startDate));
  async function verify() {
    if (!confirmOk) { error = '사업자등록번호 10자리, 대표자 성명, 개업일자를 확인해 주세요.'; return; }
    error = ''; busy = '국세청에서 확인하는 중…';
    try {
      const s = await addStore({ bizNo: f.bizNo.replace(/\D/g, ''), ownerName: f.owner.trim(), startDate: bizStartDate(f.startDate)!, name: f.name.trim(), address: f.address.trim() });
      if (docFile) { busy = '사업자등록증 저장 중…'; await uploadStoreDoc(s.id, docFile).catch(() => undefined); }
      stores = [{ ...s, hasDoc: s.hasDoc || !!docFile }, ...stores.filter((x) => x.id !== s.id)];
      store = f.name.trim() || store; if (f.address.trim()) address = f.address.trim();
      setIdentity(s.id);
      step = 'form';
    } catch (e) { error = errorText(e); } finally { busy = ''; }
  }

  // ---------- 요청 ----------
  let busy = $state(''), error = $state(''), missing = $state<string[]>([]), done = $state<{ url: string } | null>(null), copied = $state(false);
  const photos = $derived(app.photos);
  const signs = $derived(serializeRequestSigns(app.photos, app.signs).signs);
  const measured = $derived(signs.filter((s) => s.widthMm && s.heightMm).length);
  const unmeasured = $derived(signs.length - measured);
  const region = $derived(regionOfAddress(address));
  const close = () => (app.estimateOpen = false);
  function errorText(e: unknown): string {
    const code = (() => { try { return e instanceof AuthError ? (JSON.parse(e.message) as { error?: string }).error : undefined; } catch { return undefined; } })();
    if (e instanceof AuthError && e.status === 429) return '이미 3건의 요청이 진행 중입니다. 받은 제안을 먼저 확인해 주세요.';
    if (code === 'mismatch') return '국세청 등록 정보와 맞지 않습니다. 사업자등록증의 대표자 성명·개업일자를 그대로 넣어 주세요.';
    if (code === 'not_registered') return '국세청에 등록되지 않은 사업자등록번호입니다.';
    if (code === 'biz_closed') return '국세청 기준 폐업한 사업자입니다.';
    if (code === 'nts_unavailable') return '국세청 확인이 잠시 안 됩니다. 조금 뒤 다시 해 주세요.';
    if (code === 'bad_store') return '고른 사업자를 찾을 수 없습니다. [변경]에서 다시 골라 주세요.';
    return e instanceof Error ? e.message : String(e);
  }
  async function send() {
    missing = missingForRequest({ identity: chosen || useAccount ? 'store' : general ? 'general' : null, store, phone, address, photos: photos.length, floor });
    if (missing.length || busy) return;
    error = ''; busy = '보내는 중…';
    try {
      const { photoOrder, signs } = serializeRequestSigns(app.photos, app.signs);
      // 보드를 서버에서 복제한다 — 사진을 다시 올리지 않는다 (2026-10-22 "이미 서버에 이미지가 있는데 이중으로 작동한다")
      const r = await createRequest({ ...(app.room ? { fromProject: app.room } : {}), ...(chosen ? { storeId: chosen.id } : useAccount ? { accountBusiness: true } : { general: true }), store: store.trim(), region, text: text.trim(), phone: phone.replace(/\D/g, ''), ...(email.trim() ? { email: email.trim() } : {}), address: address.trim(), signs, floor: floor.trim(), estimateTotal: app.quote.total }); // 층·자동 견적 → 간판집 크레딧 (2026-10-24)
      for (let i = 0; !r.snapshotProject && i < photoOrder.length; i++) { // 복제가 안 된 경우(옛 서버)만 사진을 따로 올린다
        busy = `사진 올리는 중… ${i + 1}/${photoOrder.length}`;
        const url = await assetUrl(photoOrder[i].assetId);
        if (!url) throw new Error('사진을 읽을 수 없습니다. 보드에서 사진이 보이는지 확인해 주세요.');
        const blob = await (await fetch(url)).blob();
        await uploadRequestPhoto(r.id, r.key, new File([blob], `${photoOrder[i].name}.jpg`, { type: blob.type || 'image/jpeg' }));
      }
      try { const mine = JSON.parse(localStorage.getItem('ganpanda.myRequests') ?? '[]') as string[]; localStorage.setItem('ganpanda.myRequests', JSON.stringify([r.url, ...mine].slice(0, 20))); } catch { /* 저장 못 해도 됨 */ }
      done = { url: r.url };
      clearTimeout(pushTimer); pending = null; base = '';
      // 보낸 뒤에는 보드를 잠근다 — 취소하면 풀린다 (2026-10-22 "견적이 요청되면 수정이 불가능하다")
      app.project.updateSettings({ estimateRequest: { id: r.id, url: r.url, at: Date.now() }, estimateDraft: undefined });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* 무시 */ }
      step = 'done';
    } catch (e) { error = errorText(e); } finally { busy = ''; }
  }
  async function copy() { try { await navigator.clipboard.writeText(done!.url); copied = true; setTimeout(() => (copied = false), 1500); } catch { /* 길게 눌러 복사 */ } }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') close(); }} />

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="견적 요청" data-testid="estimate-dialog" data-step={step}>
    <header><h2>{b2b ? '외주 견적 요청 (B2B)' : '간판 견적 요청'}</h2><button class="icon" data-testid="estimate-close" title="닫기" onclick={close}>✕</button></header>
    {#if !app.account}
      <div class="gate" data-testid="estimate-login">
        <p>견적 요청을 보내려면 <b>로그인</b>이 필요합니다. 허위 요청을 막고, 받은 제안을 나중에 다시 볼 수 있게 하기 위해서입니다.</p>
        {#if providers.includes('kakao')}<a class="btn kakao" data-testid="estimate-login-kakao" href={socialStartUrl('kakao', '/estimate')}>카카오로 시작</a>{/if}
        <button class="btn" data-testid="estimate-login-other" onclick={() => { app.estimateOpen = false; app.loginOpen = true; }}>다른 방법으로 로그인</button>
      </div>
    {:else if step === 'who'}
      <!-- 대화식 사업자 확인 -->
      <div class="chat" data-testid="est-chat">
        <p class="bot">안녕하세요, 간판다입니다. {b2b ? '외주 요청' : '견적'}을 보내기 전에 <b>사업자를 확인</b>할게요.</p>
        <p class="bot">사업자등록증 사진을 올려 주시면 내용을 읽어 채워 드려요. <b>사업자 인증 배지</b>가 붙은 요청은 간판집이 믿고 먼저 답합니다.</p>
        {#if stores.length || accountBiz}
          <p class="bot">등록해 둔 사업자가 있어요. 이번 요청에 쓸 곳을 골라 주세요.</p>
          <div class="stores">
            {#if accountBiz}
              <button class="store" class:on={identityId === 'account'} data-testid="est-account-pick" onclick={pickAccount}>
                <span class="badge ok">✓ 인증</span><b>{accountBiz.name || '내 사업자'}</b><small>{formatBizNo(accountBiz.no)} · 설정에서 확인한 내 사업자</small>
              </button>
            {/if}
            {#each stores.filter((s) => s.verified) as s (s.id)}
              <button class="store" class:on={s.id === identityId} data-testid="est-store-pick" onclick={() => pickStore(s)}>
                <span class="badge ok">✓ 인증</span><b>{s.name || '상호 없음'}</b><small>{formatBizNo(s.bizNo)} · {s.ownerName}</small>
              </button>
            {/each}
          </div>
        {:else if !storesLoaded}<p class="bot muted">등록한 사업자를 불러오는 중…</p>{/if}
      </div>
      {#if error}<p class="err" data-testid="estimate-error">{error}</p>{/if}
      <div class="actions">
        <label class="btn primary file" data-testid="est-bizdoc-pick">📷 {stores.length ? '다른 사업자 추가 — 등록증 올리기' : '사업자등록증 올리기'}<input data-testid="est-bizdoc" type="file" accept="image/*,application/pdf" hidden onchange={(e) => pickDoc(e.currentTarget.files?.[0] ?? null)} /></label>
        <div class="row">
          <button class="btn" data-testid="est-manual" onclick={manual}>✍️ 직접 입력</button>
          <button class="btn ghost" data-testid="est-general" onclick={pickGeneral}>사업자 없이 일반 주문</button>
        </div>
      </div>
    {:else if step === 'scan'}
      <div class="chat"><p class="bot">사업자등록증을 읽고 있어요…</p></div>
      <div class="scan" data-testid="est-scanning">
        <div class="doc">
          {#if docPreview}<img src={docPreview} alt="사업자등록증" />{:else}<div class="pdf">📄 {docFile?.name}</div>{/if}
          <i class="beam"></i>
        </div>
        <ul class="fields">
          {#each FIELDS as fd, i (fd.key)}
            <li class:got={i < revealed}><span>{fd.label}</span>{#if i < revealed}<b>{f[fd.key] || '—'}</b>{:else}<i class="shimmer"></i>{/if}</li>
          {/each}
        </ul>
      </div>
    {:else if step === 'confirm'}
      <div class="chat">
        {#if scanFailed}<p class="bot" data-testid="est-scan" data-state="failed">자동으로 읽지 못했어요. 사업자등록증을 보고 직접 넣어 주세요.</p>
        {:else if scanned}<p class="bot" data-testid="est-scan" data-state="ok">읽은 내용이에요. <b>맞는지 확인</b>하고 고칠 곳이 있으면 고쳐 주세요.</p>
        {:else}<p class="bot">사업자등록증에 있는 그대로 넣어 주세요. 국세청에서 확인합니다.</p>{/if}
      </div>
      <form class="confirm" data-testid="est-confirm" onsubmit={(e) => { e.preventDefault(); verify(); }}>
        <label>사업자등록번호 *<input data-testid="est-bizno" inputmode="numeric" placeholder="123-45-67890" value={f.bizNo} oninput={(e) => (f.bizNo = formatBizNo(e.currentTarget.value))} />{#if f.bizNo.trim() && !isValidBizNo(f.bizNo)}<small class="err">10자리를 확인해 주세요</small>{/if}</label>
        <label>상호<input data-testid="est-bizname" bind:value={f.name} placeholder="사업자등록증의 상호" /></label>
        <div class="two">
          <label>대표자 성명 *<input data-testid="est-owner" bind:value={f.owner} /></label>
          <label>개업일자 *<input data-testid="est-start" type="date" bind:value={f.startDate} /></label>
        </div>
        <label>사업장 주소<input data-testid="est-bizaddr" bind:value={f.address} placeholder="경기도 성남시 중원구 성남대로 1" /></label>
        {#if error}<p class="err" data-testid="estimate-error">{error}</p>{/if}
        <footer>
          <button class="btn" type="button" data-testid="est-back" onclick={() => { error = ''; step = 'who'; }}>뒤로</button>
          <button class="btn primary" type="submit" data-testid="est-verify" disabled={!!busy}>{busy || '확인하고 인증받기'}</button>
        </footer>
      </form>
    {:else if step === 'form'}
      <!-- 인증 배지(또는 일반 주문) + [변경] -->
      <div class="identity" data-testid="est-identity" data-kind={chosen || useAccount ? 'store' : 'general'}>
        {#if useAccount && accountBiz}
          <span class="badge ok big">✓ 사업자 인증</span><span class="who"><b>{accountBiz.name || '내 사업자'}</b><small>{formatBizNo(accountBiz.no)}</small></span>
        {:else if chosen}
          <span class="badge ok big">✓ 사업자 인증</span><span class="who"><b>{chosen.name || '상호 없음'}</b><small>{formatBizNo(chosen.bizNo)}</small></span>
        {:else}
          <span class="badge plain big">일반 주문</span><span class="who"><b>사업자 없음</b></span>
        {/if}
        <button class="btn small" data-testid="est-identity-change" onclick={() => { error = ''; step = 'who'; }}>변경</button>
      </div>
      {#if general}
        <div class="notice" data-testid="est-general-notice">
          <b>일반 주문으로 보내면</b>
          <ul>
            <li>간판집이 허위 요청을 걱정해 <b>제안이 적거나 늦을 수 있습니다.</b></li>
            <li><b>세금계산서</b>를 받을 수 없어 부가세 매입 공제를 받지 못합니다.</li>
          </ul>
          <small>사업자가 있으면 [변경]에서 언제든 인증할 수 있어요.</small>
        </div>
      {/if}
      <p class="sum" data-testid="estimate-summary">사진 {photos.length}장 · 사인물 {signs.length}개 (치수 입력 {measured}개)</p>
      {#if signs.length === 0}
        <p class="advice" data-testid="estimate-advice">사인물이 없습니다. 사진 위에 간판 자리를 사각으로 그려 주면 간판집이 바로 견적을 낼 수 있습니다. 그대로 보내면 응답이 적을 수 있습니다.</p>
      {:else if unmeasured > 0}
        <p class="advice" data-testid="estimate-advice">사인물 {signs.length}개 중 <b>{unmeasured}개는 실제 크기(가로·세로)가 없습니다.</b> 크기가 없으면 간판집이 금액을 잡기 어려워 견적 응답이 적을 수 있습니다.</p>
      {/if}
      <form onsubmit={(e) => { e.preventDefault(); send(); }}>
        <label>가게 이름 *<input data-testid="est-store" bind:value={store} placeholder="예: 바로바로 정육점" /></label>
        <label>전화 *<input data-testid="est-phone" inputmode="tel" bind:value={phone} placeholder="010-0000-0000" /></label>
        <label>층 * <small>간판이 들어갈 층</small><input data-testid="est-floor" bind:value={floor} placeholder="예: 1층, 2~3층, 옥상" maxlength="30" /></label>
        <label>가게 주소 * <small>{region ? `${region} 간판집에 전달` : '시/도부터 도로명까지'}</small><input data-testid="est-address" bind:value={address} placeholder="경기도 성남시 중원구 성남대로 1" /></label>
        <label>이메일 <small>(선택)</small><input data-testid="est-email" type="email" bind:value={email} /></label>
        <label>요청 내용 <small>(선택 — 원하는 것, 예산, 기한)</small><textarea data-testid="est-text" rows="3" bind:value={text}></textarea></label>
        {#if missing.length}
          <div class="missing" data-testid="estimate-missing"><b>아직 빠진 것이 있어요</b><ul>{#each missing as x (x)}<li>{x}</li>{/each}</ul></div>
        {/if}
        {#if error}<p class="err" data-testid="estimate-error">{error}</p>{/if}
        <footer>
          <small class="hint">{b2b ? '보내는 순간의 보드 그대로 다른 간판집에 전달돼요. B2B 로 표시됩니다.' : '보낸 뒤에는 보드를 고칠 수 없어요 (요청을 취소하면 다시 고쳐 새로 보낼 수 있어요). 돈은 간판집과 직접.'}</small>
          <button class="btn primary" type="submit" data-testid="estimate-send" disabled={!!busy}>{busy || (b2b ? '외주 요청 보내기' : '견적 요청 보내기')}</button>
        </footer>
      </form>
    {:else if step === 'done' && done}
      <div class="chat"><p class="bot" data-testid="estimate-done">요청을 보냈습니다 🎉 이 지역 간판집들이 보고 제안을 보내면 요청 페이지에서 비교할 수 있어요. 지역에 가입 간판집이 아직 없으면 간판다가 직접 확인해 연결해 드립니다.</p></div>
      <div class="link"><input data-testid="estimate-done-link" readonly value={done.url} /><button class="btn small" data-testid="estimate-copy" onclick={copy}>{copied ? '복사됨' : '복사'}</button></div>
      <footer><a class="btn primary" href={done.url} data-testid="estimate-open">내 요청 페이지 열기</a><button class="btn" onclick={close}>닫기</button></footer>
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
  textarea { background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 7px; padding: 7px 9px; font: inherit; font-size: 13px; resize: vertical; }
  /* 대화 */
  .chat { display: flex; flex-direction: column; gap: 6px; }
  .bot { margin: 0; align-self: flex-start; max-width: 92%; background: var(--input); border: 1px solid var(--line); border-radius: 4px 14px 14px 14px; padding: 8px 11px; font-size: 13px; line-height: 1.5; animation: pop 0.25s ease-out both; }
  .bot:nth-child(2) { animation-delay: 0.15s; } .bot:nth-child(3) { animation-delay: 0.3s; }
  @keyframes pop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .muted { color: var(--muted); }
  .stores { display: flex; flex-direction: column; gap: 6px; }
  .store { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 8px; text-align: left; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; color: var(--text); cursor: pointer; font: inherit; }
  .store .badge { grid-row: 1 / 3; align-self: center; }
  .store small { color: var(--muted); font-size: 12px; }
  .store.on, .store:hover { border-color: var(--accent); }
  .actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .actions .row { display: flex; gap: 8px; }
  .actions .row .btn { flex: 1; justify-content: center; }
  .btn.file { cursor: pointer; justify-content: center; font-weight: 700; }
  .btn.ghost { background: none; color: var(--muted); }
  /* 읽는 효과 */
  .scan { display: grid; grid-template-columns: 140px 1fr; gap: 12px; align-items: start; }
  .doc { position: relative; overflow: hidden; border-radius: 8px; border: 1px solid var(--line); background: #fff; min-height: 180px; }
  .doc img { width: 100%; display: block; }
  .pdf { padding: 20px 8px; color: #333; font-size: 12px; word-break: break-all; }
  .beam { position: absolute; left: 0; right: 0; height: 36px; background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--accent) 55%, transparent), transparent); animation: beam 1.1s ease-in-out infinite alternate; }
  @keyframes beam { from { top: -36px; } to { top: 100%; } }
  .fields { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
  .fields li { display: flex; flex-direction: column; gap: 2px; color: var(--muted); }
  .fields li b { color: var(--text); font-size: 13px; animation: pop 0.2s ease-out both; }
  .fields li.got span::before { content: '✓ '; color: var(--ok); }
  .shimmer { display: block; height: 12px; border-radius: 4px; background: linear-gradient(90deg, var(--input) 0%, var(--line) 50%, var(--input) 100%); background-size: 200% 100%; animation: sh 1s linear infinite; }
  @keyframes sh { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  /* 신원 줄 */
  .identity { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--input); }
  .identity[data-kind='store'] { border-color: rgba(60, 200, 120, 0.6); }
  .identity .who { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .identity small { color: var(--muted); font-size: 12px; }
  .badge { border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .badge.ok { background: rgba(60, 200, 120, 0.15); color: var(--ok); border: 1px solid rgba(60, 200, 120, 0.6); }
  .badge.plain { background: var(--panel); color: var(--muted); border: 1px solid var(--line); }
  .badge.big { font-size: 12px; padding: 4px 10px; }
  .notice { font-size: 12px; line-height: 1.5; padding: 8px 10px; border-radius: 8px; background: rgba(255, 170, 0, 0.1); border: 1px solid rgba(255, 170, 0, 0.5); }
  .notice ul, .missing ul { margin: 4px 0; padding-left: 18px; }
  .notice small { color: var(--muted); }
  .missing { font-size: 13px; padding: 8px 10px; border-radius: 8px; background: rgba(255, 80, 80, 0.08); border: 1px solid var(--danger); }
  .sum { margin: 0; font-size: 13px; color: var(--muted); }
  .advice { margin: 0; font-size: 13px; line-height: 1.5; padding: 8px 10px; border-radius: 8px; background: rgba(255, 170, 0, 0.1); border: 1px solid rgba(255, 170, 0, 0.5); }
  .link { display: flex; gap: 6px; }
  .err { color: var(--danger); font-size: 12px; margin: 0; }
  .gate { display: flex; flex-direction: column; gap: 10px; }
  .gate p { margin: 0; font-size: 13px; line-height: 1.5; }
  .gate .btn { justify-content: center; text-decoration: none; font-weight: 700; }
  .kakao { background: #fee500; color: #191919; border-color: #fee500; }
  .hint { color: var(--muted); font-size: 11px; }
  footer { display: flex; align-items: center; gap: 10px; justify-content: space-between; margin-top: 4px; }
  @media (max-width: 420px) { .scan { grid-template-columns: 1fr; } }
</style>
