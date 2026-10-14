// 폰트 글리프 윤곽 → THREE.Shape (구멍 포함). 채널 간판 입체 글자의 원본 형상.
import * as THREE from 'three';
import { parse, type Font } from 'opentype.js';

export async function loadFont(url: string): Promise<Font> {
  const buf = await (await fetch(url)).arrayBuffer();
  return parse(buf);
}

export function fontFromBuffer(buf: ArrayBuffer): Font {
  return parse(buf);
}

interface Contour {
  path: THREE.Path;
  pts: THREE.Vector2[];
  area: number;
}

function signedArea(pts: THREE.Vector2[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x - pts[i].x) * (pts[j].y + pts[i].y);
  return a / 2;
}

function pointInPolygon(p: THREE.Vector2, poly: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 텍스트 → Shape 배열. 단위는 폰트 단위(size=1000), y 위쪽. */
export function textToShapes(font: Font, text: string, letterSpacing = 0): THREE.Shape[] {
  const size = 1000;
  const contours: Contour[] = [];
  let cur: THREE.Path | null = null;
  const flush = () => {
    if (!cur) return;
    const pts = cur.getPoints(6);
    if (pts.length > 2) contours.push({ path: cur, pts, area: Math.abs(signedArea(pts)) });
    cur = null;
  };
  let x = 0;
  // 폰트에 없는 글자(.notdef, 인덱스 0)는 네모 상자 대신 건너뛴다 — 윤곽이 하나도 없으면 호출자가 상자로 대신한다
  const glyphs = font.stringToGlyphs(text).filter((g) => g.index !== 0 && g.name !== '.notdef');
  const scale = size / font.unitsPerEm;
  for (const g of glyphs) {
    for (const c of g.getPath(x, 0, size).commands) {
      // opentype 은 y 아래 방향 → 뒤집기
      switch (c.type) {
        case 'M': flush(); cur = new THREE.Path(); cur.moveTo(c.x, -c.y); break;
        case 'L': cur?.lineTo(c.x, -c.y); break;
        case 'Q': cur?.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y); break;
        case 'C': cur?.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y); break;
        case 'Z': flush(); break;
      }
    }
    flush();
    x += (g.advanceWidth ?? 0) * scale + letterSpacing * size;
  }

  // 포함 깊이로 바깥/구멍 판정 (TrueType·CFF 의 방향 규칙 차이에 무관)
  const depth = contours.map((c, i) =>
    contours.filter((o, j) => j !== i && o.area > c.area && pointInPolygon(c.pts[0], o.pts)).length,
  );
  const shapes = new Map<number, THREE.Shape>();
  contours.forEach((c, i) => {
    if (depth[i] % 2 === 0) {
      const s = new THREE.Shape(c.pts);
      shapes.set(i, s);
    }
  });
  contours.forEach((c, i) => {
    if (depth[i] % 2 === 0) return;
    // 가장 작은 상위 윤곽이 부모
    let parent = -1;
    contours.forEach((o, j) => {
      if (depth[j] === depth[i] - 1 && o.area > c.area && pointInPolygon(c.pts[0], o.pts)
        && (parent < 0 || o.area < contours[parent].area)) parent = j;
    });
    if (parent >= 0) shapes.get(parent)!.holes.push(new THREE.Path(c.pts));
  });
  return [...shapes.values()];
}

/** Shape 들을 Canvas2D Path2D 로 (후광 글로우 텍스처 생성용) */
export function shapesToPath2D(shapes: THREE.Shape[], tx: (v: THREE.Vector2) => [number, number]): Path2D {
  const p = new Path2D();
  const add = (pts: THREE.Vector2[]) => {
    pts.forEach((v, i) => {
      const [x, y] = tx(v);
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    });
    p.closePath();
  };
  for (const s of shapes) {
    add(s.getPoints(6));
    for (const h of s.holes) add(h.getPoints(6));
  }
  return p;
}
