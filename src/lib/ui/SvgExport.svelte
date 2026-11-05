<!-- 전개도 SVG 내려받기 — 디자인 탭 막대 (2026-11-05 "견적탭에 svg,pdf가 있을 이유가 있나?" → "진행해줘": 견적 탭에서 옮김, 금액·합계 없음).
     일러스트 사용자는 [일러스트 대지 받기](스크립트)가 낫고, 이 SVG 는 코렐드로우·커팅·출력 프로그램처럼 스크립트를 못 쓰는 곳용. 대지 레이어는 그대로 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { buildListSvg } from '../listSvgExport';
  import { outlineRenderer } from '../core/svgText';
  import { loadFont } from '../core/textShapes';
  import fontUrl from 'pretendard/dist/public/static/Pretendard-Bold.otf?url';
  import type { SvgSheet } from '../core/listSvg';

  let open = $state(false);
  let scale = $state<'a4' | '1' | '0.1'>('1');
  let outline = $state(true);
  let busy = $state(false);
  const exportable = $derived(app.flatCards.some((c) => !c.placeholder));
  async function download() {
    if (busy) return;
    busy = true;
    try {
      const opts: Partial<SvgSheet> = { artboards: true }; // 대지 레이어 (일러스트레이터에서 대지로 변환, 2026-10-18)
      if (scale !== 'a4') opts.scale = Number(scale);
      if (outline) opts.text = outlineRenderer(await loadFont(fontUrl));
      const svg = await buildListSvg(opts, { amounts: false });
      app.lastSvg = svg;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      a.download = `${app.access.status === 'ok' ? app.access.projectName : '간판다'} 전개도${scale === 'a4' ? '' : scale === '1' ? ' 1-1' : ' 1-10'}.svg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      open = false;
    } catch (e) { app.notice = `SVG 를 만들지 못했습니다: ${e instanceof Error ? e.message : e}`; }
    finally { busy = false; }
  }
</script>

<span class="wrap">
  <button data-testid="export-svg" title="전개도 SVG — 코렐드로우·커팅·출력 프로그램용 (비율·윤곽선 옵션, 금액 없음)" disabled={!exportable} onclick={() => (open = !open)}>SVG</button>
  {#if open}
    <div class="opts" data-testid="svg-options">
      <b>SVG 내려받기 <small>(코렐·커팅·일러스트)</small></b>
      <div class="choices" role="radiogroup" aria-label="비율">
        <span class="lbl">비율</span>
        <label title="제작 도면, mm 그대로"><input type="radio" name="svgscale" value="1" bind:group={scale} data-testid="svg-scale-1" /> 실물 1:1</label>
        <label title="큰 간판 · 아트보드 한계 5.8m"><input type="radio" name="svgscale" value="0.1" bind:group={scale} data-testid="svg-scale-10" /> 1:10</label>
        <label title="A4 한 장"><input type="radio" name="svgscale" value="a4" bind:group={scale} data-testid="svg-scale-a4" /> A4 맞춤</label>
        <label title="폰트 없어도 같은 모양, 글자 편집 불가"><input type="checkbox" bind:checked={outline} data-testid="svg-outline" /> 글자 윤곽선</label>
      </div>
      <small class="tip" data-testid="svg-artboards-tip">일러스트레이터라면 [일러스트 대지 받기]가 대지를 바로 만들고 간판다로 돌아오는 길도 있습니다. 이 SVG 에도 사인물마다 같은 자리에 "대지" 레이어의 사각형이 있어, 레이어 <b>대지</b>를 선택 → <b>오브젝트 › 대지 › 선택 오브젝트를 대지로 변환</b> 하면 사인물마다 대지가 됩니다.</small>
      <button class="primary" data-testid="svg-download" disabled={busy} onclick={download}>{busy ? '만드는 중…' : '내려받기'}</button>
    </div>
  {/if}
</span>

<style>
  .wrap { position: relative; display: inline-flex; }
  .opts { position: absolute; left: 0; top: 100%; margin-top: 4px; z-index: 20; width: min(360px, calc(100vw - 24px)); background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); }
  .opts label { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .opts .choices { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
  .opts .choices .lbl { color: var(--muted); }
  .opts small { color: var(--muted); }
  .opts .tip { display: block; line-height: 1.4; padding: 6px 8px; border-radius: 6px; background: rgba(255, 255, 255, 0.04); }
  .opts .tip b { color: var(--text); }
  .opts .primary { align-self: flex-end; margin-top: 4px; }
  @media (max-width: 720px) { .opts { position: fixed; left: 12px; right: 12px; top: auto; width: auto; } }
</style>
