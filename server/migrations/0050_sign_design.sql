-- 홈 카드의 디자인 진행 (2026-11-06): 앱이 프로젝트를 열어 둔 동안 저장하는 일러스트로 보낸(대지 번호) 사인물 수·그중 디자인을 받은 수
ALTER TABLE projects ADD COLUMN sign_design INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN sign_designed INTEGER NOT NULL DEFAULT 0;
