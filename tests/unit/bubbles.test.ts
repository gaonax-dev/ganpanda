// 말풍선 마지막 상태 (2026-10-17 사용자: "말 풍선에는 마지막 상태만 나오게")
import { describe, expect, it } from 'vitest';
import type { Message } from '../../src/lib/core/model';
import { bubbleLabel, lastStateOf, snippet } from '../../src/lib/core/bubbles';

const msg = (o: Partial<Message>): Message => ({ id: 'm', objectId: 'o1', author: '사장', text: '', kind: 'chat', ts: 1, ...o });

describe('lastStateOf: 그 대화의 마지막 메시지', () => {
  it('ts 가 가장 큰 것, 글이 없으면 첨부 설명, 다른 대화는 무시', () => {
    const ms = [msg({ id: 'a', text: '첫 글', ts: 1 }), msg({ id: 'b', text: '둘째 글', ts: 3 }), msg({ id: 'c', objectId: 'o2', text: '딴 데', ts: 9 }), msg({ id: 'd', text: '', attachments: [{ assetId: 'x', name: 'a.jpg', type: 'image/jpeg', size: 1 }], ts: 2 })];
    expect(lastStateOf(ms, 'o1')).toMatchObject({ text: '둘째 글', author: '사장', ts: 3 });
    expect(lastStateOf(ms, 'o3')).toBeNull();
    expect(lastStateOf([ms[3]], 'o1')!.text).toMatch(/사진|첨부|이미지/);
  });
});
describe('snippet · bubbleLabel', () => {
  it('첫 줄 18자, 길면 …', () => {
    expect(snippet('여기에 돌출 간판 어떨까요?\n둘째 줄')).toBe('여기에 돌출 간판 어떨까요?');
    expect(snippet('가나다라마바사아자차카타파하가나다라마바사')).toHaveLength(18);
    expect(snippet('가나다라마바사아자차카타파하가나다라마바사').endsWith('…')).toBe(true);
  });
  it('해결됨이 우선, 내 글은 "나:", 없으면 빈 글', () => {
    expect(bubbleLabel({ resolved: true, last: { text: '아', author: '사장', ts: 1 } })).toBe('✓ 해결됨');
    expect(bubbleLabel({ last: { text: '좋아요!', author: '고객', ts: 1 }, me: '사장' })).toBe('고객: 좋아요!');
    expect(bubbleLabel({ last: { text: '좋아요!', author: '사장', ts: 1 }, me: '사장' })).toBe('나: 좋아요!');
    expect(bubbleLabel({ last: null })).toBe('');
  });

  it('음성 메모(voice)는 말풍선의 마지막 상태가 되지 않는다 (2026-10-18 "녹음하면 말풍선 계속 생긴다")', () => {
    const base = { id: 'x', objectId: 'o', author: '김', text: '', kind: 'chat' as const, ts: 1 };
    expect(lastStateOf([{ ...base, kind: 'voice', text: '🎤 음성 메모 3초', ts: 9 }], 'o')).toBeNull();
    expect(lastStateOf([{ ...base, text: '확인', ts: 2 }, { ...base, id: 'y', kind: 'voice', text: '🎤 음성 메모 3초', ts: 9 }], 'o')).toMatchObject({ text: '확인', ts: 2 });
  });
});
