<!-- 선택한 사인물: 이름·분류(간판/스카시/시트)·한 줄 요약 + 대화. 세부 설정은 ObjectSettingsDialog -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { CATEGORY_GROUPS, categoryOf, defaultProductFor, productById, sheetById, type Group } from '../core/catalog';
  import { copiesOf } from '../core/link';
  import { quoteObject, won } from '../core/quote';
  import { describeOptions } from '../core/options';
  import type { SignObject } from '../core/model';
  import Chat from './Chat.svelte';

  let { obj }: { obj: SignObject } = $props();

  // 패널이 열려 있는 동안 이 사인물의 새 메시지는 읽은 것으로
  const chatId = $derived(obj.sameAs ?? obj.id);
  $effect(() => { app.messages; app.markSeen(chatId); });
  /** 연결 대상 후보: 다른 사인물(원본)들 */
  const linkTargets = $derived(app.signs.filter((s) => s.id !== obj.id && s.id !== obj.sameAs));
  const copies = $derived(copiesOf(obj.sameAs ?? obj.id, app.objects));
  const photoName = (id: string) => app.photos.find((p) => p.id === id)?.name ?? '';
  const shownIn = $derived([obj.sameAs ?? obj.id, ...copies.map((c) => c.id)].map((id) => app.objects.find((o) => o.id === id)).filter((o): o is SignObject => !!o && o.id !== obj.id));

  const category = $derived(categoryOf(obj));
  const m = $derived(app.measures.get(obj.id));
  const size = $derived(app.sizeOf(obj));
  const total = $derived(quoteObject(size ? { ...obj, widthMm: size.w, heightMm: size.h } : obj, app.prices).reduce((a, l) => a + l.amount, 0));
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  // 종류 · 치수 · 금액을 한 줄로
  const summary = $derived.by(() => {
    const parts: string[] = [];
    const product = productById(obj.productId);
    if (product) parts.push(product.name);
    else if (obj.sheetIds.length) parts.push(obj.sheetIds.map((id) => sheetById(id)?.name ?? id).join(', '));
    parts.push(...describeOptions(obj));
    if (size) parts.push(`${fmt(size.w)}×${fmt(size.h)}mm${size.estimated ? ' (추정)' : ''}`);
    if (total) parts.push(won(total));
    return parts;
  });

  const ro = $derived(!app.canEdit);
  const update = (patch: Partial<SignObject>) => { if (app.canEdit) app.project.updateObject(obj.id, patch); };

  function setCategory(g: Group) {
    if (g === category) return;
    // 시트는 제품 없이 시트만, 나머지는 분류의 기본 제품으로 시작
    update({ productId: defaultProductFor(g) });
  }
</script>

<aside class="panel" data-testid="object-panel">
  <header>
    <input class="title" value={obj.name} disabled={ro} onchange={(e) => update({ name: e.currentTarget.value || obj.name })} />
    <button class="icon" title="닫기" onclick={() => app.selectObject(null)}>✕</button>
  </header>

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
    <div class="seg">
      {#each CATEGORY_GROUPS as g (g.id)}
        <button data-testid="category-{g.id}" class:on={category === g.id} disabled={ro} title={g.hint} onclick={() => setCategory(g.id)}>{g.label}</button>
      {/each}
    </div>
    <div class="row">
      <p class="summary" data-testid="object-summary">
        {#if summary.length}{summary.join(' · ')}{:else}<span class="hint">분류를 고르고 설정에서 종류·치수를 정하세요</span>{/if}
      </p>
      <button class="btn small" data-testid="object-settings-open" onclick={() => (app.objectSettingsOpen = true)}>설정</button>
    </div>
    {#if m?.warnings.length}
      <button class="warning" data-testid="measure-warning-hint" onclick={() => (app.objectSettingsOpen = true)}>⚠ 실측 확인 필요 — 설정에서 확인</button>
    {/if}
  </section>

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
  section { padding: 10px 14px; border-bottom: 1px solid var(--line); }
  .row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .summary { flex: 1; margin: 0; font-size: 12px; color: var(--text); line-height: 1.4; }
  .hint { color: var(--muted); }
  .link { background: rgba(47, 139, 255, 0.08); }
  .link .row { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .linked { margin: 0 0 6px; font-size: 12px; color: var(--blue); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .jump { background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 10px; padding: 1px 8px; font: inherit; font-size: 11px; cursor: pointer; }
  .warning {
    display: block; width: 100%; margin-top: 8px; text-align: left; cursor: pointer; font: inherit; font-size: 12px;
    background: rgba(255, 170, 0, 0.1); border: 1px solid rgba(255, 170, 0, 0.5); color: var(--warn); border-radius: 8px; padding: 6px 10px;
  }
  .chat-sec { flex: 1; min-height: 220px; display: flex; flex-direction: column; padding: 0; border-bottom: 0; }
</style>
