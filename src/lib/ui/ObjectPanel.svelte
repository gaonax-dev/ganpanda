<!-- 선택한 사인물: 이름·분류(간판/스카시/시트)·한 줄 요약 + 대화. 세부 설정은 ObjectSettingsDialog -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { categoryPatch } from '../core/parts';
  import { CATEGORY_GROUPS, categoryOf, defaultProductFor, productById, sheetById, type Group } from '../core/catalog';
  import { copiesOf } from '../core/link';
  import { quoteObject, won } from '../core/quote';
  import { describeOptions } from '../core/options';
  import type { SignObject } from '../core/model';
  import Chat from './Chat.svelte';
  import SpecInput from './SpecInput.svelte';
  import QuickSpec from './QuickSpec.svelte';

  let { obj }: { obj: SignObject } = $props();

  // 패널이 열려 있는 동안 이 사인물의 새 메시지는 읽은 것으로
  const chatId = $derived(obj.sameAs ?? obj.id);
  $effect(() => { app.messages; app.markSeen(chatId); });
  /** 연결 대상 후보: 다른 사인물(원본)들 */
  const linkTargets = $derived(app.signs.filter((s) => s.id !== obj.id && s.id !== obj.sameAs));
  const copies = $derived(copiesOf(obj.sameAs ?? obj.id, app.objects));
  const photoName = (id: string) => (id ? app.photos.find((p) => p.id === id)?.name ?? '' : '보드');
  const shownIn = $derived([obj.sameAs ?? obj.id, ...copies.map((c) => c.id)].map((id) => app.objects.find((o) => o.id === id)).filter((o): o is SignObject => !!o && o.id !== obj.id));

  const category = $derived(categoryOf(obj));
  const m = $derived(app.measures.get(obj.id));
  const size = $derived(app.sizeOf(obj));
  const total = $derived(quoteObject(size ? { ...obj, widthMm: size.w, heightMm: size.h } : obj, app.prices).reduce((a, l) => a + l.amount, 0));
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v)));
  // 종류 · 치수 · 금액을 한 줄로
  const summary = $derived.by(() => {
    const parts: string[] = [];
    const product = productById(obj.productId);
    if (product) parts.push(product.name);
    else if (obj.sheetIds.length) parts.push(obj.sheetIds.map((id) => sheetById(id)?.name ?? id).join(', '));
    parts.push(...describeOptions(obj));
    if (size) parts.push(`${fmt(size.w)}×${fmt(size.h)}mm${size.estimated ? ' (추정)' : ''}`); // 치수는 가로×세로, 두께는 소재 옆(describeOptions)
    if (total && !app.isCustomer) parts.push(won(total)); // 고객에게는 금액 없음 (제안 링크에서)
    return parts;
  });

  const ro = $derived(!app.canEdit);
  const update = (patch: Partial<SignObject>) => { if (app.canEdit) app.project.updateObject(obj.id, patch); };

  /** 분류 바꾸기 확인 중 (2026-10-15 사용자: 여러 사람이 쓰니 처음 고른 뒤의 변경은 안내 창을 거친다) */
  let pending: Group | null = $state(null);
  function pickCategory(g: Group | '') {
    if (!g || g === category) return;
    if (category === null) { apply(g); return; } // 처음 선택은 바로
    pending = g;
  }
  function apply(g: Group) {
    // 시트는 제품 없이 시트만, 나머지는 분류의 기본 제품으로 시작. 옵션은 종류가 바뀌므로 비운다
    update(categoryPatch(obj, g, defaultProductFor(g))); // 못 붙는 구성 요소는 정리 (2026-10-16 모든 분류 조합형) // 시트는 시트 컷팅으로 시작
    pending = null;
  }
  const label = (g: Group | null) => CATEGORY_GROUPS.find((c) => c.id === g)?.label ?? '없음';
</script>

