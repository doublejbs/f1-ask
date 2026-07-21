import { RaceEvent } from "../RaceEvent";
import { RaceSummaryData } from "../RaceSummary";
import { ArchiveResultStatus } from "./ArchiveResultStatus";

// 지난 레이스 기록(docs/17-race-archive.md)의 전송 모델.
// Firestore 아카이브가 아니라 서버 라우트가 OpenF1 을 온디맨드 조회해 만든다.

// 목록·상세 공통 세션 식별 정보.
export type ArchiveRaceSession = {
  sessionKey: number;
  sessionId: string;
  meetingKey: number;
  // 시즌 라운드. OpenF1 은 라운드 번호를 주지 않으므로 레이스를 여는 미팅을
  // 시작 시각 순으로 세어 도출한다.
  round: number;
  // 그랑프리명 (meetings.meeting_name).
  meetingName: string;
  // "Race" 또는 "Sprint".
  sessionName: string;
  circuitName: string;
  countryCode: string;
  countryName: string;
  dateStart: string | null;
  dateEnd: string;
};

export type ArchivePodiumEntry = {
  position: number;
  driverNumber: number;
  driverCode: string;
  fullName: string;
  teamName: string;
  teamColour: string | null;
};

// 목록 항목 — 세션 정보 + 포디움 3인.
export type ArchiveRaceListItem = ArchiveRaceSession & {
  podium: ArchivePodiumEntry[];
};

export type ArchiveResultRow = {
  position: number | null;
  driverNumber: number;
  driverCode: string;
  fullName: string;
  teamName: string;
  teamColour: string | null;
  // 선두와의 간격(초). 선두는 0, 랩 다운·미완주는 null.
  gapToLeaderSeconds: number | null;
  // 초로 표현할 수 없는 간격의 원문("+1 LAP" 등). 숫자 간격이면 null.
  gapLabel: string | null;
  totalTimeSeconds: number | null;
  lapsCompleted: number | null;
  points: number | null;
  status: ArchiveResultStatus;
};

// 상세 — 최종 순위 + 경기 요약 + 주요 이벤트 타임라인.
export type ArchiveRaceDetail = {
  session: ArchiveRaceSession;
  results: ArchiveResultRow[];
  summary: RaceSummaryData;
  events: RaceEvent[];
};
