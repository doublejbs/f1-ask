// 외부 경기 데이터 provider 인터페이스 (docs/02-architecture.md §2.6)
// 초기 provider 는 OpenF1 이지만 내부 domain 모델과 응답 구조를 분리한다.
// 아래 External* 타입은 "외부 provider 타입"으로, domain 타입과 명확히 구분된다.

export type ExternalSession = {
  session_key: number;
  meeting_key: number;
  session_name: string;
  session_type: string;
  circuit_short_name: string;
  country_code: string;
};

export type ExternalDriver = {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
};

export type ExternalInterval = {
  driver_number: number;
  gap_to_leader: number | null;
  interval: number | null;
};

export type ExternalLap = {
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
};

export type ExternalStint = {
  driver_number: number;
  compound: string;
  lap_start: number;
  lap_end: number;
};

export type ExternalPitStop = {
  driver_number: number;
  lap_number: number;
  pit_duration: number | null;
};

export type ExternalRaceControlMessage = {
  category: string;
  flag: string | null;
  message: string;
  date: string;
};

export interface RaceDataProvider {
  getSession(sessionKey: number): Promise<ExternalSession>;
  getDrivers(sessionKey: number): Promise<ExternalDriver[]>;
  getIntervals(sessionKey: number): Promise<ExternalInterval[]>;
  getLaps(sessionKey: number): Promise<ExternalLap[]>;
  getStints(sessionKey: number): Promise<ExternalStint[]>;
  getPitStops(sessionKey: number): Promise<ExternalPitStop[]>;
  getRaceControl(sessionKey: number): Promise<ExternalRaceControlMessage[]>;
}
