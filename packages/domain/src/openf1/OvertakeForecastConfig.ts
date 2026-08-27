// 추월 예측 임계값 (docs/23-overtake-forecast.md §발화 조건). WatchNowDetectorConfig 패턴으로
// 상수를 코드에 박지 않고 설정으로 뺀다 — 값은 벨기에 GP 픽스처 실측으로 튜닝하며(docs/23 §설계),
// 코드 수정 없이 조절 가능해야 하기 때문이다.

// 이 간격(초) 안이면 "배틀 진입"으로 본다. 예측 랩 수 분모의 목표 간격이다.
export const DEFAULT_BATTLE_THRESHOLD_SECONDS = 1.0;
// 이 값(초) 이하는 TV 해설이 이미 담당하는 영역이라 예측하지 않는다.
export const DEFAULT_MIN_INTERVAL_SECONDS = 1.5;
// 잡는 속도가 이 값(초/랩) 미만이면 노이즈 수준이라 예측이라 부르지 않는다.
export const DEFAULT_MIN_CLOSING_RATE_SECONDS_PER_LAP = 0.15;
// 이 랩 수를 넘는 예측은 타이어 열화·피트로 무의미해 발화하지 않는다.
export const DEFAULT_MAX_LAPS_AHEAD = 10;
// 잡는 속도 계산에 쓰는 공통 유효 랩 수. 이보다 적으면 예측하지 않는다.
export const DEFAULT_RECENT_LAP_COUNT = 3;
// 본인 유효 랩 중앙값 대비 이 배율을 초과하는 랩은 이상치(SC 랩·트래픽)로 보고 제외한다.
export const DEFAULT_OUTLIER_RATIO = 1.05;

// 타이어 열화 반영(B1). 쫓는 차가 앞차보다 타이어가 낡았으면, 잡는 속도는 미래 랩으로 갈수록
// 준다(스틴트 나이 열화). 이를 매 미래 랩마다 잡는 속도에서 빼는 감쇠로 근사한다.
//   감쇠/랩 = closingRate × min(타이어 나이 열세 × 이 값, 상한)
// 이 값은 물리 상수가 아니라 **튜닝 가능한 휴리스틱**이다(픽스처 실측으로 조정). 앞차가
// 같거나 더 낡았으면 열세가 0 이라 감쇠도 0 → 기존 선형 예측 그대로다.
export const DEFAULT_TIRE_DEGRADATION_PER_AGE_LAP = 0.03;
// 감쇠가 한 랩에 잡는 속도의 이 비율을 넘지 않게 상한을 둔다(과도한 열세에서 폭주 방지).
export const DEFAULT_MAX_TIRE_DEGRADATION_FRACTION = 0.6;

export type OvertakeForecastConfig = {
  battleThresholdSeconds: number;
  minIntervalSeconds: number;
  minClosingRateSecondsPerLap: number;
  maxLapsAhead: number;
  recentLapCount: number;
  outlierRatio: number;
  // B1 타이어 열화.
  tireDegradationPerAgeLap: number;
  maxTireDegradationFraction: number;
};

export const DEFAULT_OVERTAKE_FORECAST_CONFIG: OvertakeForecastConfig = {
  battleThresholdSeconds: DEFAULT_BATTLE_THRESHOLD_SECONDS,
  minIntervalSeconds: DEFAULT_MIN_INTERVAL_SECONDS,
  minClosingRateSecondsPerLap: DEFAULT_MIN_CLOSING_RATE_SECONDS_PER_LAP,
  maxLapsAhead: DEFAULT_MAX_LAPS_AHEAD,
  recentLapCount: DEFAULT_RECENT_LAP_COUNT,
  outlierRatio: DEFAULT_OUTLIER_RATIO,
  tireDegradationPerAgeLap: DEFAULT_TIRE_DEGRADATION_PER_AGE_LAP,
  maxTireDegradationFraction: DEFAULT_MAX_TIRE_DEGRADATION_FRACTION,
};
