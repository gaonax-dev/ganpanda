// 대화 첨부 (사진·PDF)
import type { Attachment } from './model';

export const ATTACH_MAX = 5;
export const ATTACH_ACCEPT = 'image/*,.pdf,application/pdf';

export const isImage = (a: Pick<Attachment, 'type'>) => a.type.startsWith('image/');
/** 음성 메모 (2026-10-18 사용자: 휴대폰 상단 메뉴의 녹음) */
export const isAudio = (a: Pick<Attachment, 'type'>) => a.type.startsWith('audio/');

/** "사진 2장 · 음성 1개 · 파일 1개" (토스트·알림용) */
export function describeAttachments(list: Pick<Attachment, 'type'>[]): string {
  const img = list.filter(isImage).length;
  const audio = list.filter(isAudio).length;
  const file = list.length - img - audio;
  return [img ? `사진 ${img}장` : '', audio ? `음성 ${audio}개` : '', file ? `파일 ${file}개` : ''].filter(Boolean).join(' · ');
}

/** MediaRecorder 형식 후보 (브라우저마다 다름: 크롬·파이어폭스 webm/opus, 사파리·아이폰 mp4). 지원하는 첫 것 */
export const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/wav', 'audio/mpeg'] as const;
export function pickAudioMime(supported: (t: string) => boolean): string | undefined {
  return AUDIO_MIME_CANDIDATES.find((t) => { try { return supported(t); } catch { return false; } });
}
/** 'audio/webm;codecs=opus' → 'audio/webm' (서버·첨부 형식은 매개변수 없이) */
export const baseMime = (t: string) => t.split(';')[0].trim().toLowerCase();
const AUDIO_EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/x-m4a': 'm4a' };
/** 음성 메모 첨부 이름·문구 */
export const voiceFileName = (mime: string, at: Date) => `음성 메모 ${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, '0')}${String(at.getDate()).padStart(2, '0')}-${String(at.getHours()).padStart(2, '0')}${String(at.getMinutes()).padStart(2, '0')}${String(at.getSeconds()).padStart(2, '0')}.${AUDIO_EXT[baseMime(mime)] ?? 'bin'}`;
export const voiceMemoText = (seconds: number) => `🎤 음성 메모 ${Math.max(1, Math.round(seconds))}초`;
export const recordingLabel = (seconds: number) => `■ ${String(Math.floor(seconds / 60)).padStart(1, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
