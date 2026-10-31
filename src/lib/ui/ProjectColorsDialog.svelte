<!--
  프로젝트 컬러 (2026-10-31 사용자: "프로젝트 컬러 메인컬러, 배경컬러, 포인트컬러 , ... 를 먼저 설정 … 시트, 필름, 원단, 페인트등의 요소를 선택하고 브랜드 코드 표시 …
  해당 컬러를 변경하면 전부 변경 · 프로젝트 컬러셋을 추가하면 복제는 기존의 컬러 구성과 연결을 받아서. 컬러셋 프로젝트 뷰어 디자인에 컬러셋 누르면 컬러 대화창 나오고 여기에서 컬러셋 체인지한다").
  칸마다 미리보기 색 + 재료별 브랜드 코드. 셋 칩을 누르면 그 셋으로(모든 사인물 색이 바뀜), [+ 컬러셋] = 지금 셋 복제
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { askPrompt } from './ask.svelte';
  import { activeSet, addSlot, COLOR_USES, duplicateSet, setSlot, switchSet, type ColorSlot } from '../core/projectColors';

  const pc = $derived(app.projectColors);
  const set = $derived(activeSet(pc));
  const ro = $derived(!app.canEdit);
  const patch = (slot: ColorSlot, p: Partial<Omit<ColorSlot, 'id'>>) => app.setProjectColors(setSlot(pc, set.id, slot.id, p));
  const close = () => (app.colorsOpen = false);
  async function newSet() { const n = await askPrompt('새 컬러셋 이름 (지금 셋을 복제합니다)', `${set.name} 2`); if (n) app.setProjectColors(duplicateSet(pc, set.id, n)); }
  async function newSlot() { const n = await askPrompt('새 칸 이름', '보조'); if (n) app.setProjectColors(addSlot(pc, n)); }
</script>

<div class="backdrop" role="presentation" onkeydown={(e) => { if (e.key === 'Escape') close(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="프로젝트 컬러" data-testid="colors-dialog">
    <header><h2>프로젝트 컬러</h2><button class="icon" data-testid="colors-close" onclick={close} title="닫기">✕</button></header>
    <p class="hint">사인물은 여기 칸을 함께 씁니다 — 칸 색을 바꾸면 그 칸을 쓰는 사인물이 모두 바뀝니다.</p>
    <div class="sets" data-testid="color-sets">
      {#each pc.sets as s (s.id)}
        <button class="chip" class:on={s.id === set.id} data-testid="color-set" disabled={ro} onclick={() => app.setProjectColors(switchSet(pc, s.id))}>
          <span class="dots">{#each s.slots.slice(0, 4) as sl (sl.id)}<i style:background={sl.hex || 'transparent'}></i>{/each}</span>{s.name}
        </button>
      {/each}
      {#if !ro}<button class="chip add" data-testid="color-set-add" onclick={newSet}>＋ 컬러셋</button>{/if}
    </div>
    <ul class="slots">
      {#each set.slots as sl (sl.id)}
        <li data-testid="color-slot" data-slot={sl.id}>
          <label class="sw" title="미리보기 색"><input type="color" data-testid="slot-hex" value={sl.hex || '#cccccc'} disabled={ro} onchange={(e) => patch(sl, { hex: e.currentTarget.value })} /><span style:background={sl.hex || 'transparent'} class:empty={!sl.hex}></span></label>
          <div class="body">
            <div class="row">
              <input class="name" data-testid="slot-name" value={sl.name} disabled={ro} aria-label="칸 이름" onchange={(e) => patch(sl, { name: e.currentTarget.value.trim() || sl.name })} />
              <input class="label" data-testid="slot-label" value={sl.label ?? ''} placeholder="색 이름 (예: 앰버)" disabled={ro} onchange={(e) => patch(sl, { label: e.currentTarget.value.trim() || undefined })} />
            </div>
            <div class="uses">
              {#each COLOR_USES as u (u.id)}
                <label><span>{u.label}</span><input data-testid="slot-use-{u.id}" value={sl.uses?.[u.id] ?? ''} placeholder={u.hint} disabled={ro}
                  onchange={(e) => patch(sl, { uses: { ...(sl.uses ?? {}), [u.id]: e.currentTarget.value.trim() || undefined } })} /></label>
              {/each}
            </div>
          </div>
        </li>
      {/each}
    </ul>
    {#if !ro}<button class="btn small" data-testid="color-slot-add" onclick={newSlot}>＋ 칸 추가</button>{/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 900; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
  .dialog { width: min(560px, 100%); max-height: calc(100dvh - 32px); overflow: auto; background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; box-sizing: border-box; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 16px; }
  .sets { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0; }
  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--hover); color: var(--text); }
  .chip.on { border-color: var(--accent); }
  .dots { display: inline-flex; }
  .dots i { width: 10px; height: 10px; border-radius: 50%; margin-right: -3px; border: 1px solid var(--line); }
  .slots { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .slots li { display: flex; gap: 10px; align-items: flex-start; }
  .sw { position: relative; width: 40px; height: 40px; flex: none; }
  .sw input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
  .sw span { display: block; width: 40px; height: 40px; border-radius: 8px; border: 1px solid var(--line); }
  .sw span.empty { background: repeating-linear-gradient(45deg, transparent 0 5px, var(--line) 5px 6px) !important; }
  .body { flex: 1; min-width: 0; }
  .row { display: flex; gap: 6px; }
  .name { width: 7em; font-weight: 700; }
  .label { flex: 1; min-width: 0; }
  .uses { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px 8px; margin-top: 6px; }
  .uses label { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--muted); }
  .uses input { flex: 1; min-width: 0; }
  input { background: var(--input); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; font: inherit; }
</style>
