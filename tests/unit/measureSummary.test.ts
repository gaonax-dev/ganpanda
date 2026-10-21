// 프로젝트 카드 실측 상태 (2026-10-21 → "실측 안내 없이 숫자만")
import { describe, expect, it } from 'vitest';
import { measureLabel } from '../../src/lib/core/measureSummary';

describe('카드 숫자', () => {
  it('사인물이 없으면 숫자 없음', () => {
    expect(measureLabel({ status: 'waiting' }, '대기')).toMatchObject({ kind: 'none', label: '대기', count: '' });
  });
  it('미측정이 있으면 미측정/전체, 다 재면 전체 수만', () => {
    expect(measureLabel({ status: 'waiting', signTotal: 3, signUnmeasured: 3 }, '대기')).toMatchObject({ kind: 'waiting', count: '3/3' });
    expect(measureLabel({ status: 'waiting', signTotal: 3, signUnmeasured: 1 }, '대기')).toMatchObject({ kind: 'measuring', count: '1/3' });
    expect(measureLabel({ status: 'waiting', signTotal: 3, signUnmeasured: 0 }, '대기')).toMatchObject({ kind: 'measured', count: '3', label: '대기' });
    expect(measureLabel({ status: 'done', signTotal: 2, signUnmeasured: 0 }, '완료').count).toBe('2');
  });
  it('설명 글(title)에는 뜻이 있다', () => {
    expect(measureLabel({ status: 'waiting', signTotal: 2, signUnmeasured: 1 }, '대기').title).toBe('미측정 1 / 사인물 2');
    expect(measureLabel({ status: 'waiting', signTotal: 2, signUnmeasured: 5 }, '대기').count).toBe('2/2'); // 전체로 자른다
  });
});
