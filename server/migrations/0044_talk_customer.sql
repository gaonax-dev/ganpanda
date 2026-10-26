-- 톡방에 고객이 있는지 (2026-10-26 "톡방에는 프로젝트 배지와 고객 배지(고객이 대화방에 있는곳)"): 방 만든 사람·멤버 중 회사(소유자·팀) 밖 사람(계정 없는 손님 포함)이 있으면 1. 다음 색인 때 채워진다
ALTER TABLE talk_index ADD COLUMN customer INTEGER NOT NULL DEFAULT 0;
