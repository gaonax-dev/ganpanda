// PDF 레이어별 벡터 (2026-11-07 사용자: "pdf를 직접 편집가능하다면 굿이 path를 따로 둘 이유가 없고 연결된 pdf를 통해 path를 추출해 바로 연결 후 3d로 구현할 수 있겠는데"
// → 입체 고르기는 "레이어로"). 일러스트가 Acrobat 레이어(OC)로 저장한 PDF 의 그리기 명령(pdf.js getOperatorList)을 따라가며 레이어별로 **채운 경로**만 모은다.
// 좌표 = 페이지(대지) 왼쪽 위 원점, 아래 +, pt. 3D 는 layerSvg 를 벡터 그림(svgShapes)으로 밀어낸다 → docs/features/design-sync.md

/** pdf.js 6.x OPS 코드 (pdfjs-dist build/pdf.mjs) — core 에서 pdf.js 를 부르지 않으려고 값만 둔다 */
export const PDF_OPS = {
  save: 10, restore: 11, transform: 12, stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28,
  showText: 44, showSpacedText: 45, nextLineShowText: 46, nextLineSetSpacingShowText: 47,
  beginMarkedContent: 69, beginMarkedContentProps: 70, endMarkedContent: 71, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75,
  paintImageMaskXObject: 83, paintImageMaskXObjectGroup: 84, paintImageXObject: 85, paintInlineImageXObject: 86, paintInlineImageXObjectGroup: 87, paintImageXObjectRepeat: 88, paintImageMaskXObjectRepeat: 89, paintSolidColorImageMask: 90,
  constructPath: 91,
} as const;
/** pdf.js DrawOPS (경로 데이터 안의 명령) */
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 };

const O = PDF_OPS;
const FILLS = new Set<number>([O.fill, O.eoFill, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke]);
const EVENODD = new Set<number>([O.eoFill, O.eoFillStroke, O.closeEOFillStroke]);
const PAINTS = new Set<number>([O.stroke, O.closeStroke, ...FILLS]);
const TEXTS = new Set<number>([O.showText, O.showSpacedText, O.nextLineShowText, O.nextLineSetSpacingShowText]);
const IMAGES = new Set<number>([O.paintImageMaskXObject, O.paintImageMaskXObjectGroup, O.paintImageXObject, O.paintInlineImageXObject, O.paintInlineImageXObjectGroup, O.paintImageXObjectRepeat, O.paintImageMaskXObjectRepeat, O.paintSolidColorImageMask]);

export interface LayerVectors {
  name: string;
  /** 채운 경로 (페이지 좌표, 위 → 아래, pt) */
  paths: { d: string; evenOdd: boolean }[];
  /** 그린 것 수(채움·선·그림·글자) — 0 이면 빈 레이어 */
  marks: number;
  /** 윤곽선이 아닌 글자 수 — 입체가 안 되므로 "윤곽선 만들기" 안내 */
  texts: number;
}

type M = [number, number, number, number, number, number];
const mul = (t: M, m: M): M => [t[0] * m[0] + t[2] * m[1], t[1] * m[0] + t[3] * m[1], t[0] * m[2] + t[2] * m[3], t[1] * m[2] + t[3] * m[3], t[0] * m[4] + t[2] * m[5] + t[4], t[1] * m[4] + t[3] * m[5] + t[5]];
const n = (v: number) => String(Math.round(v * 1000) / 1000);

/**
 * fnArray·argsArray = pdf.js operatorList. ocName(OC 속성) → 레이어 이름(없으면 null). view = page.view [x0, y0, x1, y1].
 * 레이어 이름별 결과 — 레이어 밖 내용은 '' 로
 */
export function pdfLayerVectors(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, ocName: (props: unknown) => string | null, view: [number, number, number, number]): Map<string, LayerVectors> {
  const out = new Map<string, LayerVectors>();
  const layer = (name: string) => { let l = out.get(name); if (!l) out.set(name, (l = { name, paths: [], marks: 0, texts: 0 })); return l; };
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const marked: (string | null)[] = [];
  const current = () => { for (let i = marked.length - 1; i >= 0; i--) if (marked[i] !== null) return marked[i]!; return ''; };
  const [x0, , , y1] = view;
  const pt = (x: number, y: number) => { const X = ctm[0] * x + ctm[2] * y + ctm[4], Y = ctm[1] * x + ctm[3] * y + ctm[5]; return `${n(X - x0)},${n(y1 - Y)}`; };
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], a = (argsArray[i] ?? []) as unknown[];
    switch (fn) {
      case O.save: stack.push(ctm); break;
      case O.restore: ctm = stack.pop() ?? ctm; break;
      case O.transform: ctm = mul(ctm, a as unknown as M); break;
      case O.paintFormXObjectBegin: stack.push(ctm); if (Array.isArray(a[0]) || ArrayBuffer.isView(a[0])) ctm = mul(ctm, Array.from(a[0] as ArrayLike<number>) as M); break;
      case O.paintFormXObjectEnd: ctm = stack.pop() ?? ctm; break;
      case O.beginMarkedContent: marked.push(null); break;
      // OC 속성 = pdf.js 6 은 {type: 'OCG', id: '5R'} — id 로
      case O.beginMarkedContentProps: { const p = a[1] as { id?: unknown } | string | null; marked.push(a[0] === 'OC' ? ocName(p && typeof p === 'object' && 'id' in p ? p.id : p) ?? null : null); break; }
      case O.endMarkedContent: marked.pop(); break;
      case O.constructPath: {
        const op = a[0] as number;
        if (!PAINTS.has(op)) break; // 클립·끝(endPath)
        const L = layer(current());
        L.marks++;
        if (!FILLS.has(op)) break;
        const data = (a[1] as ArrayLike<ArrayLike<number>> | undefined)?.[0];
        if (!data) break;
        let d = '';
        for (let k = 0; k < data.length; ) {
          const c = data[k++];
          if (c === DRAW.moveTo) { d += 'M' + pt(data[k], data[k + 1]); k += 2; }
          else if (c === DRAW.lineTo) { d += 'L' + pt(data[k], data[k + 1]); k += 2; }
          else if (c === DRAW.curveTo) { d += 'C' + pt(data[k], data[k + 1]) + ' ' + pt(data[k + 2], data[k + 3]) + ' ' + pt(data[k + 4], data[k + 5]); k += 6; }
          else if (c === DRAW.quadraticCurveTo) { d += 'Q' + pt(data[k], data[k + 1]) + ' ' + pt(data[k + 2], data[k + 3]); k += 4; }
          else if (c === DRAW.closePath) d += 'Z';
          else break; // 모르는 명령
        }
        if (d) L.paths.push({ d, evenOdd: EVENODD.has(op) });
        break;
      }
      default:
        if (TEXTS.has(fn)) { const L = layer(current()); L.texts++; L.marks++; }
        else if (IMAGES.has(fn)) layer(current()).marks++;
    }
  }
  return out;
}

/** 레이어 벡터 → SVG (viewBox = 페이지 pt) — 3D 벡터 그림(core/vectorShapes svgShapes)이 읽는다 */
export function layerSvg(paths: { d: string; evenOdd: boolean }[], w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(w)} ${n(h)}" width="${n(w)}" height="${n(h)}">`
    + paths.map((p) => `<path d="${p.d}" fill="#000"${p.evenOdd ? ' fill-rule="evenodd"' : ''}/>`).join('')
    + '</svg>';
}
