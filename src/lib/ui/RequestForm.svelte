<!--
  요청 올리기 (고객, 로그인 없음, 휴대폰 우선) — /request?ref=<홍보자 코드> (2026-10-17 요청판).
  사진·가게·지역·내용·전화(·이메일) → 요청 생성 → 사진 올림 → 내 요청 페이지 주소. 돈은 고객↔간판사 직접, 간판다는 전달만
-->
<script lang="ts">
  import { AuthError } from '../auth';
  import { createRequest, uploadRequestPhoto } from '../requests';

  const ref = new URL(location.href).searchParams.get('ref') ?? '';
  let store = $state(''), region = $state(''), text = $state(''), phone = $state(''), email = $state('');
  let files = $state<File[]>([]);
  let busy = $state('');
  let error = $state('');
  let done = $state<{ url: string; email: boolean } | null>(null);
  const previews = $derived(files.map((f) => URL.createObjectURL(f)));
  const canSend = $derived(!!store.trim() && !!region.trim() && phone.replace(/\D/g, '').length >= 9 && files.length > 0 && !busy);

  function pick(e: Event) {
    const list = (e.currentTarget as HTMLInputElement).files;
    if (!list) return;
    files = [...files, ...[...list].filter((f) => f.type.startsWith('image/'))].slice(0, 3);
  }
  async function send() {
    if (!canSend) return;
    error = '';
    try {
      busy = '요청 보내는 중…';
      const r = await createRequest({ store: store.trim(), region: region.trim(), text: text.trim(), phone, ...(email.trim() ? { email: email.trim() } : {}), ...(ref ? { ref } : {}) });
      for (const [i, f] of files.entries()) { busy = `사진 올리는 중… (${i + 1}/${files.length})`; await uploadRequestPhoto(r.id, r.key, f); }
      done = { url: r.url, email: !!email.trim() };
    } catch (e) {
      if (e instanceof AuthError && e.status === 429) error = '이 전화번호로 이미 3건의 요청이 진행 중입니다. 받은 제안을 먼저 확인해 주세요.';
      else error = e instanceof Error ? e.message : String(e);
    } finally { busy = ''; }
  }
</script>

<div class="page" data-testid="request-form">
  <header class="hero">
    <h1>간판 견적 요청</h1>
    <p>가게 사진을 올리면 이 지역 간판집들이 <b>내 가게 사진 위에 간판이 달린 모습과 금액</b>을 보내 드립니다. 로그인 없이, 무료입니다.</p>
  </header>
  {#if done}
    <section class="card done" data-testid="req-done">
      <h2>요청을 보냈습니다</h2>
      <p>간판집의 제안이 오면 아래 페이지에서 볼 수 있습니다. <b>이 주소를 저장해 두세요</b>{done.email ? ' (이메일로도 보냈습니다)' : ''}.</p>
      <input data-testid="req-done-link" readonly value={done.url} onfocus={(e) => e.currentTarget.select()} />
      <a class="btn primary" data-testid="req-done-open" href={done.url}>내 요청 페이지 열기</a>
    </section>
  {:else}
    <section class="card">
      <label>가게 사진 <small>(1~3장, 간판 자리가 보이게 정면에서)</small>
        <input data-testid="req-photos" type="file" accept="image/*" multiple onchange={pick} />
      </label>
      {#if files.length}
        <div class="thumbs">{#each previews as u, i (u)}<div class="thumb"><img src={u} alt="" /><button class="icon" type="button" title="빼기" onclick={() => (files = files.filter((_, j) => j !== i))}>✕</button></div>{/each}</div>
      {/if}
      <label>가게 이름<input data-testid="req-store" bind:value={store} placeholder="예: 바로바로 정육점" maxlength="60" /></label>
      <label>지역 <small>(시/군/구까지)</small><input data-testid="req-region" bind:value={region} placeholder="예: 경기 광주시" maxlength="40" /></label>
      <label>원하는 것<textarea data-testid="req-text" bind:value={text} rows="3" placeholder="예: 전면 간판 교체, 밤에도 잘 보이게. 기존 간판은 철거" maxlength="500"></textarea></label>
      <label>전화번호<input data-testid="req-phone" bind:value={phone} type="tel" placeholder="010-0000-0000" /></label>
      <label>이메일 <small>(선택 — 제안 페이지 주소를 보내 드립니다)</small><input data-testid="req-email" bind:value={email} type="email" placeholder="선택" /></label>
      {#if error}<p class="warn" data-testid="req-error">{error}</p>{/if}
      <button class="btn primary big" data-testid="req-submit" disabled={!canSend} onclick={send}>{busy || '견적 요청 보내기'}</button>
      <p class="fine">연락처는 제안을 보낸 간판집에게만 보입니다. 계약과 결제는 간판집과 직접 하시고, 간판다는 요청을 전달하고 합의 내용을 기록합니다.</p>
    </section>
  {/if}
</div>

<style>
  .page { max-width: 560px; margin: 0 auto; padding: 0 16px 60px; display: flex; flex-direction: column; gap: 14px; color: var(--text); }
  .hero { padding: 24px 0 4px; }
  .hero h1 { margin: 0 0 8px; font-size: 22px; }
  .hero p { margin: 0; color: var(--muted); line-height: 1.5; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  label small { color: var(--muted); font-weight: 400; }
  input, textarea { width: 100%; box-sizing: border-box; font-size: 15px; }
  .thumbs { display: flex; gap: 8px; flex-wrap: wrap; }
  .thumb { position: relative; width: 96px; height: 72px; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
  .thumb .icon { position: absolute; top: -6px; right: -6px; }
  .big { padding: 12px; font-size: 16px; }
  .warn { color: #ffb347; margin: 0; font-size: 13px; }
  .fine { color: var(--muted); font-size: 12px; margin: 0; line-height: 1.5; }
  .done h2 { margin: 0; }
</style>
