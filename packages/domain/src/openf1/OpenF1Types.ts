// OpenF1 API 응답 형태 (외부 provider 타입).
// 내부 domain 모델(LiveRaceSnapshot 등)과 명확히 분리한다.
// 사용하는 필드만 정의한다.

// drivers 행의 문자열 필드는 셋 다 실제 계약이 nullable 이다(엔트리 리스트가 확정되기 전
// 세션 초반, 그리고 시즌 중 대체 드라이버가 들어온 직후에 비어 온다).
// 셋을 함께 nullable 로 두는 이유: 스냅샷 스키마가 code / fullName / teamName 에
// 모두 z.string().min(1) 을 걸어 두었으므로(RaceSnapshotSchema) 하나만 막으면
// 나머지 둘이 그대로 파싱을 깬다. 정규화 경계(driverIdentityOf)에서 한 번에 채운다.
export type OpenF1Driver = {
  driver_number: number;
  name_acronym: string | null;
  full_name: string | null;
  team_name: string | null;
  team_colour?: string | null;
  headshot_url?: string | null;
  // 여러 세션을 한 번에 조회할 때만 의미가 있다(단일 세션 조회에서는 무시한다).
  session_key?: number;
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
  // 클립 파일이 아직 올라오지 않은 행은 recording_url 이 비어 온다.
  // 스냅샷 스키마는 z.string().url() 이라 빈 값·비URL 은 대체할 방법이 없다 —
  // 정규화 경계에서 해당 클립을 통째로 뺀다(OpenF1Normalizer.isPlayableRadio).
  recording_url: string | null;
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
  // 실제 계약은 nullable 이다. 피트인 직후에는 컴파운드가 확정되기 전에 스틴트 행이 먼저 온다.
  // 실측(헝가리 GP 랩 40): {"driver_number":1,"lap_start":40,"lap_end":56,"compound":null}.
  // 예전엔 `string` 으로 선언돼 있어 mapCompound 가 compound.toUpperCase() 로 터졌고
  // 워커가 매 폴링마다 같은 자리에서 죽어 화면이 랩 40 부터 종료까지 약 30 분 얼었다.
  compound: string | null;
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
  // compound 와 같은 계열의 위험이라 미리 nullable 로 정정한다. 어제 실측에서는 null 이 0 건이었지만
  // OpenF1 은 언제든 null 을 줄 수 있고, 문구를 대문자화하는 호출부가 네 곳이라 한 번 오면
  // 워커가 같은 방식으로 죽는다. 타입을 실제 계약에 맞춰 두면 호출부가 컴파일 시점에 드러난다.
  message: string | null;
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
  // 숫자(초)이거나 "+1 LAP" 같은 문자열, 또는 null 일 수 있다.
  gap_to_leader: number | string | null;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
  // 여러 세션을 한 번에 조회할 때만 의미가 있다(단일 세션 조회에서는 무시한다).
  session_key?: number;
};

// sessions 엔드포인트 행. 세션 목록·아카이브 판정의 원본이다.
export type OpenF1Session = {
  session_key: number;
  meeting_key: number;
  session_name: string;
  session_type: string;
  circuit_short_name: string;
  country_code: string;
  country_name?: string | null;
  year: number;
  // 세션 예정 시각. 워커의 활성 판정과 아카이브의 완료 판정 근거다.
  date_start?: string | null;
  date_end?: string | null;
  // 취소된 세션(예: 2026 바레인·제다)은 기록에서 제외한다.
  is_cancelled?: boolean | null;
};

// meetings 엔드포인트 행. 그랑프리명과 라운드 도출에 쓴다.
export type OpenF1Meeting = {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name?: string | null;
  country_code: string;
  country_name?: string | null;
  circuit_short_name: string;
  date_start?: string | null;
  year: number;
  is_cancelled?: boolean | null;
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
