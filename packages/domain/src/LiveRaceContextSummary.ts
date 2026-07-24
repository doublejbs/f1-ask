import { SafetyCarKind } from "./SafetyCarKind";
import { SessionStatus } from "./SessionStatus";
import { TireCompound } from "./TireCompound";

// 워커가 OpenF1 원본에서 계산해 스냅샷에 싣는 결정론적 다이제스트 (docs/22 §B · docs/25).
//
// 두 종류의 사실을 담는다:
//   1. 집계 — 개별 이벤트로 흩어지면 소음이 되는 것(피트·스틴트·추월)을 한 덩어리로 압축.
//      예: "피트 28회, 중앙값 24.7초, HAM 12랩째 하드로 교체".
//   2. 서사(narrative) — 경기 전체의 아크(선두변경·리타이어·피트웨이브·최대이동·날씨·SC).
//      집계가 "지금 상태의 압축"이라면 narrative 는 "여기까지 어떻게 왔나"의 구조적 사실이다.
// 둘 다 LLM 이 아니라 도메인이 계산하므로 환각이 없다(docs/02 §3.1 결정론적 코어). 문장화는
// 답변 LLM 의 몫 — 다이제스트는 사실만 조립한다(docs/25 §원칙).
//
// 모든 값은 "nowMs 시점까지"다 — 리플레이·라이브 모두 "지금까지"가 맞다.
// session_result 는 라이브 진행 중엔 비어 있으므로(실측) 여기에 넣지 않는다.
export type LiveRaceContextSummary = {
  pits: PitContextSummary;
  // 드라이버별 스틴트 맥락. 스냅샷에 없는 정보(스틴트 이력·시작 랩·마지막 피트 랩)만 담는다.
  stints: StintContextSummary[];
  overtakes: OvertakeContextSummary;
  // 경기 전체 서사(docs/25). 데이터가 없으면(옛 스냅샷·mock) 안전하게 생략되므로 optional.
  narrative?: RaceNarrative;
};

// 경기 전체 서사. 전부 nowMs 시점까지의 결정론적 사실이며, 미래(그 뒤 일어날 일)는 누출되지
// 않는다(docs/25 수용 기준 §9). 상한은 필드 성격별로 다르다 — 자연 유계인 것은 자르지 않고,
// 무한정 늘 수 있는 것만 상위 N 으로 캡한다(docs/25 §담을 서사).
export type RaceNarrative = {
  // 랩 X/Y 와 세션 국면(green/sc/...). nowMs 시점 스냅.
  progress: RaceProgress;
  // 선두를 잡은 driver_number 순서(연속 중복 제거). "리드 보유 순서"이지 트랙 추월이 아니다 —
  // SC 중 선두 피트·레드플래그 재정렬로 넘어간 리드도 포함하므로 추월로 단정하면 안 된다
  // (docs/25 §재시작·SC 왜곡 방지). 자연 유계, 무상한.
  leadChanges: number[];
  // 리타이어 목록. 자르면 잘린 드라이버가 "아직 달리는 중"으로 오인되므로 절대 자르지 않는다.
  retirements: RaceRetirement[];
  // 피트가 몰린 랩 구간. 대수 많은 상위 몇 구간만.
  pitWaves: PitWave[];
  // 그리드 대비 상승·하락. 상승 3 · 하락 3.
  biggestMovers: RaceMover[];
  // 패스티스트 랩 보유자·기록·랩. 데이터가 없으면 null.
  fastestLap: RaceFastestLap | null;
  // dry↔wet 전환 시점. 자연 유계, 무상한.
  weatherShifts: WeatherShift[];
  // SC·VSC 발생 구간. 자연 유계, 무상한.
  safetyCars: SafetyCarPeriod[];
};

// 진행 상황 스냅. currentLap 은 리더 랩(전체 드라이버 중 최대 완주 랩, totalLaps 로 클램프됨),
// totalLaps 는 서킷 참조 테이블 기준(모르면 null), phase 는 nowMs 시점 세션 상태.
export type RaceProgress = {
  currentLap: number | null;
  totalLaps: number | null;
  phase: SessionStatus;
};

