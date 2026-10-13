import { describe, expect, it } from 'vitest';
import { roomsWsBase, syncServerUrl } from '../../src/lib/core/syncUrl';

describe('동기화 서버 주소', () => {
  it('http → ws, https → wss, 끝의 / 제거', () => {
    expect(roomsWsBase('http://localhost:8787/')).toBe('ws://localhost:8787/api/rooms');
    expect(roomsWsBase('https://sync.ganpanda.app')).toBe('wss://sync.ganpanda.app/api/rooms');
  });

  it('설정값이 있으면 그 값, 없으면 개발 기본값(8787), 운영에서는 null (서버 없이 로컬 모드)', () => {
    expect(syncServerUrl('https://x.example', true)).toBe('https://x.example');
    expect(syncServerUrl(undefined, true)).toBe('http://localhost:8787');
    expect(syncServerUrl(undefined, false)).toBeNull();
    expect(syncServerUrl('', false)).toBeNull();
  });
});
