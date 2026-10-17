// 말풍선 받는 사람 (2026-10-17 사용자: "핀을 말 풍선으로 변경하고 해당 말 풍선은 받는 사람이 있다. 모두가 보게할 수도 있다")
import { describe, expect, it } from 'vitest';
import { participantsOf, pinVisibleTo, recipientLabel } from '../../src/lib/core/pins';

describe('pinVisibleTo', () => {
  it('받는 사람 없음 = 모두에게', () => {
    expect(pinVisibleTo({ author: '사장', to: undefined }, '아무', 'viewer')).toBe(true);
    expect(pinVisibleTo({ author: '사장', to: '' }, '아무', null)).toBe(true);
  });
  it('받는 사람이 있으면 보낸 사람·받는 사람·소유자만', () => {
    const p = { author: '사장', to: '디자이너' };
    expect(pinVisibleTo(p, '디자이너', 'editor')).toBe(true);
    expect(pinVisibleTo(p, '사장', 'editor')).toBe(true);
    expect(pinVisibleTo(p, '시공', 'owner')).toBe(true);
    expect(pinVisibleTo(p, '시공', 'editor')).toBe(false);
    expect(pinVisibleTo(p, '고객', 'viewer')).toBe(false);
  });
  it('받는 사람 표시', () => {
    expect(recipientLabel({ to: undefined })).toBe('모두');
    expect(recipientLabel({ to: '디자이너' })).toBe('디자이너');
  });
});
describe('participantsOf: 접속자 + 대화·말풍선 등장 인물, 나 제외, 이름순', () => {
  it('중복·빈 이름 제거', () => {
    expect(participantsOf(['사장', '디자이너', ''], [{ author: '고객' }, { author: '사장' }], [{ author: '시공', to: '감리' }], '사장')).toEqual(['감리', '고객', '디자이너', '시공']);
  });
});
