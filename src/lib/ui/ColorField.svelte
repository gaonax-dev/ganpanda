<!--
  컬러 피커 (2026-10-17 사용자: "후랙스 갈바 모두 컬러피커로 색상지정할 수 있게해줘 컬러가 필요한 곳에 컬러피커 간단모드와 확장모드").
  도색 객체(<prefix>System · Code · Gloss) 하나를 그린다.
  · 간단: 기본색 견본 줄(누르면 기본색 + 이름) · ✕ 도색 없음 · 🎨 직접 고르기(브라우저 컬러 피커 → 직접 + #hex)
  · 확장(▸): 색상 체계 선택(도색 없음/기본색/직접/PANTONE/RAL/KCC) · 코드(기본색은 이름 선택, 직접은 hex, 그 밖은 코드 입력) · 광택
  테스트 id 는 옛 필드 그대로: <tp><prefix>System · <tp><prefix>Code · <tp><prefix>Gloss (tp = option- / part-option-)
-->
<script lang="ts">
  import { GLOSSES, NAMED_COLORS, PAINT_SYSTEMS, paintHex, paintLabel } from '../core/materials';

  let { prefix, label, opts, ro, set, tp = 'option-' }: {
    prefix: string; label: string; opts: Record<string, string | boolean>; ro: boolean;
    set: (key: string, value: string) => void; tp?: string;
  } = $props();
  const sys = $derived((opts[`${prefix}System`] as string | undefined) ?? PAINT_SYSTEMS[0]);
  const code = $derived((opts[`${prefix}Code`] as string | undefined) ?? '');
  const hex = $derived(paintHex(opts, prefix));
  const text = $derived(paintLabel(opts, prefix));
  const [NONE, BASIC, DIRECT] = PAINT_SYSTEMS;
  let expanded = $state(false);
  const pickNamed = (name: string) => { set(`${prefix}System`, BASIC); set(`${prefix}Code`, name); };
  const pickHex = (v: string) => { set(`${prefix}System`, DIRECT); set(`${prefix}Code`, v.toLowerCase()); };
  const clear = () => { set(`${prefix}System`, NONE); set(`${prefix}Code`, ''); };
</script>

<div class="color" data-testid="{tp}{prefix}-color">
  <div class="head">
    <span class="lbl">{label}</span>
    <span class="now" data-testid="{tp}{prefix}-now">{#if hex}<i style:background={hex}></i>{/if}{text ?? '도색 없음'}</span>
    <button class="exp" type="button" data-testid="{tp}{prefix}-expand" onclick={() => (expanded = !expanded)}>{expanded ? '간단 ▴' : '확장 ▸'}</button>
  </div>
  <div class="swatches">
    <button type="button" class="sw none" class:on={sys === NONE} data-testid="{tp}{prefix}-none" title="도색 없음" disabled={ro} onclick={clear}>✕</button>
    {#each NAMED_COLORS as c (c.label)}
      <button type="button" class="sw" class:on={sys === BASIC && code === c.label} data-testid="{tp}{prefix}-swatch-{c.label}" title={c.label} style:background={c.hex} disabled={ro} onclick={() => pickNamed(c.label)}></button>
    {/each}
    <label class="sw pick" class:on={sys === DIRECT} title="직접 고르기">
      🎨<input type="color" data-testid="{tp}{prefix}-picker" value={hex ?? '#888888'} disabled={ro} oninput={(e) => pickHex(e.currentTarget.value)} />
    </label>
  </div>
  {#if expanded}
    <div class="ext">
      <label>색상 체계
        <select data-testid="{tp}{prefix}System" value={sys} disabled={ro} onchange={(e) => { set(`${prefix}System`, e.currentTarget.value); if (e.currentTarget.value === NONE) set(`${prefix}Code`, ''); }}>
          {#each PAINT_SYSTEMS as s (s)}<option value={s}>{s}</option>{/each}
        </select>
      </label>
      {#if sys === BASIC}
        <label>색<select data-testid="{tp}{prefix}Code" value={code} disabled={ro} onchange={(e) => set(`${prefix}Code`, e.currentTarget.value)}>
          {#each NAMED_COLORS as c (c.label)}<option value={c.label}>{c.label}</option>{/each}
        </select></label>
      {:else if sys === DIRECT}
        <label>색 (hex)<input data-testid="{tp}{prefix}Code" value={code} placeholder="#rrggbb" disabled={ro} oninput={(e) => set(`${prefix}Code`, e.currentTarget.value.trim().toLowerCase())} /></label>
      {:else if sys !== NONE}
        <label>컬러코드<input data-testid="{tp}{prefix}Code" value={code} placeholder={sys === 'RAL' ? '예: 9005' : sys === 'PANTONE' ? '예: 186 C' : '예: 코드'} disabled={ro} oninput={(e) => set(`${prefix}Code`, e.currentTarget.value)} /></label>
      {/if}
      {#if sys !== NONE}
        <label>광택<select data-testid="{tp}{prefix}Gloss" value={(opts[`${prefix}Gloss`] as string | undefined) ?? GLOSSES[0]} disabled={ro} onchange={(e) => set(`${prefix}Gloss`, e.currentTarget.value)}>
          {#each GLOSSES as g (g)}<option value={g}>{g}</option>{/each}
        </select></label>
      {/if}
    </div>
  {/if}
</div>

<style>
  .color { display: flex; flex-direction: column; gap: 5px; grid-column: 1 / -1; font-size: 12px; }
  .head { display: flex; align-items: center; gap: 8px; }
  .lbl { color: var(--muted); }
  .now { display: inline-flex; align-items: center; gap: 5px; color: var(--text); font-weight: 600; }
  .now i { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.4); display: inline-block; }
  .exp { margin-left: auto; background: none; border: 0; color: var(--accent); cursor: pointer; font: inherit; font-size: 11px; padding: 2px 4px; }
  .swatches { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .sw { width: 22px; height: 22px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25); cursor: pointer; padding: 0; }
  .sw.on { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(255, 204, 0, 0.35); }
  .sw.none { background: var(--input); color: var(--muted); font-size: 11px; display: grid; place-items: center; }
  .sw.pick { background: var(--input); display: grid; place-items: center; font-size: 12px; position: relative; overflow: hidden; }
  .sw.pick input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .ext { display: flex; flex-wrap: wrap; gap: 8px 12px; padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px dashed var(--line); }
  .ext label { display: flex; flex-direction: column; gap: 3px; color: var(--muted); }
  .ext input { width: 120px; }
</style>
