import { WatchNowSignalType } from "./WatchNowSignalType";

// 감지기가 낸 한 건의 신호. LLM 을 거치지 않은 순수 계산 결과다
// (docs/19-watch-now.md §원칙: 결정론적 코어, 확률적 엣지).
//
// 필드를 optional 이 아니라 전부 `| null` 로 둔 이유: optional 은
// `noUncheckedIndexedAccess` 아래에서 읽는 쪽마다 분기를 강요한다.
// 종류별로 어떤 필드가 채워지는지는 아래 주석에 고정한다.
export type WatchNowSignal = {
  type: WatchNowSignalType;
  // 신호의 주체 — 알림을 받아야 할 드라이버다.
  // C(언더컷)의 주체는 피트인한 뒤차가 아니라 "아직 안 들어간 앞차" 쪽이다.
  driverNumber: number;
  driverCode: string;
  // 신호 발생 시점의 세션 랩. 스냅샷에 없으면 null.
  lapNumber: number | null;
  // 신호를 만든 스냅샷의 generatedAt (ISO).
  detectedAt: string;
  // A 에서 채워진다 — 임계에 도달한 시점의 타이어 나이.
  tireAgeLaps: number | null;
  // B 에서 채워진다 — 발화 시점의 앞차 간격(초).
  gapSeconds: number | null;
  // C 에서 채워진다 — 피트인해 위협이 된 뒤차.
  rivalDriverNumber: number | null;
  rivalDriverCode: string | null;
  // D 에서 채워진다 — 기준점 순위와 발화 시점 순위.
  positionFrom: number | null;
  positionTo: number | null;
};
