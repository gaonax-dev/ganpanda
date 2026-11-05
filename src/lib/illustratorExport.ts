// 일러스트레이터 스크립트 내려받기 (2026-11-05 "가장 나이스한건 일러스트 플러그인을 개발하고 우리 포맷을 일러스트에서 재구성하는 거야" → 디자인 탭 [일러스트], "견적탭에서 디자인으로 이동해줘").
// 카드 배치(mm)·카드 사진·입힌 디자인(SVG 원본은 벡터, 그 밖은 잘라낸 그림)을 스크립트 앞에 담는다. 일러스트에서 실행하면 사인물마다 대지 → docs/features/illustrator.md
import { app } from './state.svelte';
import { assetUrl } from './assets';
import { faceUrl } from './photoDisplay';
import { imageDataUrl } from './core/imageData';
import { illustratorPackage, jsxWithData, type IllustratorCardIn } from './core/illustrator';
import { zipStore } from './core/zip';
import illustratorJsx from './illustrator/ganpanda.jsx?raw';
import { partLabel, partsOf } from './core/parts';
import { componentOf } from './core/components';

const toDataUrl = async (u: string): Promise<string | undefined> => { try { return await imageDataUrl(await (await fetch(u)).blob()); } catch { return undefined; } };
async function cropPng(u: string, crop: { x: number; y: number; w: number; h: number }): Promise<string | undefined> {
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = u; });
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(crop.w)); c.height = Math.max(1, Math.round(crop.h));
    c.getContext('2d')!.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } catch { return undefined; }
}

/** data URL → 바이트 */
function dataBytes(u: string): Uint8Array | null {
  const m = /^data:[^;,]+(;base64)?,(.*)$/.exec(u);
  if (!m) return null;
  return m[1] ? Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(m[2]));
}
const safe = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * 치수 있는 카드(임시 크기 제외)로 일러스트 묶음 zip 을 내려받는다: ganpanda.jsx + images/(카드 사진 JPG·디자인 PNG·SVG). 카드가 없으면 false.
 * 그림은 스크립트 안에 넣지 않고 파일로 — 일러스트가 연결만 한다 (2026-11-05 "5분정도 걸린다. 차라리 이미지들을 따로 폴더에 넣고 연결하는게 좋을 거 같은데").
 * zip 안 이름은 영문만(윈도우 기본 압축 풀기에서 한글 이름이 깨지지 않게), 풀면 zip 이름(프로젝트명) 폴더가 된다
 */
export async function exportIllustrator(): Promise<boolean> {
  const cards: IllustratorCardIn[] = [];
  const files: { name: string; data: Uint8Array }[] = [];
  const addFile = (name: string, data: Uint8Array | null) => { if (!data) return undefined; files.push({ name, data }); return name; };
  for (const { o, w, h, placeholder } of app.flatCards) {
    if (placeholder) continue;
    const p = app.flatPlaced.get(o.id);
    if (!p) continue;
    // 구성 요소 하위 레이어 (2026-11-05): 밀어내는 종류(채널·스카시) = 입체(SVG 로 돌아와 밀어냄), 내용을 받는 평면 종류(시트) = 인쇄. 내용을 안 받는 종류(조명·몰딩·지주 등)는 빠짐
    const parts: NonNullable<IllustratorCardIn['parts']> = partsOf(o).flatMap((pt): NonNullable<IllustratorCardIn['parts']> => componentOf(pt.kind).extrude ? [{ id: pt.id, label: `${partLabel(pt)} (입체)`, mode: 'vector' }] : componentOf(pt.kind).takesItems ? [{ id: pt.id, label: `${partLabel(pt)} (인쇄)`, mode: 'print' }] : []);
    const card: IllustratorCardIn = { id: o.id, name: o.name, x: p.x, y: p.y, w, h, ...(parts.length ? { parts } : {}) };
    const id = safe(o.id);
    const ph = app.photos.find((x) => x.id === o.photoId);
    if (ph && o.quad.length === 4) {
      const f = await faceUrl(ph.assetId, ph.w, o.quad, w, h, 640);
      const d = f ? (f.startsWith('data:') ? f : await toDataUrl(f)) : undefined;
      card.face = d ? addFile(`images/${id}-face.jpg`, dataBytes(d)) : undefined;
    }
    if (o.design) {
      const src = app.sources.find((s) => s.id === o.design!.sourceId), page = src?.pages[o.design.page];
      if (src && page) {
        const cr = o.design.crop;
        if (src.kind === 'svg') {
          const u = await assetUrl(src.fileAssetId);
          const svg = u ? await (await fetch(u)).text().catch(() => undefined) : undefined;
          const svgFile = svg ? addFile(`images/${id}-design.svg`, new TextEncoder().encode(svg)) : undefined;
          if (svgFile) card.design = { svgFile, crop: { x: cr.x / page.w, y: cr.y / page.h, w: cr.w / page.w, h: cr.h / page.h } };
        }
        if (!card.design) { const u = await assetUrl(page.assetId); const png = u ? await cropPng(u, cr) : undefined; const f = png ? addFile(`images/${id}-design.png`, dataBytes(png)) : undefined; if (f) card.design = { png: f }; }
      }
    }
    cards.push(card);
  }
  if (!cards.length) return false;
  const project = app.access.status === 'ok' ? app.access.projectName : '간판다';
  const jsx = jsxWithData(illustratorJsx, illustratorPackage({ project, cards }));
  app.lastIllustrator = jsx;
  const zip = zipStore([{ name: 'ganpanda.jsx', data: new TextEncoder().encode(jsx) }, ...files]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
  a.download = `${project} 일러스트 대지.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return true;
}
