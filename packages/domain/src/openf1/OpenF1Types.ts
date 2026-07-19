// OpenF1 API 응답 형태 (외부 provider 타입).
// 내부 domain 모델(LiveRaceSnapshot 등)과 명확히 분리한다.
// 사용하는 필드만 정의한다.

export type OpenF1Driver = {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
};

export type OpenF1Position = {
  date: string;
  driver_number: number;
  position: number;
};

export type OpenF1Interval = {
  date: string;
  driver_number: number;
  // 숫자이거나 "+1 LAP" 같은 문자열, 또는 null 일 수 있다.
  gap_to_leader: number | string | null;
  interval: number | string | null;
};

export type OpenF1Stint = {
  driver_number: number;
  lap_start: number;
  lap_end: number;
  compound: string;
  tyre_age_at_start: number;
};

export type OpenF1Lap = {
  driver_number: number;
  lap_number: number;
  date_start: string | null;
  lap_duration: number | null;
};

export type OpenF1Pit = {
  date: string;
  driver_number: number;
  lap_number: number;
  pit_duration: number | null;
};

export type OpenF1RaceControl = {
  date: string;
  category: string;
  flag: string | null;
  scope: string | null;
  message: string;
};

export type OpenF1SessionMeta = {
  sessionId: string;
  sessionKey: number;
  meetingKey: number;
  sessionName: string;
  sessionType: string;
  circuitName: string;
  countryCode: string;
};

// 한 세션의 OpenF1 원본 데이터 묶음.
export type OpenF1SessionData = {
  meta: OpenF1SessionMeta;
  drivers: OpenF1Driver[];
  positions: OpenF1Position[];
  intervals: OpenF1Interval[];
  stints: OpenF1Stint[];
  laps: OpenF1Lap[];
  pits: OpenF1Pit[];
  raceControl: OpenF1RaceControl[];
};
