// 대화 첨부 (사진·PDF)
import type { Attachment } from './model';

export const ATTACH_MAX = 5;
export const ATTACH_ACCEPT = 'image/*,.pdf,application/pdf';

export const isImage = (a: Pick<Attachment, 'type'>) => a.type.startsWith('image/');

/** "사진 2장 · 파일 1개" (토스트·알림용) */
export function describeAttachments(list: Pick<Attachment, 'type'>[]): string {
  const img = list.filter(isImage).length;
  const file = list.length - img;
  return [img ? `사진 ${img}장` : '', file ? `파일 ${file}개` : ''].filter(Boolean).join(' · ');
}
