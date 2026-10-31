import { describe, expect, it } from 'vitest';
import { kitVariantFor, kitLookFor } from '../../src/lib/core/channelKit';

// 2026-10-31 채널 키트(glTF + 구운 라이트맵): 채널 구성 요소의 종류·옵션 → 키트 모델과 색
const opt = (o: Record<string, unknown>) => o;
describe('채널 → 키트 모델', () => {
  it('종류·캡·뒤판으로 고른다', () => {
    expect(kitVariantFor({ type: 'ch-front', options: opt({ chType: '캡' }) })).toBe('front-lit-cap');
    expect(kitVariantFor({ type: 'ch-front', options: opt({ chType: '오싸이' }) })).toBe('front-lit');
    expect(kitVariantFor({ type: 'ch-halo', options: {} })).toBe('halo');
    expect(kitVariantFor({ type: 'ch-halo', options: opt({ chBack: '유백 아크릴' }) })).toBe('acrylic-halo');
    expect(kitVariantFor({ type: 'ch-both', options: opt({ chType: '캡' }) })).toBe('both-cap');
    expect(kitVariantFor({ type: 'ch-both', options: opt({ chType: '캡', chBack: '투명 아크릴' }) })).toBe('cap-acrylic-halo');
    expect(kitVariantFor({ type: 'ch-galva', options: {} })).toBe('epoxy');
  });
  it('키트에 없는 종류(벌브·통아크릴)는 없음 — 사진 그대로', () => {
    expect(kitVariantFor({ type: 'ch-bulb', options: {} })).toBeNull();
    expect(kitVariantFor({ type: 'ch-acrylic', options: {} })).toBeNull();
  });
});

describe('채널 → 키트 색', () => {
  it('앞면·몸통·캡 색, LED 색, 마감, 점등', () => {
    const l = kitLookFor({ type: 'ch-both', options: opt({ faceSystem: '기본색', faceCode: '빨강', bodySystem: '직접', bodyCode: '#112233', capSystem: '기본색', capCode: '검정', ledColor: '전구색', chFinish: '헤어라인' }) });
    expect(l.face).toMatch(/^#[0-9a-f]{6}$/);
    expect(l.face).not.toBe('#ffffff');
    expect(l.side).toBe('#112233');
    expect(l.cap).toMatch(/^#[0-9a-f]{6}$/);
    expect(l.led).toBe('#ffcf8a');
    expect(l.finish).toBe('헤어라인');
    expect(l.lit).toBe(true);
  });
  it('색이 없으면 기본(앞면 흰색, 캡은 몸통 색), 비조명·갈바는 불 꺼짐', () => {
    const l = kitLookFor({ type: 'ch-front', options: opt({ bodySystem: '직접', bodyCode: '#334455' }) });
    expect(l.face).toBe('#ffffff');
    expect(l.cap).toBe('#334455');
    expect(kitLookFor({ type: 'ch-front', options: opt({ chLight: '비조명' }) }).lit).toBe(false);
    expect(kitLookFor({ type: 'ch-galva', options: {} }).lit).toBe(false);
  });
  it('갈바(도장·에폭시)는 앞면도 몸통과 같은 색 — 앞면 판이 따로 흰색으로 보이지 않게 (2026-10-31 노말 고친 G_01)', () => {
    const l = kitLookFor({ type: 'ch-galva', options: opt({ bodySystem: '직접', bodyCode: '#1144aa', chGalvaFace: '에폭시' }) });
    expect(l.face).toBe('#1144aa');
    expect(l.side).toBe('#1144aa');
  });
});
