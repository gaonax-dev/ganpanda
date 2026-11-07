// 디자인 파일 → 페이지 이미지 (3차). .ai/.pdf 는 pdf.js(PDF 호환 저장 필요), .svg/.png/.jpg 는 한 페이지.
import { sourceKind, type SourceKind } from '../core/design';

/** 변환된 페이지 (PNG) */
export interface RenderedPage {
  blob: Blob; w: number; h: number;
  /** PDF 페이지(= 일러스트 대지) 실제 크기 mm — 일러스트 왕복의 크기 짝맞춤 (2026-11-05) */ mm?: { w: number; h: number };
  /** PDF 레이어(Acrobat 레이어 = 일러스트 맨 위 레이어)별 벡터 — 입체용 (2026-11-07 "연결된 pdf를 통해 path를 추출해 바로 연결 후 3d로"). svg = 채운 경로(viewBox = 페이지 pt) */
  layers?: { name: string; paths: number; texts: number; svg: string }[];
  /** 숨긴 레이어(받은 이미지) 말고 그린 것이 없음 — 디자인으로 넣지 않는다 */
  blank?: boolean;
}

/** 디자인 그림에서 끄는 레이어 — 간판다가 보낸 참고 그림 (일러스트 스크립트의 레이어 이름) */
export const HIDDEN_LAYERS = ['받은 이미지', '간판다 사진'];

/** 긴 변 최대 px (너무 큰 아트보드는 줄여서 저장) */
export const PAGE_MAX_SIDE = 2048;

export class ConvertError extends Error {
  constructor(public code: 'not-pdf-compatible' | 'unsupported' | 'render-failed', message: string) { super(message); }
}

export async function convertFile(file: File): Promise<{ kind: SourceKind; pages: RenderedPage[]; xmp?: string }> {
  const kind = sourceKind(file.name, file.type);
  if (!kind) throw new ConvertError('unsupported', '지원하지 않는 파일입니다 (ai·pdf·svg·png·jpg).');
  if (kind === 'pdf') return { kind, ...(await renderPdf(file)) };
  return { kind, pages: [await renderImage(file)] };
}

async function renderPdf(file: File): Promise<{ pages: RenderedPage[]; xmp?: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // 일러스트레이터 "PDF 호환" 저장이면 파일 앞부분에 %PDF 가 있다
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (!head.includes('%PDF')) throw new ConvertError('not-pdf-compatible', '이 .ai 파일은 PDF 호환으로 저장되지 않았습니다. 일러스트레이터에서 "PDF 호환 파일 만들기"를 켜고 다시 저장해 주세요.');
  // legacy 빌드 (2026-11-07 맥 앱 "파일을 처리하지 못했습니다"): pdf.js 일반 빌드는 Map.getOrInsertComputed · Math.sumPrecise 등을 대체 코드 없이 쓰는데
  // 맥 시스템 WebKit(macOS 26.1)에 없다 — legacy 빌드는 대체 코드를 담는다 (tests/unit/pdfjsCompat.test.ts)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: bytes });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    throw new ConvertError('render-failed', `파일을 읽지 못했습니다: ${e instanceof Error ? e.message : e}`);
  }
  // 문서 XMP — 간판다 일러스트 스크립트가 대지 순서대로 사인물 id 를 적어 둔다(ganpanda:artboards, core/illustrator.ts)
  let xmp: string | undefined;
  try { xmp = (await doc.getMetadata()).metadata?.getRaw() ?? undefined; } catch { xmp = undefined; }
  // 레이어(OC): 받은 이미지는 끄고 그린다 (2026-11-07)
  const { pdfLayerVectors, layerSvg } = await import('../core/pdfVectors');
  let oc: Awaited<ReturnType<typeof doc.getOptionalContentConfig>> | null = null;
  const ocNames = new Map<string, string>();
  try {
    oc = await doc.getOptionalContentConfig();
    if (oc) for (const [id, g] of oc) { ocNames.set(String(id), g.name ?? ''); if (HIDDEN_LAYERS.includes(g.name ?? '')) oc.setVisibility(id, false); }
  } catch { oc = null; ocNames.clear(); } // 레이어를 못 읽으면 예전처럼 전부 그린다
  const pages: RenderedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    let layers: RenderedPage['layers'], blank: boolean | undefined;
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(4, PAGE_MAX_SIDE / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); // 투명 배경 → 흰색
    try { await page.render({ canvasContext: ctx, viewport: vp, canvas, ...(oc ? { optionalContentConfigPromise: Promise.resolve(oc) } : {}) }).promise; }
    catch (e) {
      if (!oc) throw new ConvertError('render-failed', `${i}쪽을 그리지 못했습니다: ${e instanceof Error ? e.message : e}`);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      try { await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise; } // 레이어 설정 없이 다시
      catch (e2) { throw new ConvertError('render-failed', `${i}쪽을 그리지 못했습니다: ${e2 instanceof Error ? e2.message : e2}`); }
    }
    // 그린 뒤에 — 같은 연산 목록을 다시 쓴다(큰 PDF 를 두 번 풀지 않게)
    // 레이어 벡터는 덤 — 못 꺼내도 디자인 그림은 넣는다 (2026-11-07 맥 앱 "파일을 처리하지 못했습니다")
    if (ocNames.size) try {
      const ol = await page.getOperatorList();
      const view = page.view as [number, number, number, number];
      const L = pdfLayerVectors(ol.fnArray, ol.argsArray, (id) => ocNames.get(String(id)) ?? null, view);
      const pw = view[2] - view[0], ph = view[3] - view[1];
      layers = [...L.values()].filter((l) => l.name && !HIDDEN_LAYERS.includes(l.name)).map((l) => ({ name: l.name, paths: l.paths.length, texts: l.texts, svg: layerSvg(l.paths, pw, ph) }));
      blank = ![...L.values()].some((l) => !HIDDEN_LAYERS.includes(l.name) && l.marks > 0);
    } catch (e) { layers = undefined; blank = undefined; console.warn('PDF 레이어 벡터를 꺼내지 못함', i, e); }
    pages.push({ blob: await toBlob(canvas), w: canvas.width, h: canvas.height, mm: { w: (base.width * 25.4) / 72, h: (base.height * 25.4) / 72 }, ...(layers ? { layers } : {}), ...(blank !== undefined ? { blank } : {}) });
    canvas.width = canvas.height = 0;
    page.cleanup(); // 페이지 그림·연산 메모리 비우기 (큰 PDF, 맥 앱)
  }
  await task.destroy();
  return { pages, xmp };
}

async function renderImage(file: File): Promise<RenderedPage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new ConvertError('render-failed', '이미지를 읽지 못했습니다.')); i.src = url; });
    const w = img.naturalWidth || 1000, h = img.naturalHeight || 1000;
    const scale = Math.min(1, PAGE_MAX_SIDE / Math.max(w, h));
    if (scale === 1 && file.type === 'image/png') return { blob: file, w, h };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { blob: await toBlob(canvas), w: canvas.width, h: canvas.height };
  } finally { URL.revokeObjectURL(url); }
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new ConvertError('render-failed', '이미지 저장 실패'))), 'image/png'));
