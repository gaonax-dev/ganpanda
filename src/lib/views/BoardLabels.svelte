<!-- 사진 위 정보 글자 — 보드(확대되는 층) 밖, 화면 층에 그린다 (2026-11-04 사용자: "맥 앱에서 줌인을 많이 들어가면 컨트롤로와 글자 해상도가 깨진다").
     실제 맥 앱(Tauri WKWebView)에서 재현: 사진이 여럿인 보드를 확대하면 확대되는 층 전체를 맥 WebKit 이 낮은 해상도로 그려 작은 글자가 뭉개졌다
     (SVG 글자든 HTML 글자든 같았다 — 화면 층의 도구 막대 글자는 선명). 그래서 글자는 화면 좌표(보드 변환을 직접 계산)로 화면 층에 둔다.
     사인물 이름·치수(외곽선 왼쪽 위 꼭짓점 바로 위), 존 이름(첫 꼭짓점 위), 블록 치수(가운데). 화면 밖은 그리지 않는다 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { zonesOf } from '../core/zone';
  import type { Pt } from '../core/homography';

  let { viewport, screenW, screenH }: { viewport: { x: number; y: number; zoom: number }; screenW: number; screenH: number } = $props();
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  const M = 300; // 화면 밖 여유 (px)
  type Label = { hide?: boolean; key: string; kind: 'sign' | 'zone' | 'block'; x: number; y: number; id?: string; index?: number; o?: (typeof app.objects)[number]; text?: string; need?: boolean; fit?: boolean };
  const labels = $derived.by((): Label[] => {
    if (app.stage === '3d') return []; // 3D 합성 위에는 정보 글자 없음 (전과 같게)
    const out: Label[] = [];
    const z = viewport.zoom;
    for (const p of app.photos) {
      const hide = p.width * z < 260; // 사진이 아주 작으면 숨김 (전의 tiny 와 같게 — 글자는 남기고 보이지만 않게)
      const s = p.width / p.w;
      const at = (q: Pt) => ({ x: (p.x + q[0] * s) * z + viewport.x, y: (p.y + q[1] * s) * z + viewport.y });
      const inView = (a: { x: number; y: number }) => a.x > -M && a.x < screenW + M && a.y > -M && a.y < screenH + M;
      const hideInfo = !!app.photoHide[p.id]?.info;
      zonesOf(p).forEach((zone, zi, all) => { const a = at(zone[0]); if (inView(a) || hide) out.push({ hide, key: `z${p.id}${zi}`, kind: 'zone', ...a, text: `작업 존${all.length > 1 ? ` ${zi + 1}` : ''}` }); });
      for (const o of app.objects) {
        if (o.photoId !== p.id || !o.quad.length) continue;
        const sel = app.selectionKind !== 'card' && o.id === app.selectedId, multi = !sel && app.photoHighlightIds.includes(o.id);
        if (hideInfo && !sel && !multi) continue;
        const a = at(o.quad[0]);
        if (inView(a) || hide) out.push({ hide, key: `s${o.id}`, kind: 'sign', ...a, id: o.id, o });
      }
      (app.photoBlocks.get(p.id) ?? []).forEach((b, i) => {
        const bsel = app.selectedBlock?.photoId === p.id && app.selectedBlock.i === i;
        if (hideInfo && !bsel) return;
        const c = b.q.reduce((acc, q) => [acc[0] + q[0] / 4, acc[1] + q[1] / 4] as Pt, [0, 0] as Pt);
        const a = at(c);
        if (inView(a) || hide) out.push({ hide, key: `b${p.id}${i}`, kind: 'block', ...a, index: i, need: !b.w && !b.h, fit: app.blockFitOf(p.id, i),
          text: b.w && b.h ? `${fmt(b.w)}×${fmt(b.h)}` : b.w ? `가로 ${fmt(b.w)}` : b.h ? `세로 ${fmt(b.h)}` : '치수 입력' });
      });
    }
    return out;
  });
</script>

<div class="labels" aria-hidden="true">
  {#each labels as l (l.key)}
    {#if l.kind === 'sign' && l.o}
      {@const o = l.o}
      {@const m = app.measures.get(o.id)}
      {@const warn = app.warnMeasure && (m?.warnings.length ?? 0) > 0}
      <span class="hl sl" class:hide={l.hide} data-testid="sign-label" data-id={o.id} style:left="{l.x}px" style:top="{l.y}px">{#if warn}<b data-testid="sign-warning-icon" class="w">⚠ </b>{/if}{#if app.unread[o.sameAs ?? o.id]}<b data-testid="sign-unread" class="u">💬 {app.unread[o.sameAs ?? o.id]} </b>{/if}{#if o.sameAs}<b data-testid="sign-linked" class="l">⇄ </b>{/if}{o.name}{#if o.widthMm && o.heightMm} · {fmt(o.widthMm)}×{fmt(o.heightMm)}{:else if m?.estimate} · ≈{fmt(m.estimate.widthMm)}×{fmt(m.estimate.heightMm)}{/if}</span>
    {:else if l.kind === 'zone'}
      <span class="hl zl" class:hide={l.hide} data-testid="zone-label" style:left="{l.x}px" style:top="{l.y}px">{l.text}</span>
    {:else}
      <span class="hl bl" class:hide={l.hide} class:need={l.need} class:fit={l.fit} data-testid="block-size" data-index={l.index} style:left="{l.x}px" style:top="{l.y}px">{l.text}</span>
    {/if}
  {/each}
</div>

<style>
  .labels { position: absolute; inset: 0; pointer-events: none; z-index: 1; overflow: hidden; }
  .hl { position: absolute; white-space: nowrap; font-size: 12px; line-height: 1.2; font-weight: 600; color: #fff; -webkit-text-stroke: 3px rgba(0, 0, 0, 0.75); paint-order: stroke fill; transform: translateY(calc(-100% - 6px)); }
  .hl.hide { display: none; }
  .hl b { font-weight: inherit; }
  .hl .w { color: var(--warn); } .hl .u { color: var(--accent); } .hl .l { color: var(--blue); }
  .hl.zl { color: #7ef0a0; transform: translateY(calc(-100% - 8px)); }
  .hl.bl { color: #39ff14; transform: translate(-50%, -50%); }
  .hl.bl.need { color: #ef4444; } .hl.bl.fit { color: #a855f7; }
</style>
