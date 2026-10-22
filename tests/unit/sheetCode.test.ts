import { describe, expect, it } from 'vitest';
import { componentOf, surfaceOf } from '../../src/lib/core/components';
import { newPart } from '../../src/lib/core/parts';
import { partOptionFields } from '../../src/lib/core/options';
import type { SignPart } from '../../src/lib/core/model';

// 2026-10-22 사용자: "시트는 도색이 없다. uv출력과 회사별 시트 코드가 있다. 맞아 미리보기 색상 따로 시트 제작사 시트코드가 필요해", "시트코드는 따로 db로 넣을께"
describe('시트 = 제작사·시트 코드 + 미리보기 색 (도색 없음)', () => {
  const sheet = componentOf('sheet');
  it('재질 시트·안개 시트의 옵션: 제작사·시트 코드·미리보기 색, 도색 필드 없음', () => {
    for (const t of ['sh-cut', 'sh-frost']) {
      const keys = partOptionFields(newPart('sheet', t)).map((f) => f.key);
      expect(keys).toEqual(expect.arrayContaining(['sheetMaker', 'sheetNo', 'previewColor']));
      expect(keys.some((k) => k.startsWith('sheetSystem') || k === 'sheetGloss')).toBe(false);
    }
    const pc = partOptionFields(newPart('sheet', 'sh-cut')).find((f) => f.key === 'previewColor')!;
    expect(pc).toMatchObject({ kind: 'color', preview: true });
  });

  it('구성내역에 제작사·시트 코드, 미리보기 색은 들어가지 않는다', () => {
    const p: SignPart = { id: 's', kind: 'sheet', type: 'sh-cut', on: 'frame', options: { sheetMaker: '3M', sheetNo: '7725-12', previewColor: '#111111' }, items: [] };
    expect(sheet.spec(p)).toContain('3M 7725-12');
    expect(sheet.spec(p)).not.toContain('#111111');
  });

  it('2D·3D 색 = 미리보기 색', () => {
    const p: SignPart = { id: 's', kind: 'sheet', type: 'sh-cut', on: 'frame', options: { previewColor: '#ff0000' }, items: [] };
    expect(surfaceOf(p).face).toBe('#ff0000');
    expect(sheet.areaFill!(p)).toBe('#ff0000');
  });

  it('옛 시트 색(도색 필드)은 미리보기 색으로 옮긴다', () => {
    const old: SignPart = { id: 's', kind: 'sheet', type: 'sh-cut', on: 'frame', options: { sheetSystem: '기본색', sheetCode: '검정' }, items: [] };
    const n = sheet.normalize!(old);
    expect(n.options).toEqual({ previewColor: '#141414' });
  });
});