<aside class="panel" data-testid="object-panel">
  <header>
    <!-- 입력 즉시 저장: 바깥을 눌러 패널이 닫히면 change 가 오지 않아 이름이 사라졌음 (2026-10-15 사용자: "웹에서 사인물 이름 변경" 안 됨) -->
    <input class="title" data-testid="object-name" value={obj.name} disabled={ro} oninput={(e) => { const v = e.currentTarget.value.trim(); if (v) update({ name: v }); }} />
    <button class="icon" title="닫기" data-testid="object-panel-close" onclick={() => { if (app.compact) app.panelOpen = false; else app.selectObject(null); }}>✕</button>
  </header>
  <!-- 대화 위의 내용(연결·분류·사이즈·사양 글·칩·요약)은 길어지면 스크롤 — 휴대폰에서 대화 입력칸이 밀려 안 보이던 문제 (2026-10-17) -->
  <div class="info">

  {#if obj.sameAs || shownIn.length || (linkTargets.length && !ro)}
    <section class="link" data-testid="link-section">
      {#if obj.sameAs || shownIn.length}
        <p class="linked" data-testid="link-info">⇄ 같은 사인물 · {shownIn.length + 1}곳에 표시
          {#each shownIn as s (s.id)}<button class="jump" onclick={() => app.selectObject(s.id)}>{photoName(s.photoId)}</button>{/each}
        </p>
        {#if obj.sameAs && !ro}<button class="btn small" data-testid="unlink" onclick={() => { app.editBoundary(); app.project.unlinkObject(obj.id); app.editBoundary(); }}>연결 해제</button>{/if}
      {:else}
        <label class="row">기존 사인물과 같은 것?
          <select data-testid="link-select" value="" onchange={(e) => { const id = e.currentTarget.value; if (id) { app.editBoundary(); app.project.linkObject(obj.id, id); app.editBoundary(); } }}>
            <option value="">아니오 (새 사인물)</option>
            {#each linkTargets as s (s.id)}<option value={s.id}>{s.name} · {photoName(s.photoId)}</option>{/each}
          </select>
        </label>
      {/if}
    </section>
  {/if}

  <section>
    <label class="cat">분류
      <select data-testid="category-select" value={pending ?? category ?? ''} disabled={ro} onchange={(e) => pickCategory(e.currentTarget.value as Group | '')}>
        <option value="" disabled>분류 선택</option>
        {#each CATEGORY_GROUPS as g (g.id)}<option value={g.id} title={g.hint}>{g.label}</option>{/each}
      </select>
    </label>
    {#if pending}
      <div class="confirm" data-testid="category-confirm" role="alertdialog">
        <p>분류를 <b>{label(category)} → {label(pending)}</b> 로 바꾸면 종류·옵션이 초기화되고 함께 보는 모든 사람에게 적용됩니다. 바꿀까요?</p>
        <div class="row"><button class="btn small primary" data-testid="category-confirm-ok" onclick={() => apply(pending!)}>바꾸기</button><button class="btn small" data-testid="category-confirm-cancel" onclick={() => (pending = null)}>취소</button></div>
      </div>
    {/if}
    <!-- 처음 만들 때 패널에서 바로: 사이즈 → 사양 글 → 칩 (2026-10-17 사용자: "사인물종류 그리고 사이즈작성하고 다음줄에 텍스트로 … 퀵설정과 같은 요소가 생성되게"). 칩을 누르면 설정 창이 그 자리로 -->
    {#if category && category !== 'sheet'}
      <div class="sizes" data-testid="panel-size">
        <label>가로<input data-testid="panel-width" type="number" inputmode="decimal" min="0" step="10" value={obj.widthMm ?? ''} disabled={ro} placeholder={m?.estimate ? `≈${fmt(m.estimate.widthMm)}` : '입력'} oninput={(e) => update({ widthMm: num(e.currentTarget.value) })} /></label>
        <span>×</span>
        <label>세로<input data-testid="panel-height" type="number" inputmode="decimal" min="0" step="10" value={obj.heightMm ?? ''} disabled={ro} placeholder={m?.estimate ? `≈${fmt(m.estimate.heightMm)}` : '입력'} oninput={(e) => update({ heightMm: num(e.currentTarget.value) })} /></label>
        <span>mm</span>
      </div>
      {#if !ro}<SpecInput {obj} {ro} {update} />{/if}
      <QuickSpec {obj} {ro} {update} compact onPick={(tab) => { app.objectSettingsFocus = tab; app.objectSettingsOpen = true; }} />
    {/if}
    <div class="row">
      <p class="summary" data-testid="object-summary">
        {#if summary.length}{summary.join(' · ')}{:else}<span class="hint">분류를 고르고 설정에서 종류·치수를 정하세요</span>{/if}
      </p>
      <button class="btn small" data-testid="object-settings-open" onclick={() => (app.objectSettingsOpen = true)}>설정</button>
    </div>
    {#if app.warnMeasure && m?.warnings.length}
      <button class="warning" data-testid="measure-warning-hint" onclick={() => (app.objectSettingsOpen = true)}>⚠ 실측 확인 필요 — 설정에서 확인</button>
    {/if}
  </section>

  </div>
  <section class="chat-sec">
    <Chat objectId={chatId} />
  </section>
</aside>

<style>
  .panel {
    position: absolute; top: 12px; right: 12px; bottom: 12px; width: 330px; z-index: 5;
    background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
    display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
  }
  header { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
  .title { flex: 1; background: none; border: 0; color: var(--text); font: inherit; font-size: 16px; font-weight: 700; padding: 4px; border-radius: 6px; }
  .title:focus { background: var(--input); outline: none; }
  .sizes { display: flex; align-items: center; gap: 6px; margin: 6px 0; font-size: 12px; color: var(--muted); }
  .sizes label { display: flex; align-items: center; gap: 4px; flex: 1; }
  .sizes input { width: 100%; min-width: 0; text-align: right; }
  section { padding: 10px 14px; border-bottom: 1px solid var(--line); }
  .row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .summary { flex: 1; margin: 0; font-size: 12px; color: var(--text); line-height: 1.4; }
  .hint { color: var(--muted); }
  .cat { flex-direction: row; align-items: center; gap: 8px; font-size: 12px; }
  .cat select { flex: 1; }
  .confirm { margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: rgba(255, 170, 0, 0.1); border: 1px solid rgba(255, 170, 0, 0.5); font-size: 12px; }
  .confirm p { margin: 0 0 6px; line-height: 1.4; }
  .confirm .row { margin-top: 0; }
  .link { background: rgba(47, 139, 255, 0.08); }
  .link .row { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .linked { margin: 0 0 6px; font-size: 12px; color: var(--blue); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .jump { background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 10px; padding: 1px 8px; font: inherit; font-size: 11px; cursor: pointer; }
  .warning {
    display: block; width: 100%; margin-top: 8px; text-align: left; cursor: pointer; font: inherit; font-size: 12px;
    background: rgba(255, 170, 0, 0.1); border: 1px solid rgba(255, 170, 0, 0.5); color: var(--warn); border-radius: 8px; padding: 6px 10px;
  }
  .info { flex: 0 1 auto; min-height: 0; overflow-y: auto; }
  .chat-sec { flex: 1 1 auto; min-height: 220px; display: flex; flex-direction: column; padding: 0; border-bottom: 0; }
  /* 휴대폰 폭: 화면 아래쪽 시트 (사진이 위에 보이게) */
  @media (max-width: 720px) {
    .panel { left: 8px; right: 8px; top: auto; bottom: 8px; width: auto; height: 62%; border-radius: 14px; }
    .info { max-height: 55%; }
    .chat-sec { min-height: 160px; }
  }
  /* 휴대폰 세로 보기: [상세정보] 패널도 전체 화면 (2026-10-17) */
  @media (max-width: 720px) and (orientation: portrait) {
    .panel { left: 0; right: 0; top: 0; bottom: 0; height: auto; border-radius: 0; border: 0; }
  }
</style>
