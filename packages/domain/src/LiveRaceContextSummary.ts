import { TireCompound } from "./TireCompound";

// 워커가 OpenF1 원본에서 계산해 스냅샷에 싣는 결정론적 요약 (docs/22-ai-context-summaries.md §B).
//
// 개별 이벤트로 흩어지면 소음이 되는 집계(피트·스틴트·추월)를 한 덩어리로 압축한다.
// 예: "피트 28회, 중앙값 24.7초, HAM 12랩째 하드로 교체". LLM 이 아니라 도메인이 계산하므로
// 환각이 없다(docs/02 §3.1 결정론적 코어).
//
// 모든 값은 "nowMs 시점까지"의 집계다 — 리플레이·라이브 모두 "지금까지"가 맞다.
// session_result 는 라이브 진행 중엔 비어 있으므로(실측) 여기에 넣지 않는다.
export type LiveRaceContextSummary = {
  pits: PitContextSummary;
  // 드라이버별 스틴트 맥락. 스냅샷에 없는 정보(스틴트 이력·시작 랩·마지막 피트 랩)만 담는다.
  stints: StintContextSummary[];
  overtakes: OvertakeContextSummary;
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
