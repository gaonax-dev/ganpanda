// 사인물마다 내용 지문 (2026-10-22) — 진행 동의 기록에 사인물별 지문을 함께 남긴다. (같은 날의 멤버 확인·카드 컨펌 화면은 "기존의 컨펌은 제거한다"로 뺐다)
import { describe, expect, it } from 'vitest';
import { signHash } from '../../src/lib/core/proposal';

describe('signHash', () => {
  const base = { id: 'a', name: '간판', photoId: 'p', shape: 'rect' as const, quad: [], sheetIds: [], createdAt: 1, widthMm: 3000, heightMm: 600 };
  it('사인물 지문은 그 사인물 내용만 — 자리(listX)가 바뀌어도 그대로, 크기·구성이 바뀌면 바뀐다', () => {
    const h = signHash(base, { w: 3000, h: 600 }, 500000);
    expect(signHash({ ...base, listX: 900 }, { w: 3000, h: 600 }, 500000)).toBe(h);
    expect(signHash(base, { w: 3200, h: 600 }, 500000)).not.toBe(h);
    expect(signHash({ ...base, parts: [{ id: 'x', kind: 'channel', type: 'ch-front', items: [] }] } as never, { w: 3000, h: 600 }, 500000)).not.toBe(h);
  });
});
