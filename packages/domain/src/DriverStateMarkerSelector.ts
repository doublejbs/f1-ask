import { DriverStateMarkerKind } from "./DriverStateMarkerKind";
import { InvestigationStatus } from "./InvestigationStatus";
import { RaceEvent, RaceEventParams } from "./RaceEvent";
import { RaceEventType } from "./RaceEventType";

// 순위 행에 붙는 드라이버 지속 마커 (docs/14-event-placement.md "드라이버 지속 상태").
export type DriverStateMarker = {
  kind: DriverStateMarkerKind;
  driverNumber: number;
  // 페널티 누적 초. 초를 파싱하지 못한 페널티만 있으면 null 이며 UI 는 `PEN` 으로 표시한다.
  penaltySeconds: number | null;
  // 페널티 건수. 초를 모르는 페널티도 포함한다.
  penaltyCount: number;
  // 조사 상태. Concluded 는 마커가 만들어지지 않으므로 나타나지 않는다.
  investigationStatus: InvestigationStatus | null;
  // 마커를 만든 최신 이벤트의 params (조사 사유 등 표시에 쓴다).
  params: RaceEventParams;
  // 마커가 처음 붙은 시각(ISO).
  sinceTimestamp: string;
};

// 조사 상태 문자열을 InvestigationStatus 로 좁힌다. 모르는 값은 null.
const readInvestigationStatus = (value: unknown): InvestigationStatus | null => {
  const known = Object.values(InvestigationStatus).find(
    (status) => status === value,
  );

  return known ?? null;
};

// params 에서 유한한 숫자만 꺼낸다.
const readParamNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

// 이벤트 timestamp 를 밀리초로 바꾼다. 파싱 불가면 null.
const readTimestampMs = (timestamp: string): number | null => {
  const ms = Date.parse(timestamp);

  return Number.isNaN(ms) ? null : ms;
};

// 페널티 이벤트를 기존 마커에 누적한다.
//
// 누적(교체 아님)을 택한 근거:
//   1) F1 규정상 5초 페널티 두 건은 실제로 합산 +10초다. 최신 값으로 교체하면
//      두 번째 페널티가 첫 번째를 지워 총 벌점이 과소 표시된다.
//   2) OpenF1 은 페널티 소화 여부를 주지 않아 "이미 반영됐으니 교체" 근거가 없다.
//   3) 같은 페널티가 반복 수신되는 위험은 상류에서 이미 막혀 있다 —
//      폴러가 stateKey/stateValue 로 중복 전이를 걸러내고, 저장 단계에서
//      deduplicationKey 로 한 번 더 걸러낸다. 여기 도달하는 페널티는 서로 다른 건이다.
const accumulatePenalty = (
  previous: DriverStateMarker | undefined,
  event: RaceEvent,
  driverNumber: number,
): DriverStateMarker => {
  const seconds = readParamNumber(event.params.penaltySeconds);
  const previousSeconds = previous?.penaltySeconds ?? null;
  const totalSeconds =
    seconds === null
      ? previousSeconds
      : (previousSeconds ?? 0) + seconds;

  return {
    kind: DriverStateMarkerKind.Penalty,
    driverNumber,
    penaltySeconds: totalSeconds,
    penaltyCount: (previous?.penaltyCount ?? 0) + 1,
    investigationStatus: null,
    params: event.params,
    sinceTimestamp: previous?.sinceTimestamp ?? event.timestamp,
  };
};

// 드라이버 번호별 활성 지속 마커를 만든다. 순수 함수이며 예외를 던지지 않는다.
//
// - `Penalty` 는 해제 조건이 데이터에 없어 세션이 끝날 때까지 유지되며 누적된다.
// - `Investigation` 은 `params.status` 가 `concluded` 면 마커를 제거한다.
//   한 드라이버의 조사 건을 인시던트별로 구분할 식별자가 데이터에 없어
//   드라이버당 최신 조사 1건만 추적한다.
// - `Retirement` 는 마커를 만들지 않는다(기존 `retired` 플래그로 충분).
// - 다중 차량 인시던트는 `event.driverNumber`(첫 차량)만 번호가 채워지므로
//   나머지 차량에는 마커가 붙지 않는다. 코드→번호 매핑이 도메인에 없기 때문이다.
// - `atMs` 를 주면 그 시각까지의 이벤트만 반영한다(경기 시계 기준).
export const selectDriverStateMarkers = (
  events: readonly RaceEvent[],
  atMs?: number,
): Map<number, DriverStateMarker[]> => {
  const ordered = events
    .map((event) => ({ event, ms: readTimestampMs(event.timestamp) }))
    .filter(
      (entry): entry is { event: RaceEvent; ms: number } => entry.ms !== null,
    )
    .filter((entry) => atMs === undefined || entry.ms <= atMs)
    .sort((a, b) => a.ms - b.ms);

  const penalties = new Map<number, DriverStateMarker>();
  const investigations = new Map<number, DriverStateMarker>();

  for (const { event } of ordered) {
    const driverNumber = event.driverNumber;

    if (driverNumber === undefined) {
      continue;
    }

    if (event.type === RaceEventType.Penalty) {
      penalties.set(
        driverNumber,
        accumulatePenalty(penalties.get(driverNumber), event, driverNumber),
      );

      continue;
    }

    if (event.type === RaceEventType.Investigation) {
      const status = readInvestigationStatus(event.params.status);

      // 종결됐거나 상태를 알 수 없으면 마커를 유지할 근거가 없다.
      if (status === null || status === InvestigationStatus.Concluded) {
        investigations.delete(driverNumber);

        continue;
      }

      const previous = investigations.get(driverNumber);

      investigations.set(driverNumber, {
        kind: DriverStateMarkerKind.Investigation,
        driverNumber,
        penaltySeconds: null,
        penaltyCount: 0,
        investigationStatus: status,
        params: event.params,
        sinceTimestamp: previous?.sinceTimestamp ?? event.timestamp,
      });
    }
  }

  const markers = new Map<number, DriverStateMarker[]>();

  // 페널티가 조사보다 중요하므로 앞에 둔다(행 슬롯이 하나면 앞의 것이 이긴다).
  for (const [driverNumber, marker] of penalties) {
    markers.set(driverNumber, [marker]);
  }

  for (const [driverNumber, marker] of investigations) {
    const existing = markers.get(driverNumber);

    if (existing === undefined) {
      markers.set(driverNumber, [marker]);

      continue;
    }

    existing.push(marker);
  }

  return markers;
};