// 리타이어 한 건. reason 은 담지 않는다 — 라이브 원본(race_control)에 리타이어 문구가
// 아예 없어(실측) 랩 정체로만 감지하므로 사유를 알 수 없다(docs/25 §리타이어).
export type RaceRetirement = {
  driverNumber: number;
  // 마지막 완주 랩(nowMs 까지).
  lap: number;
};

// 피트가 몰린 랩 구간. 인접 랩의 피트를 한 구간으로 묶은 것.
export type PitWave = {
  startLap: number;
  endLap: number;
  // 이 구간에서 피트한 대수.
  count: number;
};

// 그리드(positions 시계열 첫값) 대비 nowMs 순위 이동. from 은 그리드라 페널티 반영 그리드와
// L1 순위가 다를 수 있다(입력이 OpenF1SessionData 뿐이라 startingPosition 을 못 쓴다, docs/25).
export type RaceMover = {
  driverNumber: number;
  // 그리드 순위(positions 첫값).
  from: number;
  // nowMs 현재 순위.
  to: number;
  // 상승 폭(from - to). 양수면 앞으로, 음수면 뒤로.
  delta: number;
};

// 패스티스트 랩. date_start <= nowMs 로 게이팅해 재계산한다(기존 FastestLap 이벤트 루프는
// nowMs 게이팅이 없어 미래 랩이 새므로 재사용하지 않는다, docs/25 §기존 유틸 재사용).
export type RaceFastestLap = {
  driverNumber: number;
  lapSeconds: number;
  lap: number;
};

// 노면 전환. lap 은 전환 시각의 리더 랩(아직 랩이 없으면 null), toWet 은 wet 으로 바뀌었는지.
export type WeatherShift = {
  lap: number | null;
  toWet: boolean;
};

// SC·VSC 개시 구간. kind 로 풀 SC / VSC 를 구분하고 startLap 은 개시 랩.
export type SafetyCarPeriod = {
  kind: SafetyCarKind;
  startLap: number;
};

// 피트 집계. 개별 pit_stop 이벤트엔 없는 시간 축(중앙값)을 여기서 준다.
export type PitContextSummary = {
  totalStops: number;
  // pit_duration 중앙값(초). null 값(시간 미기록)은 제외하고 계산하며, 유효 표본이 없으면 null.
  medianDurationSeconds: number | null;
};

// 드라이버 한 명의 스틴트 맥락. 현재 compound·tireAgeLaps 는 스냅샷 driver 에 이미 있으므로
// 중복 저장하지 않는다 — 스냅샷만으로는 알 수 없는 값(몇 번째 스틴트·직전 compound·시작 랩·
// 마지막 피트 랩)만 추가한다.
export type StintContextSummary = {
  driverNumber: number;
  // 지금까지 시작한 스틴트 수(현재 스틴트 포함). "몇 번째 스틴트인가"의 맥락.
  stintCount: number;
  // 현재 스틴트가 시작된 절대 랩. 스냅샷 tireAgeLaps 만으로는 tyre_age_at_start 오프셋 때문에
  // 역산할 수 없어 새로 담는 값이다.
  currentStintStartLap: number | null;
  // 직전 스틴트의 compound. 전략 흐름(예: MEDIUM → HARD)의 맥락. 첫 스틴트면 null.
  previousCompound: TireCompound | null;
  // 마지막 피트 정지 랩. 스냅샷엔 pitStopCount 만 있고 랩은 없다. 피트 전이면 null.
  lastPitLap: number | null;
};

// 추월 집계. 개별 추월 214건을 한 덩어리로 압축한다(docs/22 §2).
export type OvertakeContextSummary = {
  total: number;
  // 가장 많이 추월한 드라이버와 그 횟수. 추월 데이터가 없으면 각각 null·0.
  mostActiveDriverNumber: number | null;
  mostActiveCount: number;
};
