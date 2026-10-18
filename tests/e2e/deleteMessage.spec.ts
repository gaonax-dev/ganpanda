import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

// 2026-10-18 사용자: "말풍선 안의 이전 녹음을 지울 수가 없다" — 대화·음성 메모 지우기
test('말풍선의 메시지와 상세의 음성 메모를 지울 수 있다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(async () => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void; sendMessage(id: string, t: string, k: string, a?: unknown[]): Promise<void> } }).__ganpanda;
    const id = app.project.addObject({ photoId: app.photos[0].id, name: '정면', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-galva', widthMm: 3000, heightMm: 600 });
    app.selectObject(id);
    await app.sendMessage(id, '옛 녹음 (대화에 첨부로 들어간 것)', 'chat', [{ assetId: 'a'.repeat(32), name: 'v.webm', type: 'audio/webm', size: 9 }]);
    await app.sendMessage(id, '🎤 음성 메모 3초', 'voice', [{ assetId: 'b'.repeat(32), name: 'v2.webm', type: 'audio/webm', size: 9 }]);
  });
  page.on('dialog', (d) => d.accept());
  await page.getByTestId('object-chat-open').click();
  const chat = page.getByTestId('object-chat');
  await expect(chat.getByTestId('chat-bubble')).toHaveCount(1);
  await chat.getByTestId('chat-delete').click();
  await expect(chat.getByTestId('chat-bubble')).toHaveCount(0);
  // 상세의 음성 메모도 (말풍선 창을 닫고 상세로)
  await page.getByTestId('object-chat-close').click();
  await page.getByTestId('object-voices-open').click();
  const voices = page.getByTestId('object-voices');
  await expect(voices.getByTestId('voice-delete')).toHaveCount(1);
  await voices.getByTestId('voice-delete').click();
  await expect(voices.getByTestId('voice-delete')).toHaveCount(0);
  await expect(page.getByTestId('object-voices-count')).toHaveCount(0);
});
