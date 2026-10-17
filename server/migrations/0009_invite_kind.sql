-- 초대 종류 (2026-10-17 요금제 개편): 'proposal' = 제안 보내기로 만든 viewer 링크 (무료 요금제 월 건수 한도). NULL = 보통 초대
ALTER TABLE invites ADD COLUMN kind TEXT;
