// OpenF1 API 응답 형태 (외부 provider 타입).
// 내부 domain 모델(LiveRaceSnapshot 등)과 명확히 분리한다.
// 사용하는 필드만 정의한다.

export type OpenF1Driver = {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_colour?: string | null;
  headshot_url?: string | null;
};

export type OpenF1Weather = {
  date: string;
  air_temperature: number | null;
  track_temperature: number | null;
  humidity: number | null;
  rainfall: number | null;
  wind_speed: number | null;
};

export type OpenF1Overtake = {
  date: string;
  position: number | null;
  overtaking_driver_number: number;
  overtaken_driver_number: number;
};

export type OpenF1TeamRadio = {
  date: string;
  driver_number: number;
  recording_url: string;
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
  duration_sector_1?: number | null;
  duration_sector_2?: number | null;
  duration_sector_3?: number | null;
  st_speed?: number | null; // 스피드 트랩 (km/h)
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
  // scope 가 Driver 일 때 대상 드라이버. 응답에 없을 수 있다.
  driver_number?: number | null;
  // scope 가 Sector 일 때 섹터 번호. 응답에 없을 수 있다.
  sector?: number | null;
  lap_number?: number | null;
};

// 세션 종료 후 확정되는 결과 행 (session_result 엔드포인트).
// 세션 진행 중에는 비어 있거나 조회 자체가 실패할 수 있다.
export type OpenF1SessionResult = {
  driver_number: number;
  position: number | null;
  number_of_laps: number | null;
  points: number | null;
  duration: number | null;
  gap_to_leader: number | null;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
};

export type OpenF1SessionMeta = {
  sessionId: string;
  sessionKey: number;
  meetingKey: number;
  sessionName: string;
  sessionType: string;
  circuitName: string;
  countryCode: string;
  // 세션 예정 시각 (ISO). 워커의 활성 판정에 쓴다.
  // 과거 fixture 와의 호환을 위해 optional 로 둔다 — 없으면 판정이 비활성으로 닫힌다.
  dateStart?: string | null;
  dateEnd?: string | null;
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
  // 확장 데이터 (없을 수 있어 optional).
  weather?: OpenF1Weather[];
  overtakes?: OpenF1Overtake[];
  teamRadio?: OpenF1TeamRadio[];
  sessionResults?: OpenF1SessionResult[];
};
