import { describe, expect, it } from 'vitest';
import { baseMime, describeAttachments, isAudio, isImage, pickAudioMime, recordingLabel, voiceFileName, voiceMemoText } from '../../src/lib/core/attachments';

const img = { assetId: 'x', name: 'a.png', type: 'image/png', size: 10 };
const pdf = { assetId: 'y', name: 'b.pdf', type: 'application/pdf', size: 10 };

describe('첨부 요약', () => {
  it('사진·파일 개수를 글로', () => {
    expect(describeAttachments([img, img])).toBe('사진 2장');
    expect(describeAttachments([pdf])).toBe('파일 1개');
    expect(describeAttachments([img, pdf])).toBe('사진 1장 · 파일 1개');
    expect(describeAttachments([])).toBe('');
  });
  it('이미지 판별', () => {
    expect(isImage(img)).toBe(true);
    expect(isImage(pdf)).toBe(false);
  });
  it('음성 메모 (2026-10-18 휴대폰 녹음)', () => {
    const voice = { assetId: 'v', name: 'v.webm', type: 'audio/webm', size: 10 };
    expect(isAudio(voice)).toBe(true);
    expect(isAudio(img)).toBe(false);
    expect(describeAttachments([voice, img])).toBe('사진 1장 · 음성 1개');
    expect(pickAudioMime((t) => t === 'audio/mp4')).toBe('audio/mp4'); // 사파리
    expect(pickAudioMime((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus'); // 크롬
    expect(pickAudioMime(() => false)).toBeUndefined();
    expect(baseMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(voiceFileName('audio/mp4', new Date(2026, 9, 18, 15, 4, 9))).toBe('음성 메모 20261018-150409.m4a');
    expect(voiceFileName('audio/webm;codecs=opus', new Date(2026, 0, 1))).toMatch(/\.webm$/);
    expect(voiceMemoText(7.4)).toBe('🎤 음성 메모 7초');
    expect(voiceMemoText(0.2)).toBe('🎤 음성 메모 1초');
    expect(recordingLabel(65.7)).toBe('■ 1:05');
  });
});
