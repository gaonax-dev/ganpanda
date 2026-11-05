// 칼선 파일 (2026-11-05 roadmap 10-2, 사용자: "진행해줘") — 채널·스카시의 글자 윤곽·일러스트 벡터 패스를 실물 1:1(mm) 칼선으로
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cutItems, cutSvg, shapePathD, textCutShapes } from '../../src/lib/core/cutlines';
import type { SignObject } from '../../src/lib/core/model';
import { font } from './fixtures';

const bounds = (shapes: THREE.Shape[]) => { const p = shapes.flatMap((s) => s.getPoints(8)); return { x0: Math.min(...p.map((v) => v.x)), x1: Math.max(...p.map((v) => v.x)), y0: Math.min(...p.map((v) => v.y)), y1: Math.max(...p.map((v) => v.y)) }; };

describe('textCutShapes — 글자 윤곽을 글자 상자(mm, 가운데 원점·위 +)에 3D 와 같은 규칙으로', () => {
  it('글자 폭 = 상자 폭 96%, 가운데 맞춤, 높이는 상자 안', () => {
    const s = textCutShapes(font, '카페', { w: 1000, h: 400 });
    const b = bounds(s);
    expect(b.x1 - b.x0).toBeCloseTo(960, 0);
    expect((b.x0 + b.x1) / 2).toBeCloseTo(0, 0);
    expect(b.y1).toBeLessThanOrEqual(200 + 1); expect(b.y0).toBeGreaterThanOrEqual(-200 - 1);
    expect(s.some((x) => x.holes.length > 0)).toBe(true); // ㅔ·ㅍ 등 구멍
  });
});

describe('shapePathD · cutSvg', () => {
  it('윤곽 → 닫힌 path (구멍 포함), 좌표 변환', () => {
    const sq = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(10, 0), new THREE.Vector2(10, 10), new THREE.Vector2(0, 10)]);
    sq.holes = [new THREE.Path([new THREE.Vector2(2, 2), new THREE.Vector2(4, 2), new THREE.Vector2(4, 4)])];
    const d = shapePathD([sq], ([x, y]) => [x + 100, 50 - y]);
    expect(d.match(/M/g)!.length).toBe(2);
    expect(d.match(/Z/g)!.length).toBe(2);
    expect(d).toContain('M100,50');
  });
  it('mm 단위 SVG: CutContour 레이어(마젠타 가는 선, 채움 없음)와 이름표 레이어, 카드 배치 그대로', () => {
    const svg = cutSvg('매장', [{ id: 'a', name: '정면', x: 0, y: 0, w: 3000, h: 600, paths: ['M0,0L10,0L10,10Z'] }, { id: 'b', name: '돌출', x: 3500, y: 0, w: 600, h: 900, paths: [] }]);
    expect(svg).toMatch(/width="4100mm"/);
    expect(svg).toMatch(/viewBox="0 0 4100 /);
    expect(svg).toContain('<g id="CutContour"');
    expect(svg).toContain('stroke="#ff00ff"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('정면');
    expect((svg.match(/<path /g) ?? []).length).toBe(1);
  });
});

describe('cutItems — 입체(밀어내는) 구성 요소의 글자·벡터만', () => {
  it('채널 글자·스카시 벡터는 칼선, 시트 글자는 빠짐', () => {
    const o: SignObject = { id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [], sheetIds: [], createdAt: 0, productId: 'body-none', widthMm: 3000, heightMm: 600,
      parts: [
        { id: 'c', kind: 'channel', type: 'ch-front', items: [{ id: 't', kind: 'text', text: '바로', x: -500, y: 50, h: 400 }, { id: 'e', kind: 'text', text: '  ', x: 0, y: 0, h: 100 }] },
        { id: 's', kind: 'scashi', type: 'sc-acrylic', items: [{ id: 'v', kind: 'image', image: { assetId: 'a' }, vector: true, x: 900, y: 0, w: 300, h: 200 }] },
        { id: 'h', kind: 'sheet', type: 'sh-cut', items: [{ id: 'z', kind: 'text', text: '시트', x: 0, y: -200, h: 100 }] },
      ] } as SignObject;
    const items = cutItems(o);
    expect(items.map((i) => i.id).sort()).toEqual(['t', 'v']);
    const t = items.find((i) => i.id === 't')!;
    expect([t.text, t.x, t.y, t.h, t.partKind]).toEqual(['바로', -500, 50, 400, 'channel']);
    expect(items.find((i) => i.id === 'v')).toMatchObject({ vector: true, w: 300, h: 200, partKind: 'scashi' });
  });
});
