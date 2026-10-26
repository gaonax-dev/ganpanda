<!-- 설정: 단축키 변경 (화면 조작 기본값은 xlpop 과 동일) -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { askConfirm } from './ask.svelte';
  import { nudgeClose } from './dialogGuard';
  import { app, type SettingsTab } from '../state.svelte';
  import { AuthError, PLAN_LABEL } from '../auth';
  import { setRequestSettings } from '../requests';
  import { ACTIONS, DEFAULT_KEYMAP, comboFromEvent, findConflicts, formatCombo, type Action } from '../core/keymap';
  import { addTeamMember, cancelTeamInvite, createTeamLink, listTeam, removeTeamMember, setTeamMember, type TeamInvite, type TeamMember } from '../projects';
  import { formatBytes } from '../core/format';
  import { glossaryCsv } from '../core/terms';
  import { BIZ_STATUS_LABEL, bizStartDate, formatBizNo, isValidBizNo } from '../core/business';
  import { describeBusinessError, removeBusiness, updateBusinessAddress, verifyBusiness } from '../business';
  import { KOREA_REGIONS, regionLabel, sidoOf } from '../core/regions';
  import BillingSection from './BillingSection.svelte';
  import { paymentsShown } from '../auth';
  /** 용어집 내보내기 (V5, 2026-10-19): 표준 용어 · 연결 공급사 용어 · 내 동의어 CSV */
  function exportGlossary() {
    const blob = new Blob([glossaryCsv(app.prices, app.specRules)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `간판다 용어집 ${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  // ---------- 사업자 확인 (2026-10-21 결정: 로그인 위에 "어느 사업체인가" — 국세청 진위확인, 숨고·크몽 방식) ----------
  let bizNo = $state(''), bizOwner = $state(''), bizStart = $state(''), bizName = $state(''), bizAddress = $state('');
  let bizBusy = $state(false), bizError = $state('');
  const bizReady = $derived(isValidBizNo(bizNo) && !!bizOwner.trim() && !!bizStartDate(bizStart));
  async function verifyBiz() {
    bizBusy = true; bizError = '';
    try { app.business = await verifyBusiness({ no: bizNo, ownerName: bizOwner.trim(), startDate: bizStartDate(bizStart)!, name: bizName.trim(), address: bizAddress.trim() }); }
    catch (e) { bizError = describeBusinessError(e); }
    finally { bizBusy = false; }
  }
  async function removeBiz() {
    if (!(await askConfirm('사업자 확인을 해제하면 제안 페이지의 "사업자 확인" 배지가 사라지고, 이 번호를 다른 계정에서 확인할 수 있게 됩니다. 해제할까요?'))) return;
    try { app.business = await removeBusiness(); } catch (e) { bizError = describeBusinessError(e); }
  }
  // 사업장 주소 (2026-10-24): 확인된 사업자도 주소만 바꾼다 — 요청 받기 기본 지역
  let addrDraft = $state(app.business?.address ?? '');
  const savedAddr = $derived(app.business?.address ?? '');
  $effect(() => { addrDraft = savedAddr; }); // 저장된 주소가 실제로 바뀔 때만 칸을 맞춘다 (같은 값으로 다시 받아도 입력 중인 글은 그대로)
  async function saveAddress() {
    bizBusy = true; bizError = '';
    try { app.business = await updateBusinessAddress(addrDraft.trim()); } catch (e) { bizError = describeBusinessError(e); } finally { bizBusy = false; }
  }
  const dateLabel = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

  // ---------- 계정 · 구독 · 사용량 · 멤버 (2026-10-15 사용자: "멤버 관리는 설정에서, 설정에 계정 구독 상태와 사용량 표시") ----------
  let members = $state<TeamMember[] | null>(null);
  // 요청 받기 설정 (요청판)
  let reqReceive = $state(app.requestSettings?.receive ?? false);
  let reqRegions = $state((app.requestSettings?.regions ?? []).join(', ')); // 요청판이 꺼진 빌드의 "내 지역" 글 칸
  /** 요청 받기 지역 (2026-10-24 "요청 지역설정을 사업자 주소로 먼저 설정하고 나머지는 원하는 지역을 설정할 수 있게 체크방식으로"): 기본 = 사업장 주소의 지역(서버가 맨 앞에), 나머지는 체크 */
  const homeRegion = $derived(app.business?.region ?? '');
  let reqPicked = $state<string[]>(app.requestSettings?.regions ?? []);
  const reqExtras = $derived(reqPicked.filter((r) => r !== homeRegion));
  let reqSido = $state(sidoOf(app.business?.region ?? '') || '서울');
  const togglePick = (r: string) => (reqPicked = reqPicked.includes(r) ? reqPicked.filter((x) => x !== r) : [...reqPicked, r]);
  let reqBusy = $state(false), reqSaved = $state('');
  async function saveRequests() {
    reqBusy = true; reqSaved = '';
    const regions = app.requestsEnabled ? reqExtras : reqRegions.split(',').map((s) => s.trim()).filter(Boolean);
    try { await setRequestSettings({ receive: reqReceive, regions }); await app.refreshMe(); reqPicked = app.requestSettings?.regions ?? reqPicked; reqSaved = '저장했습니다'; }
    catch (e) { reqSaved = e instanceof Error ? e.message : String(e); }
    finally { reqBusy = false; }
  }
  let memberEmail = $state('');
  let memberError = $state('');
  /** 가입 링크를 보낸 이메일 (2026-10-24 "맴버는 메일로 가입링크 들어오기로") */
  let memberSent = $state('');
  let invites = $state<TeamInvite[]>([]);
  /** 카카오톡으로 초대 (2026-10-24 "맴버 초대를 카카오톡으로 할수 있나?"): 이메일 없는 링크 → 휴대폰은 공유 창, 아니면 복사 */
  let teamLink = $state('');
  let teamLinkNote = $state('');
  async function kakaoInvite() {
    memberError = ''; memberSent = ''; teamLink = '';
    try {
      const r = await createTeamLink(false);
      teamLink = r.link;
      await loadTeam(); app.refreshMe();
      const text = `${app.account?.name || '간판다'} 팀에 초대합니다. 링크를 열고 [카카오로 팀 들어가기]를 누르세요 (7일 동안).`;
      if (typeof navigator.share === 'function' && app.compact) {
        try { await navigator.share({ title: '간판다 팀 초대', text, url: r.link }); teamLinkNote = '공유했습니다. 받은 사람이 링크를 열면 팀에 들어옵니다.'; return; } catch { /* 공유 취소 → 복사로 */ }
      }
      try { await navigator.clipboard.writeText(r.link); teamLinkNote = '링크를 복사했습니다 — 카카오톡 대화방에 붙여 넣어 보내세요. 한 사람만, 7일 동안 쓸 수 있습니다.'; }
      catch { teamLinkNote = '아래 링크를 복사해 카카오톡으로 보내세요. 한 사람만, 7일 동안 쓸 수 있습니다.'; }
    } catch (e) {
      const limit = (() => { try { const j = JSON.parse(e instanceof Error ? e.message : ''); return j?.error === 'member_limit' ? j.limit as number : null; } catch { return null; } })();
      memberError = limit !== null ? `지금 요금제는 멤버를 ${limit}명까지 둘 수 있습니다(가입 대기 포함).${paymentsShown() ? ' 더 필요하면 요금제를 올려 주세요.' : ''}` : '초대 링크를 만들지 못했습니다. 잠시 뒤 다시 해 주세요.';
    }
  }
  async function loadTeam() { try { const t = await listTeam(); members = t.members; invites = t.invites; } catch { members = []; invites = []; } }
  // 계정이 바뀔 때(아이디)만 다시 — refreshMe 는 account 를 새 객체로 바꾸므로 account 자체를 따라가면 끝없이 다시 부른다 (2026-10-27 버그)
  const accountId = $derived(app.account?.id ?? null);
  $effect(() => { if (accountId) untrack(() => { void app.refreshMe(); void loadTeam(); }); });
  $effect(() => { if (accountId && tab === 'team') untrack(() => void loadTeam()); }); // 멤버 탭을 열 때마다 새로 (초대받은 사람이 들어왔는지)
  async function addMember() {
    const em = memberEmail.trim();
    if (!em) return;
    memberError = ''; memberSent = '';
    try { const r = await addTeamMember(em, false); memberEmail = ''; if (r.invite) memberSent = r.invite.email; await loadTeam(); app.refreshMe(); }
    catch (e) {
      // 요금제 멤버 한도 (2026-10-21): 403 member_limit
      const limit = (() => { try { const j = JSON.parse(e instanceof Error ? e.message : ''); return j?.error === 'member_limit' ? j.limit as number : null; } catch { return null; } })();
      memberError = limit !== null ? `지금 요금제는 멤버를 ${limit}명까지 둘 수 있습니다.${paymentsShown() ? ' 더 필요하면 요금제를 올려 주세요.' : ''}` : e instanceof AuthError && e.status === 400 ? '이메일 주소를 확인해 주세요.' : '보내지 못했습니다. 잠시 뒤 다시 해 주세요.';
    }
  }

  /** 키 입력 대기 중인 동작 */
  let capture: { action: Action; mode: 'replace' | 'add' } | null = $state(null);

  const groups = $derived([...new Set(ACTIONS.map((a) => a.group))]);
  const conflicts = $derived(findConflicts(app.keymap));
  const label = (id: Action) => ACTIONS.find((a) => a.id === id)!.label;
  const fmt = (c: string) => formatCombo(c, app.isMac);
  const isDefault = (id: Action) => JSON.stringify(app.keymap[id]) === JSON.stringify(DEFAULT_KEYMAP[id]);

  function set(id: Action, combos: string[]) {
    app.setKeymap({ ...app.keymap, [id]: combos });
  }

  // 키 입력 받기 — 다른 단축키보다 먼저 가로챈다 (capture 단계)
  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!capture) {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') { capture = null; return; }
      const combo = comboFromEvent(e, app.isMac);
      if (!combo) return; // 수식키만 누름 → 계속 대기
      const cur = app.keymap[capture.action];
      set(capture.action, capture.mode === 'replace' ? [combo] : [...cur.filter((c) => c !== combo), combo]);
      capture = null;
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  });

  function close() {
    capture = null;
    app.settingsOpen = false;
  }

  // 전환·삭제 (2026-10-22)
  let deleting = $state(false), deleteText = $state(''), deleteBusy = $state(false);
  async function removeAccount() {
    if (deleteText.trim() !== '삭제') return;
    deleteBusy = true;
    try { await app.deleteMyAccount(); } catch (e) { app.notice = `계정을 지우지 못했습니다: ${e instanceof Error ? e.message : String(e)}`; deleteBusy = false; }
  }
  async function toShop() {
    if (!(await askConfirm('간판집(사업자) 계정으로 바꿀까요? 되돌릴 수 없습니다.'))) return;
    try { await app.becomeShop(); app.showFlash('간판집 계정으로 바꿨습니다'); } catch (e) { app.notice = e instanceof Error ? e.message : String(e); }
  }

  // 탭 (2026-10-21 사용자: "설정을 내용별로 탭으로 분리해줘"): 로그인했으면 계정부터, 아니면 표시
  // 역할에 맞게 (2026-10-22 "설정의 내용 … 각 역활에 맞게 정리해줘"): 가게 사장 계정은 계정·표시만 — 멤버·사양 사전·요청 받기·단축키는 간판집 일
  const shopOnly = () => !app.consumerAccount;
  const TABS: { id: SettingsTab; label: string; needAccount?: boolean; when?: () => boolean }[] = [
    { id: 'account', label: '계정', needAccount: true },
    { id: 'team', label: '멤버', needAccount: true, when: shopOnly },
    { id: 'rules', label: '사양 사전', needAccount: true, when: shopOnly },
    { id: 'requests', label: '요청 받기', needAccount: true, when: () => app.requestsEnabled && shopOnly() },
    { id: 'display', label: '표시' },
    { id: 'keys', label: '단축키', when: shopOnly },
  ];
  const tabs = $derived(TABS.filter((t) => (!t.needAccount || app.account) && (!t.when || t.when())));
  let tab = $state<SettingsTab>(typeof app.settingsOpen === 'string' ? app.settingsOpen : app.account ? 'account' : 'display');
  $effect(() => { if (!tabs.some((t) => t.id === tab)) tab = tabs[0].id; }); // 로그아웃 등으로 탭이 사라지면 첫 탭
</script>

<div class="backdrop" role="presentation" onpointerdown={nudgeClose}>
  <div class="dialog" data-testid="settings" role="dialog" aria-modal="true" aria-label="설정">
    <header>
      <h2>설정</h2>
      <div class="tabs" role="tablist">
        {#each tabs as t (t.id)}<button class="tab" class:on={tab === t.id} role="tab" aria-selected={tab === t.id} data-testid="settings-tab-{t.id}" onclick={() => { capture = null; tab = t.id; }}>{t.label}</button>{/each}
      </div>
      <button class="icon" data-close data-testid="close-settings" title="닫기 (Esc)" onclick={close}>✕</button>
    </header>

    <div class="body">
      {#if app.account && tab === 'account'}
        <section data-testid="account-section">
          <h3>계정 · 구독</h3>
          <p class="row"><span>{app.account.email}</span><b data-testid="plan">{PLAN_LABEL[app.account.plan] ?? app.account.plan} 요금제</b></p>
          <p class="row"><span>비밀번호 {app.account.hasPassword ? '설정됨' : '없음 (메일 링크·소셜로 로그인)'}</span><button class="btn small" data-testid="settings-password" onclick={() => (app.passwordOpen = 'change')}>{app.account.hasPassword ? '바꾸기' : '만들기'}</button></p>
          {#if app.usage}
            <p class="row"><span>저장 용량</span><span data-testid="usage-storage">{formatBytes(app.usage.usage.storageBytes)} / {formatBytes(app.usage.limits.storageBytes)}</span></p>
            <div class="bar"><i style:width="{Math.min(100, (app.usage.usage.storageBytes / Math.max(1, app.usage.limits.storageBytes)) * 100)}%"></i></div>
            {#if !app.consumerAccount}<p class="row"><span>멤버 <small>(아래 멤버 목록, 소유자 제외 — 동시 접속 인원은 제한 없음)</small></span><span data-testid="usage-members">{app.usage.usage.members} / {app.usage.limits.members}명</span></p>
            <p class="row"><span>이번 달 제안 링크</span><span data-testid="usage-proposals">{app.usage.usage.proposals}{app.usage.limits.proposalsPerMonth === null ? '건 (무제한)' : ` / ${app.usage.limits.proposalsPerMonth}건`}</span></p>{/if}
          {/if}
        </section>
        {#if app.consumerAccount}
          <!-- 가게 사장 → 간판집 (2026-10-22 "소비자는 사업자로 변경하고 기존 데이터는 사업자로 이관된다") -->
          <section data-testid="convert-section">
            <h3>간판집(사업자)으로 전환 <small class="hint">견적 보드는 내 프로젝트로 옮겨지고, 보낸 요청과 등록한 사업자는 그대로 남습니다. 되돌릴 수 없습니다.</small></h3>
            <p class="row"><span>가게 사장 계정</span><button class="btn small" data-testid="settings-to-shop" onclick={toShop}>간판집으로 전환</button></p>
          </section>
        {:else}
        <!-- 구독 (2026-10-23 토스 자동결제) — 사업자 확인이 먼저 -->
        {#if paymentsShown()}<BillingSection />{/if}
        <!-- 사업자 확인 (2026-10-21): 소유자 계정만. 번호·대표자명·개업일 → 국세청 → 제안 페이지 배지, 체험·요금은 사업자당 1번 -->
        <section data-testid="business-section">
          <h3>사업자 확인 <small class="hint">제안 페이지에 "사업자 확인된 간판집" 배지 — 국세청 등록 정보로 확인합니다</small></h3>
          {#if app.business}
            <p class="row biz" data-testid="biz-verified">
              <span>✓ <b>{app.business.name || '상호 없음'}</b> · {formatBizNo(app.business.no)} · {app.business.ownerName} · 개업 {dateLabel(app.business.startDate)} · <b class:warn={app.business.status !== 'active'}>{BIZ_STATUS_LABEL[app.business.status]}</b> <small>확인 {new Date(app.business.verifiedAt).toLocaleDateString('ko-KR')}</small>{#if app.business.address} · {app.business.address}{/if}</span>
              <button class="btn small" data-testid="biz-remove" onclick={removeBiz}>확인 해제</button>
            </p>
            <p class="row addr"><input data-testid="biz-address-edit" placeholder="사업장 주소 (요청 받기 기본 지역)" bind:value={addrDraft} /><button class="btn small" data-testid="biz-address-save" disabled={bizBusy || addrDraft.trim() === (app.business.address ?? '')} onclick={saveAddress}>주소 저장</button></p>
            {#if app.business.status !== 'active'}<p class="hint err">국세청 기준 {BIZ_STATUS_LABEL[app.business.status]} 상태입니다. 다시 열었으면 사업자등록증 정보로 다시 확인해 주세요.</p>{/if}
          {:else}
            <form class="bizform" onsubmit={(e) => { e.preventDefault(); if (bizReady && !bizBusy) verifyBiz(); }}>
              <label>사업자등록번호<input data-testid="biz-no" inputmode="numeric" placeholder="123-45-67890" value={bizNo} oninput={(e) => (bizNo = formatBizNo(e.currentTarget.value))} /></label>
              <label>대표자 성명<input data-testid="biz-owner" placeholder="사업자등록증의 성명" bind:value={bizOwner} /></label>
              <label>개업일자 <small>(등록증의 개업연월일)</small><input data-testid="biz-start" type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} bind:value={bizStart} /></label>
              <label>상호 <small>(선택)</small><input data-testid="biz-name" placeholder="간판집 상호" bind:value={bizName} /></label>
              <label class="wide">사업장 주소 <small>(요청 받기 기본 지역)</small><input data-testid="biz-address" placeholder="예: 경기도 광주시 경안로 1" bind:value={bizAddress} /></label>
              <p class="row"><span class="hint">사업자등록증에 적힌 그대로 넣어 주세요. 확인은 보통 1초 안에 끝납니다.</span><button class="btn small primary" type="submit" data-testid="biz-verify" disabled={!bizReady || bizBusy}>{bizBusy ? '확인 중…' : '확인'}</button></p>
            </form>
          {/if}
          {#if bizError}<p class="hint err" data-testid="biz-error">{bizError}</p>{/if}
        </section>
        {/if}
        <!-- 차단한 사용자 (2026-10-26 신고·차단 — 앱스토어 1.2) -->
        <section data-testid="blocked-section">
          <h3>차단한 사용자 <small class="hint">차단한 사람의 메시지는 내 화면에서 보이지 않습니다. 대화의 ⋮ 에서 차단합니다.</small></h3>
          {#each app.blocks as b (b.id)}
            <p class="row" data-testid="blocked-user"><span>{b.name || '이름 없음'}</span><button class="btn small" data-testid="unblock" onclick={() => app.unblock(b.id)}>차단 해제</button></p>
          {:else}<p class="hint">차단한 사용자가 없습니다.</p>{/each}
        </section>
        <!-- 계정 삭제 (2026-10-22 "계정삭제도 필요하다") — "삭제" 를 적어야 -->
        <section data-testid="delete-section">
          <h3>계정 삭제 <small class="hint">내 프로젝트·사진·사업자 정보·로그인 정보를 지웁니다. 보낸 요청은 닫히고 연락처가 지워집니다. 되돌릴 수 없습니다.</small></h3>
          {#if !deleting}<p class="row"><span></span><button class="btn small danger" data-testid="delete-account-open" onclick={() => (deleting = true)}>계정 삭제…</button></p>
          {:else}
            <p class="row"><input data-testid="delete-confirm" placeholder="삭제 라고 적어 주세요" bind:value={deleteText} /><button class="btn small danger" data-testid="delete-account" disabled={deleteText.trim() !== '삭제' || deleteBusy} onclick={removeAccount}>영구 삭제</button><button class="btn small" onclick={() => { deleting = false; deleteText = ''; }}>취소</button></p>
          {/if}
        </section>
      {/if}
      {#if app.account && tab === 'rules'}
        <!-- 사양 글 사전 (V2, 2026-10-19): 내 규칙 목록·삭제, 전국 기본값 수 -->
        <section data-testid="rules-section">
          <h3>사양 글 사전 <small class="hint">퀵입력이 못 알아본 말에 답한 뜻 — 내 사전이 전국 기본값보다 먼저</small></h3>
          {#if app.specRules.length}
            <ul class="rules">
              {#each app.specRules as r (r.phrase)}
                <li data-testid="rule-row"><b>{r.phrase}</b> → {r.meaning.map((m) => m.label).join(' · ')} <button class="icon" data-testid="rule-delete" title="지우기" onclick={() => app.removeSpecRule(r.phrase)}>✕</button></li>
              {/each}
            </ul>
          {:else}<p class="hint">아직 없습니다. 퀵입력 확인 창에서 뜻을 고르면 여기에 쌓입니다.</p>{/if}
          <p class="hint">전국 기본값(여러 계정이 같은 뜻으로 쓰는 말) {app.specDefaults.length}개 <button class="btn small" data-testid="glossary-export" title="표준 용어(레지스트리 값) · 연결 공급사 용어 · 내 동의어를 CSV 로" onclick={exportGlossary}>용어집 내보내기</button></p>
          {#if !app.requestsEnabled}
            <!-- 지역 힌트 (V3, 2026-10-19): 요청판 지역 칸이 숨겨져 있을 때 여기서 — 같은 지역 사용자의 뜻을 추천에서 먼저 보여 주는 데만 쓴다 -->
            <label class="opt">내 지역 <small>(시·도부터, 예: 서울 송파구 — 같은 지역 사용자의 말뜻을 추천에서 먼저)</small><input data-testid="rules-region" bind:value={reqRegions} placeholder="예: 경기 광주시" onblur={saveRequests} /></label>
            {#if reqSaved}<p class="hint" data-testid="rules-region-saved">{reqSaved}</p>{/if}
          {/if}
        </section>
      {/if}
      <!-- 요청판 (2026-10-17): 요청 받기 + 지역 → 홈 "받은 요청". 지금은 숨김 (app.requestsEnabled) -->
      {#if app.account && app.requestsEnabled && tab === 'requests'}
        <section data-testid="requests-section">
          <h3>견적 요청 받기</h3>
          <p class="hint">켜 두면 이 지역 가게 사장들의 간판 견적 요청이 홈 "받은 요청"과 이메일로 옵니다. 요청에서 바로 프로젝트를 만들어 제안 링크로 답하고(요금제의 제안 건수), 제안을 보내면 연락처가 보입니다.</p>
          <label class="check"><input type="checkbox" data-testid="req-receive" bind:checked={reqReceive} /> 요청 받기</label>
          <!-- 지역: 기본 = 사업장 주소의 지역, 나머지는 시·도를 골라 체크 (2026-10-24) -->
          {#if homeRegion}<p class="row"><span>기본 지역</span><b data-testid="req-home">{homeRegion} <small class="hint">(사업장 주소)</small></b></p>
          {:else}<p class="hint" data-testid="req-home-missing">계정 탭의 사업자 확인에서 <b>사업장 주소</b>를 넣으면 그 지역이 기본으로 들어갑니다.</p>{/if}
          <div class="regions">
            <label class="opt">다른 지역 더하기 <select data-testid="req-sido" bind:value={reqSido}>{#each KOREA_REGIONS as r (r.sido)}<option value={r.sido}>{r.sido}</option>{/each}</select></label>
            <div class="areas">
              {#each KOREA_REGIONS.find((r) => r.sido === reqSido)?.areas ?? [] as a (a)}
                {@const name = regionLabel(reqSido, a)}
                <label class="area"><input type="checkbox" data-testid="req-area" data-region={name} checked={name === homeRegion || reqPicked.includes(name)} disabled={name === homeRegion} onchange={() => togglePick(name)} /> {a}</label>
              {/each}
            </div>
            {#if reqExtras.length}<div class="chips">{#each reqExtras as r (r)}<button class="chip" data-testid="req-chip" title="빼기" onclick={() => togglePick(r)}>{r} ✕</button>{/each}</div>{/if}
          </div>
          <p class="row"><span class="hint" data-testid="req-saved">{reqSaved}</span><button class="btn small primary" data-testid="req-save" onclick={saveRequests} disabled={reqBusy}>저장</button></p>
        </section>
      {/if}
      {#if app.account && tab === 'team'}
        <section data-testid="team-section">
          <h3>멤버 {#if app.usage}<span class="count" data-testid="usage-members">{app.usage.usage.members} / {app.usage.limits.members}명</span>{/if}</h3>
          <p class="hint">멤버는 내 프로젝트 그룹과 계산서를 봅니다. 정산 금액은 "정산 보기"를 켠 멤버만 봅니다. 이메일로 추가합니다 — 아직 가입 안 했으면 <b>가입 링크를 메일로</b> 보내고, 링크를 열어 비밀번호만 정하면 바로 멤버가 됩니다(사업자 확인 없이, 7일 유효).</p>
          {#each members ?? [] as m (m.accountId)}
            <div class="member" data-testid="team-member">
              <span>{m.name || m.email}<small>{m.email}</small></span>
              <label class="check"><input type="checkbox" data-testid="member-billing" checked={m.canBilling} onchange={async (e) => { await setTeamMember(m.accountId, e.currentTarget.checked); await loadTeam(); }} /> 정산 보기</label>
              <button class="icon" title="멤버 제거" data-testid="member-remove" onclick={async () => { await removeTeamMember(m.accountId); await loadTeam(); }}>✕</button>
            </div>
          {:else}
            {#if members && !invites.length}<p class="hint">아직 멤버가 없습니다.</p>{/if}
          {/each}
          {#each invites as v (v.email)}
            <div class="member invite" data-testid="member-invite">
              <span>{v.email || '링크 초대 (카카오톡)'}<small>가입 대기 · 링크 {new Date(v.expiresAt).toLocaleDateString('ko-KR')}까지</small></span>
              {#if v.email}<button class="btn small" title="링크를 새로 보내기" data-testid="member-invite-resend" onclick={async () => { await addTeamMember(v.email, v.canBilling); memberSent = v.email; await loadTeam(); }}>다시 보내기</button>{/if}
              <button class="icon" title="초대 취소" data-testid="member-invite-cancel" onclick={async () => { await cancelTeamInvite(v.email || v.id); await loadTeam(); app.refreshMe(); }}>✕</button>
            </div>
          {/each}
          <form class="add" onsubmit={(e) => { e.preventDefault(); addMember(); }}>
            <input data-testid="member-email" placeholder="멤버 이메일" bind:value={memberEmail} />
            <button class="btn small" data-testid="member-add" type="submit" disabled={!memberEmail.trim()}>추가</button>
          </form>
          {#if memberError}<p class="hint err" data-testid="member-error">{memberError}</p>{/if}
          <p class="row kakao"><button class="btn small kakao" data-testid="member-kakao" onclick={kakaoInvite}>카카오톡으로 초대</button><span class="hint">이메일 없이 링크로 — 받은 사람이 [카카오로 팀 들어가기]</span></p>
          {#if teamLink}<p class="row"><input data-testid="member-link" readonly value={teamLink} onfocus={(e) => e.currentTarget.select()} /></p><p class="hint ok" data-testid="member-link-note">{teamLinkNote}</p>{/if}
          {#if memberSent}<p class="hint ok" data-testid="member-sent"><b>{memberSent}</b>로 가입 링크를 보냈습니다. 링크를 열어 비밀번호만 정하면 멤버가 됩니다.</p>{/if}
        </section>
      {/if}
      {#if tab === 'display'}
      <section>
        <h3>표시</h3>
        <label class="check"><input type="checkbox" data-testid="warn-measure" checked={app.warnMeasure} onchange={(e) => app.setWarnMeasure(e.currentTarget.checked)} /> 입력 치수가 사진 추정과 많이 다르면 경고(⚠) 표시</label>
        <label class="check gz">매니퓰레이터 크기
          <input type="range" data-testid="gizmo-size" min="32" max="96" step="8" value={app.gizmoSize} oninput={(e) => app.setGizmoSize(Number(e.currentTarget.value))} />
          <span>{app.gizmoSize}px</span>
        </label>
        <p class="hint">치수는 제작용 메모이고 3D 는 그린 영역에 맞춥니다. 경고는 참고용이라 기본은 꺼져 있습니다.</p>
      </section>
      {/if}
      {#if tab === 'keys'}
      {#each groups as g (g)}
        <section>
          <h3>{g}</h3>
          <table>
            <tbody>
              {#each ACTIONS.filter((a) => a.group === g) as a (a.id)}
                {@const editing = capture?.action === a.id}
                <tr data-testid="shortcut-row-{a.id}" class:editing>
                  <td class="name">{a.label}</td>
                  <td class="keys">
                    {#if editing}
                      <span class="wait">{capture?.mode === 'add' ? '추가할' : '새'} 키를 누르세요 · Esc 취소</span>
                    {:else}
                      {#each app.keymap[a.id] as c (c)}
                        <span class="kbd">{fmt(c)}<button title="삭제" onclick={() => set(a.id, app.keymap[a.id].filter((x) => x !== c))}>×</button></span>
                      {:else}
                        <span class="none">없음</span>
                      {/each}
                    {/if}
                  </td>
                  <td class="actions">
                    <button class="btn small" data-testid="shortcut-edit-{a.id}" onclick={() => (capture = { action: a.id, mode: 'replace' })}>변경</button>
                    <button class="btn small" data-testid="shortcut-add-{a.id}" title="키 추가" onclick={() => (capture = { action: a.id, mode: 'add' })}>＋</button>
                    <button class="icon" title="기본값 ({DEFAULT_KEYMAP[a.id].map(fmt).join(', ')})" disabled={isDefault(a.id)}
                      onclick={() => set(a.id, [...DEFAULT_KEYMAP[a.id]])}>↺</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/each}

      {#each conflicts as c (c.combo)}
        <p class="conflict" data-testid="shortcut-conflict">
          ⚠ <b>{fmt(c.combo)}</b> 키가 {c.actions.map(label).join(', ')}에 함께 지정되어 있습니다. 앞에 있는 동작({label(c.actions[0])})만 실행됩니다.
        </p>
      {/each}

      <section>
        <h3>마우스·트랙패드 (고정)</h3>
        <table>
          <tbody>
            <tr><td class="name">확대·축소</td><td class="keys"><span class="kbd">마우스 휠</span><span class="kbd">{app.isMac ? '⌃' : 'Ctrl'} + 휠</span><span class="kbd">핀치</span></td></tr>
            <tr><td class="name">화면 이동</td><td class="keys"><span class="kbd">트랙패드 스크롤</span><span class="kbd">빈 곳 드래그</span><span class="kbd">가운데 버튼 드래그</span></td></tr>
            <tr><td class="name">선택 해제 · 입력 종료</td><td class="keys"><span class="kbd">Esc</span></td></tr>
          </tbody>
        </table>
      </section>
      {/if}
    </div>

    {#if tab === 'keys'}
    <footer>
      <span class="hint">글자 키는 키보드 위치 기준이라 한글 입력 상태에서도 동작합니다.</span>
      <button class="btn small" data-testid="shortcuts-reset-all" onclick={() => { capture = null; app.resetKeymap(); }}>모두 기본값으로</button>
    </footer>
    {/if}
  </div>
</div>

<style>
  .rules { list-style: none; margin: 4px 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
  .rules li { display: flex; align-items: center; gap: 6px; }
  .rules .icon { margin-left: auto; }
  .row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 13px; }
  .bar { height: 6px; background: var(--input); border-radius: 3px; overflow: hidden; margin: 2px 0 6px; }
  .bar i { display: block; height: 100%; background: var(--accent); }
  .member { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
  .member.invite > span { color: var(--muted); }
  .btn.kakao { background: #fee500; color: #191919; border-color: #fee500; font-weight: 700; }
  .row.kakao { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  input[data-testid='member-link'] { width: 100%; }
  .member > span { flex: 1; } .member small { display: block; color: var(--muted); font-size: 11px; }
  .add { display: flex; gap: 6px; margin-top: 8px; }
  .err { color: var(--danger); }
  .bizform { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; }
  .bizform label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--muted); }
  .bizform .row { grid-column: 1 / -1; align-items: center; }
  .bizform .wide { grid-column: 1 / -1; }
  .addr input { flex: 1; min-width: 0; }
  .regions { display: flex; flex-direction: column; gap: 6px; margin: 6px 0; }
  .areas { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 4px 8px; max-height: 220px; overflow-y: auto; padding: 6px; border: 1px solid var(--line); border-radius: 8px; }
  .area { display: flex; flex-direction: row; align-items: center; gap: 4px; font-size: 13px; white-space: nowrap; }
  .area input { width: auto; margin: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 12px; padding: 2px 10px; font: inherit; font-size: 12px; cursor: pointer; }
  .biz .warn { color: var(--warn); }
  @media (max-width: 720px) { .bizform { grid-template-columns: 1fr; } }
  .count { font-weight: 400; margin-left: 6px; }
  .check { display: flex; align-items: center; gap: 6px; font-size: 13px; }
  .opt { display: flex; flex-direction: row; align-items: center; gap: 8px; font-size: 13px; white-space: nowrap; }
  .opt > input { flex: 1; min-width: 0; }
  .gz { margin-top: 8px; }
  .gz input { flex: 1; }
  .hint { color: var(--muted); font-size: 12px; margin: 4px 0 0; }
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 50; }
  .dialog { width: min(620px, calc(100vw - 32px)); max-height: calc(100dvh - 64px); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); }
  header { display: flex; align-items: center; gap: 16px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
  @media (max-width: 720px) { header { gap: 8px; padding: 10px 12px; } .tab { padding: 4px 7px; font-size: 12px; } }
  h2 { margin: 0; font-size: 16px; }
  .tabs { display: flex; gap: 2px; overflow-x: auto; min-width: 0; }
  .tab { background: none; border: 0; color: var(--muted); font: inherit; font-size: 13px; padding: 4px 10px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
  .tab.on { background: var(--input); color: var(--text); }
  .body { min-height: 220px; }
  header .icon { margin-left: auto; }
  .body { overflow-y: auto; padding: 4px 16px 12px; }
  section { margin-top: 12px; }
  h3 { font-size: 12px; color: var(--muted); margin: 0 0 6px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  tr { border-bottom: 1px solid var(--line); }
  tr.editing { background: color-mix(in srgb, var(--accent) 6%, transparent); }
  td { padding: 7px 4px; font-size: 13px; vertical-align: middle; }
  td.name { width: 38%; }
  td.keys { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; min-height: 36px; }
  td.actions { text-align: right; white-space: nowrap; }
  td.actions .btn { margin-left: 4px; }
  .kbd { display: inline-flex; align-items: center; gap: 4px; background: var(--input); border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; padding: 2px 7px; font-size: 12px; font-family: inherit; font-variant-numeric: tabular-nums; }
  .kbd button { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 0; font-size: 12px; }
  .kbd button:hover { color: var(--danger); }
  .none { color: var(--muted); font-size: 12px; }
  .wait { color: var(--accent); font-size: 12px; }
  .conflict { background: rgba(255, 170, 0, 0.1); border: 1px solid rgba(255, 170, 0, 0.5); border-radius: 8px; padding: 8px 10px; font-size: 12px; margin: 12px 0 0; }
  .icon:disabled { opacity: 0.3; cursor: default; }
  footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--line); }
  .hint { color: var(--muted); font-size: 12px; }
  .btn.danger { color: var(--danger); border-color: var(--danger); }
</style>
