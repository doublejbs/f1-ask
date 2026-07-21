// 감지기 임계값. docs/19-watch-now.md §감지기와 임계값 의 "채택" 열이 기본값이다.
//
// **상수를 코드에 박지 않고 설정으로 뺀 이유**: 위 표의 발화 수가 실제로 어떤 체감인지는
// 레이스를 보면서만 알 수 있다(docs/19 "임계값은 설정으로 뺀다"). 코드 수정 없이
// 조절 가능해야 하므로 감지기는 이 설정을 주입받는다.

// A. 타이어가 이 랩수에 도달하면 발화한다.
export const DEFAULT_TIRE_AGE_THRESHOLD_LAPS = 20;
// B. 앞차 간격이 이 값 아래로 내려가면 수렴으로 본다(초).
export const DEFAULT_GAP_THRESHOLD_SECONDS = 1.0;
// B. 위 조건이 연속 이만큼의 관측에서 유지되어야 발화한다.
//
// "연속 N회"는 시간이 아니라 관측 횟수 기준이다. 폴러 주기(약 6초)에 묶여 있으므로
// 3회 ≈ 18초의 지속적 근접을 뜻한다. 주기를 바꾸면 체감 지속시간도 함께 바뀐다.
export const DEFAULT_GAP_CONSECUTIVE_SAMPLES = 3;
// B. 간격이 임계의 이 배수를 넘으면 재무장한다 — 경계를 오가며 반복 발화하는 것을 막는다.
export const DEFAULT_GAP_REARM_MULTIPLIER = 2;
// C. 내 뒤 이 계단 이내의 차가 피트인하면 언더컷 위협으로 본다.
export const DEFAULT_UNDERCUT_POSITION_GAP = 2;
// D. 기준점 대비 이 계단 이상 순위가 변하면 발화한다.
export const DEFAULT_POSITION_SWING_THRESHOLD = 3;

export type WatchNowDetectorConfig = {
  tireAgeThresholdLaps: number;
  gapThresholdSeconds: number;
  gapConsecutiveSamples: number;
  gapRearmMultiplier: number;
  undercutPositionGap: number;
  positionSwingThreshold: number;
  // SC · VSC 중 간격 기반 감지(B)를 억제한다.
  //
  // SC 는 전 차량을 인위적으로 밀착시킨다 — 실측에서 동시 배틀 분포의 꼬리에 21 · 19 · 18개가
  // 찍힌 구간이 여기다(docs/19 §세이프티카 중 배틀 감지를 억제한다). 억제하지 않으면 가장
  // 시끄러운 순간에 가장 쓸모없는 알림이 쏟아진다.
  //
  // A · C · D 는 억제하지 않는다. SC 가 왜곡하는 것은 **간격**이지 순위나 피트 사실이
  // 아니다. 오히려 SC 중 피트인은 정지 손실이 작아 전략적으로 가장 결정적인 순간이므로
  // C 를 막으면 레이스에서 제일 중요한 알림을 잃는다.
  suppressGapDuringSafetyCar: boolean;
};

export const DEFAULT_WATCH_NOW_DETECTOR_CONFIG: WatchNowDetectorConfig = {
  tireAgeThresholdLaps: DEFAULT_TIRE_AGE_THRESHOLD_LAPS,
  gapThresholdSeconds: DEFAULT_GAP_THRESHOLD_SECONDS,
  gapConsecutiveSamples: DEFAULT_GAP_CONSECUTIVE_SAMPLES,
  gapRearmMultiplier: DEFAULT_GAP_REARM_MULTIPLIER,
  undercutPositionGap: DEFAULT_UNDERCUT_POSITION_GAP,
  positionSwingThreshold: DEFAULT_POSITION_SWING_THRESHOLD,
  suppressGapDuringSafetyCar: true,
};
