<!--
  색 고르기 창 (2026-10-18 사용자: "컬러선택을 색상 ㅁ 상자로 바꾸고 현재 진열된 컬러들은 대화상자에서 보여줘 컬러 피커와 같이.
  라이브러리 컬러에 x마크 대신 메뉴 나오게 하고 수정 삭제로. 색이름 위에 tag — 입력창이자 검색창, 기존 태그를 하단에 셀렉터로, 글자가 입력되는 대로 리스트").
  한 창에: 기본색 견본(✕ 도색 없음 · 🎨 직접) → 라이브러리(검색·종류 필터·카드, ⋯ 메뉴 = 수정/삭제) → 새 색 만들기/수정(태그·이름·색·공급사·코드)
  테스트 id 는 필드 접두사를 그대로 (<tp><prefix>-swatch-<색> · -none · -picker · -lib-<id>) — 이전에 필드 안에 있던 견본이 창으로 옮겨 왔다
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { NAMED_COLORS, PAINT_SYSTEMS } from '../core/materials';
  import { COLOR_KINDS, allTags, cardRef, newColorCard, searchCards, tagSuggestions, type ColorCard, type ColorKind } from '../core/colorLibrary';

  let { prefix, tp = 'option-', label, opts, onpick, onpickNamed, onpickHex, onclear, onclose }: {
    prefix: string; tp?: string; label: string; opts: Record<string, string | boolean>;
    onpick: (c: ColorCard) => void; onpickNamed: (name: string) => void; onpickHex: (hex: string) => void; onclear: () => void; onclose: () => void;
  } = $props();
  const [NONE, BASIC, DIRECT] = PAINT_SYSTEMS;
  const sys = $derived((opts[`${prefix}System`] as string | undefined) ?? NONE);
  const code = $derived((opts[`${prefix}Code`] as string | undefined) ?? '');
  const curHex = $derived((opts[`${prefix}Hex`] as string | undefined) ?? (sys === DIRECT ? code : NAMED_COLORS.find((c) => c.label === code)?.hex) ?? '#888888');
  const cardId = $derived((opts[`${prefix}CardId`] as string | undefined) ?? null);

  // 라이브러리
  let search = $state('');
  let filter = $state<ColorKind | ''>('');
  let menuFor = $state<string | null>(null);
  const list = $derived(searchCards([...app.colorLibrary].sort((a, b) => b.createdAt - a.createdAt), search).filter((c) => !filter || c.kind === filter));

  // 새 색 / 수정
  let editing = $state<ColorCard | null>(null);
  let kind = $state<ColorKind>(COLOR_KINDS[0]);
  let name = $state('');
  let hex = $state('#7a1f2e');
  let supplier = $state('');
  let codeIn = $state('');
  let tags = $state<string[]>([]);
  let tagText = $state('');
  let tagFocus = $state(false);
  let error = $state('');
  const suggestions = $derived(tagSuggestions(app.colorLibrary, tagText, tags));
  const existingTags = $derived(allTags(app.colorLibrary));
  const fixHex = (v: string) => { const t = v.trim().toLowerCase(); return /^#?[0-9a-f]{6}$/.test(t) ? (t.startsWith('#') ? t : `#${t}`) : null; };
  function addTag(t: string) { const v = t.trim().slice(0, 20); if (v && !tags.includes(v) && tags.length < 10) tags = [...tags, v]; tagText = ''; }
  function startEdit(c: ColorCard) { editing = c; kind = c.kind; name = c.name; hex = c.hex; supplier = c.supplier ?? ''; codeIn = c.code ?? ''; tags = [...(c.tags ?? [])]; menuFor = null; error = ''; }
  function cancelEdit() { editing = null; name = ''; supplier = ''; codeIn = ''; tags = []; tagText = ''; error = ''; }
  async function save() {
    error = '';
    if (tagText.trim()) addTag(tagText);
    const h = fixHex(hex);
    if (!name.trim()) { error = '색 이름을 적어 주세요.'; return; }
    if (!h) { error = '색은 #rrggbb 형식이어야 합니다.'; return; }
    if (editing) {
      const card: ColorCard = { ...editing, kind, name: name.trim(), hex: h, supplier: supplier.trim() || undefined, code: codeIn.trim() || undefined, tags: tags.length ? tags : undefined };
      await app.updateColorCard(card);
      if (cardId === card.id) onpick(card); // 지금 필드가 이 카드면 스냅샷 갱신
      cancelEdit();
      return;
    }
    const card = newColorCard({ kind, name, hex: h, supplier, code: codeIn, tags });
    await app.addColorCard(card);
    onpick(card);
    onclose();
  }
</script>

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="색 고르기" data-testid="color-dialog">
    <header><h2>색 고르기 <small>· {label}</small></h2><button class="icon" data-testid="color-close" title="닫기" onclick={onclose}>✕</button></header>
    <div class="body">
      <!-- 기본색: 이전에 필드 안에 있던 견본 줄 -->
      <section>
        <h3>기본색</h3>
        <div class="swatches">
          <button type="button" class="sw none" class:on={sys === NONE} data-testid="{tp}{prefix}-none" title="도색 없음" onclick={() => { onclear(); onclose(); }}>✕</button>
          {#each NAMED_COLORS as c (c.label)}
            <button type="button" class="sw" class:on={sys === BASIC && code === c.label} class:extra={!c.basic} data-testid="{tp}{prefix}-swatch-{c.label}" title={c.label} style:background={c.hex} onclick={() => { onpickNamed(c.label); onclose(); }}></button>
          {/each}
          <label class="sw pick" class:on={sys === DIRECT} title="직접 고르기 (컬러 피커)">
            🎨<input type="color" data-testid="{tp}{prefix}-picker" value={curHex} oninput={(e) => onpickHex(e.currentTarget.value)} />
          </label>
        </div>
        <small class="hint">진한 색 11개가 기본, 나머지는 보조. 🎨 는 브라우저 컬러 피커(고르면 바로 반영)</small>
      </section>

      <!-- 라이브러리 -->
      <section>
        <h3>라이브러리 <span class="cnt">{list.length}개</span></h3>
        <div class="filters">
          <input class="search" data-testid="color-search" placeholder="이름·태그·공급사·코드로 찾기" bind:value={search} />
          <button class="chip" class:on={filter === ''} onclick={() => (filter = '')}>전체</button>
          {#each COLOR_KINDS as k (k)}<button class="chip" class:on={filter === k} data-testid="color-filter-{k}" onclick={() => (filter = k)}>{k}</button>{/each}
        </div>
        {#if !list.length}
          <p class="empty">{app.colorLibrary.length ? '찾는 색이 없습니다.' : '저장된 색이 없습니다. 아래에서 첫 색을 만들어 보세요.'}</p>
        {/if}
        <ul class="cards" data-testid="color-cards">
          {#each list as c (c.id)}
            <li class:on={c.id === cardId}>
              <button class="card" data-testid="{tp}{prefix}-lib-{c.id}" data-name={c.name} title="이 색 적용" onclick={() => { onpick(c); onclose(); }}>
                <i style:background={c.hex}></i>
                <span class="nm">{c.name}</span>
                <small>{cardRef(c)} · {c.hex}{#if c.tags?.length} · {c.tags.map((t) => `#${t}`).join(' ')}{/if}</small>
              </button>
              <!-- ⋯ 메뉴: 수정 / 삭제 (x 마크 대신, 2026-10-18) -->
              <button class="icon more" data-testid="color-menu-{c.id}" title="수정·삭제" onclick={() => (menuFor = menuFor === c.id ? null : c.id)}>⋯</button>
              {#if menuFor === c.id}
                <div class="menu" data-testid="color-menu">
                  <button data-testid="color-edit-{c.id}" onclick={() => startEdit(c)}>수정</button>
                  <button class="danger" data-testid="color-delete-{c.id}" onclick={() => { menuFor = null; if (confirm(`"${c.name}" 색을 라이브러리에서 지울까요? (이미 쓴 사인물의 색은 그대로)`)) app.removeColorCard(c.id); }}>삭제</button>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      </section>

      <!-- 새 색 만들기 / 수정 -->
      <section class="form" data-testid="color-form" data-editing={editing ? editing.id : undefined}>
        <h3>{editing ? `색 수정 · ${editing.name}` : '새 색 만들기'}</h3>
        <!-- 태그: 입력창이자 검색창. 글자가 들어가는 대로 아래에 기존 태그 목록, 비어 있으면 모든 기존 태그 -->
        <label class="tags">태그
          <div class="tagbox">
            {#each tags as t (t)}<span class="tag" data-testid="color-tag-{t}">#{t}<button type="button" title="빼기" onclick={() => (tags = tags.filter((x) => x !== t))}>✕</button></span>{/each}
            <input data-testid="color-tags" placeholder={tags.length ? '' : '예: 카페, 메탈, 2026봄'} maxlength="20" bind:value={tagText}
              onfocus={() => (tagFocus = true)} onblur={() => setTimeout(() => (tagFocus = false), 150)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagText); } else if (e.key === 'Backspace' && !tagText && tags.length) tags = tags.slice(0, -1); }} />
          </div>
          {#if (tagFocus || tagText) && (suggestions.length || tagText.trim())}
            <div class="suggest" data-testid="color-tag-suggest">
              {#each suggestions as t (t)}<button type="button" data-testid="color-tag-suggest-{t}" onmousedown={(e) => e.preventDefault()} onclick={() => addTag(t)}>#{t}</button>{/each}
              {#if tagText.trim() && !existingTags.includes(tagText.trim())}<button type="button" class="new" data-testid="color-tag-new" onmousedown={(e) => e.preventDefault()} onclick={() => addTag(tagText)}>+ "{tagText.trim()}" 새 태그</button>{/if}
            </div>
          {/if}
        </label>
        <div class="grid">
          <label>종류
            <select data-testid="color-kind" bind:value={kind}>{#each COLOR_KINDS as k (k)}<option value={k}>{k}</option>{/each}</select>
          </label>
          <label>색 이름<input data-testid="color-name" placeholder="예: 버건디" maxlength="40" bind:value={name} /></label>
          <label>색
            <span class="hexrow">
              <!-- 색 상자 ■: 누르면 컬러 피커 -->
              <span class="box" style:background={fixHex(hex) ?? '#888888'}><input type="color" data-testid="color-hex" value={fixHex(hex) ?? '#888888'} oninput={(e) => (hex = e.currentTarget.value)} /></span>
              <input class="hextext" data-testid="color-hex-text" bind:value={hex} placeholder="#rrggbb" maxlength="7" />
            </span>
          </label>
          <label>공급사<input data-testid="color-supplier" placeholder="예: 3M, 삼화페인트" maxlength="60" bind:value={supplier} /></label>
          <label>공급사 코드<input data-testid="color-code" placeholder="예: 1080-G13" maxlength="60" bind:value={codeIn} /></label>
        </div>
        {#if error}<p class="err" data-testid="color-error">{error}</p>{/if}
        <div class="actions">
          <button class="btn primary" data-testid="color-save" onclick={save}>{editing ? '저장' : '저장하고 적용'}</button>
          {#if editing}<button class="btn" data-testid="color-edit-cancel" onclick={cancelEdit}>취소</button>{/if}
        </div>
        <small class="hint">라이브러리는 내 계정에 저장되어 모든 프로젝트에서 쓸 수 있습니다{app.account ? '' : ' (로그인하면 기기 간에도 같이)'}.</small>
      </section>
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 80; }
  .dialog { width: min(640px, calc(100vw - 24px)); max-height: calc(100vh - 24px); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px 16px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 15px; } h2 small { color: var(--muted); font-weight: 400; font-size: 12px; }
  h3 { margin: 0 0 6px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
  .cnt { color: var(--muted); font-size: 11px; font-weight: 400; }
  .body { display: flex; flex-direction: column; gap: 14px; overflow: auto; min-height: 0; padding-right: 4px; }
  .hint { color: var(--muted); font-size: 11px; display: block; margin-top: 4px; }
  .swatches { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .sw { width: 26px; height: 26px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25); cursor: pointer; padding: 0; }
  .sw.extra { width: 20px; height: 20px; }
  .sw.on { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(255, 204, 0, 0.35); }
  .sw.none { background: var(--input); color: var(--muted); font-size: 11px; display: grid; place-items: center; }
  .sw.pick { background: var(--input); display: grid; place-items: center; font-size: 13px; position: relative; overflow: hidden; }
  .sw.pick input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .filters { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .search { flex: 1 1 160px; min-width: 120px; font: inherit; font-size: 12px; }
  .chip { padding: 3px 9px; border-radius: 999px; border: 1px solid var(--line); background: var(--input, rgba(255,255,255,0.04)); color: var(--text); font-size: 11px; cursor: pointer; }
  .chip.on { border-color: var(--accent); color: var(--accent); }
  .empty { color: var(--muted); font-size: 12px; margin: 6px 0; }
  .cards { list-style: none; margin: 6px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 6px; }
  .cards li { position: relative; border: 1px solid var(--line); border-radius: 10px; background: rgba(255,255,255,0.03); }
  .cards li.on { border-color: var(--accent); }
  .card { width: 100%; display: grid; grid-template-columns: 26px 1fr; grid-template-rows: auto auto; column-gap: 8px; align-items: center; text-align: left; padding: 8px 28px 8px 8px; background: none; border: 0; color: var(--text); cursor: pointer; font: inherit; }
  .card i { grid-row: 1 / 3; width: 26px; height: 26px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.35); }
  .card .nm { font-size: 12px; font-weight: 600; }
  .card small { color: var(--muted); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .more { position: absolute; right: 2px; top: 2px; width: 22px; height: 22px; font-size: 13px; }
  .menu { position: absolute; right: 4px; top: 26px; z-index: 2; display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .menu button { background: none; border: 0; color: var(--text); font: inherit; font-size: 12px; padding: 6px 14px; text-align: left; cursor: pointer; }
  .menu button:hover { background: rgba(255,255,255,0.06); }
  .menu button.danger { color: #ff8a80; }
  .form { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 1px dashed var(--line); }
  .form label { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); white-space: nowrap; } /* 라벨 왼쪽·입력 오른쪽 (2026-10-18) */
  .form label > input:not([type='color']), .form label > select, .form label > .hexrow, .form label > .tagbox { flex: 1; min-width: 0; }
  .form input, .form select { font: inherit; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
  .tags { position: relative; flex-wrap: wrap; }
  .tags .suggest { flex-basis: 100%; }
  .tagbox { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; padding: 4px 6px; border: 1px solid var(--line); border-radius: 8px; background: var(--input, rgba(255,255,255,0.04)); }
  .tagbox input { flex: 1 1 80px; min-width: 60px; background: none; border: 0; outline: none; color: var(--text); }
  .tag { display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 999px; background: rgba(255,204,0,0.15); color: var(--accent); font-size: 11px; }
  .tag button { background: none; border: 0; color: inherit; cursor: pointer; font-size: 10px; padding: 0; }
  .suggest { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; padding: 6px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
  .suggest button { background: rgba(255,255,255,0.05); border: 1px solid var(--line); border-radius: 999px; color: var(--text); font: inherit; font-size: 11px; padding: 2px 8px; cursor: pointer; }
  .suggest button.new { color: var(--accent); border-style: dashed; }
  .hexrow { display: flex; gap: 6px; align-items: center; }
  .box { width: 32px; height: 28px; border: 1px solid var(--line); border-radius: 6px; position: relative; overflow: hidden; cursor: pointer; display: inline-block; }
  .box input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
  .hextext { flex: 1; min-width: 0; width: 90px; }
  .actions { display: flex; gap: 6px; }
  .err { color: #ff8a80; font-size: 12px; margin: 0; }
  @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
</style>
