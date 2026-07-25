import { matchesDriverEvent } from "../DriverEventFilter";
import { RaceEvent, RaceEventParams } from "../RaceEvent";
import { RaceEventType } from "../RaceEventType";

// 조회 1회가 프롬프트에 실을 수 있는 결과 상한.
//
// 왜 50 인가: 벨기에 GP 실측에서 한 타입·한 드라이버로 좁힌 결과는 수 건~수십 건이다
// (pit_stop 28·investigation 11 이 전 드라이버 합계). 드라이버·타입으로 좁힌 조회는
// 대개 이보다 훨씬 작다. 50 이면 "전 드라이버 pit_stop 전체" 같은 넓은 질의도 통째로
// 담으면서 토큰이 과하지 않다.
export const DEFAULT_DRIVER_EVENT_LIMIT = 50;

// 드라이버 이벤트 조회 조건. 모든 필드는 선택 — 미지정 축은 필터하지 않는다.
export type DriverEventQuery = {
  driverNumber?: number; // 없으면 전 드라이버
  // 코드로도 조회할 수 있게 연다. investigation 등 다중 차량 이벤트는 관련 차량을
  // params.driverCodes("HAM,RUS") 코드 목록에만 담고 숫자 필드엔 첫 차량만 넣는다.
  // 번호(63)만으로는 코드 목록의 상대 차량(RUS)을 못 잡으므로 코드를 함께 받는다.
  // (번호→코드 매핑 주입은 이 순수 함수의 책임이 아니다 — 호출자가 코드를 채운다.)
  driverCode?: string;
  types?: RaceEventType[]; // 없으면 전 타입
  lapFrom?: number; // 랩 범위 하한 (포함)
  lapTo?: number; // 랩 범위 상한 (포함)
  limit?: number; // 결과 상한 (기본 DEFAULT_DRIVER_EVENT_LIMIT)
};

// LLM 프롬프트에 실릴 컴팩트 투영. 원본 RaceEvent 의 id·deduplicationKey·schemaVersion·
// sessionId·priority 같은 노이즈는 뺀다 — 인과 추론에 쓰는 사실만 남긴다.
export type DriverEventResult = {
  type: RaceEventType;
  driverNumber: number | null;
  targetDriverNumber: number | null;
  lapNumber: number | null;
  timestamp: string;
  params: RaceEventParams; // 사유(reason)·turn·상대차 등 — LLM 이 인과에 쓴다
};

// 이벤트가 랩 범위 조건을 만족하는지.
//
// **랩 없는 타입은 랩 범위 질의에서 빠진다.** overtake·fastest_lap 등은 lapNumber 를
// 기록하지 않는다(관찰 실측). 랩 범위가 지정됐는데 이벤트에 랩이 없으면 "범위를 만족한다"고
// 볼 근거가 없으므로 제외한다. 랩 범위가 아예 없으면(lapFrom·lapTo 둘 다 미지정) 랩 없는
// 이벤트도 통과시킨다.
const matchesLapRange = (
  event: RaceEvent,
  lapFrom: number | undefined,
  lapTo: number | undefined,
): boolean => {
  const hasRange = lapFrom !== undefined || lapTo !== undefined;

  if (!hasRange) {
    return true;
  }

  if (event.lapNumber === undefined) {
    return false;
  }

  if (lapFrom !== undefined && event.lapNumber < lapFrom) {
    return false;
  }

  if (lapTo !== undefined && event.lapNumber > lapTo) {
    return false;
  }

  return true;
};

// 정렬 키: 랩 있는 이벤트를 앞에, 랩 없는 이벤트를 뒤로. 랩끼리는 오름차순.
const toLapRank = (lapNumber: number | undefined): number =>
  lapNumber === undefined ? Number.POSITIVE_INFINITY : lapNumber;

// timestamp 파싱 불가 시 가장 뒤로 민다 — 결정론을 위해 NaN 을 +Infinity 로 정규화한다.
const toTimestampMs = (timestamp: string): number => {
  const ms = Date.parse(timestamp);

  if (Number.isNaN(ms)) {
    return Number.POSITIVE_INFINITY;
  }

  return ms;
};

// RaceEvent → 컴팩트 투영. optional 번호·랩은 null 로 정규화한다.
const toResult = (event: RaceEvent): DriverEventResult => ({
  type: event.type,
  driverNumber: event.driverNumber ?? null,
  targetDriverNumber: event.targetDriverNumber ?? null,
  lapNumber: event.lapNumber ?? null,
  timestamp: event.timestamp,
  params: event.params,
});

// 드라이버 전체 이력을 결정론적으로 조회한다 — 순수 함수(원본 events 를 mutate 하지 않는다).
//
// 이 툴은 "40건 창 밖으로 밀린 pit 이벤트"를 구제하는 핵심 도구다(docs/26 §툴 세트).
// 최근 40건 대신, 드라이버·타입·랩 범위로 좁혀 전체 이력에서 필요한 사실만 뽑아 준다.
//
// 규칙:
//   - driverNumber/driverCode: matchesDriverEvent 로 위임 — 번호(driverNumber·
//     targetDriverNumber)·코드(params.driverCode·targetDriverCode)·다중 차량
//     코드 목록(params.driverCodes)을 모두 본다. 둘 다 미지정이면 전 드라이버
//   - types: 지정 시 그 타입만. 미지정이면 전 타입
//   - lapRange: lapFrom/lapTo 는 lap 있는 타입에만 적용된다(위 matchesLapRange 주석)
//   - 정렬: lapNumber 오름차순(null 은 뒤로), 동률이면 timestamp 오름차순 — 결정론
//   - limit: 넘으면 자른다. **오래된 것(랩 앞쪽)을 남긴다** — 깊은 질문은 대개 경기 전체
//     이력을 요구하므로, 시간순 앞쪽을 유지해 이력의 시작부터 읽히는 편이 자연스럽다
export const queryDriverEvents = (
  events: RaceEvent[],
  query: DriverEventQuery,
): DriverEventResult[] => {
  const limit = query.limit ?? DEFAULT_DRIVER_EVENT_LIMIT;

  if (limit <= 0) {
    return [];
  }

  const typeSet =
    query.types !== undefined && query.types.length > 0
      ? new Set(query.types)
      : null;

  const matched = events.filter((event) => {
    // 왜 위임: 두 벌 매처를 만들지 않고 검증된 3경로 매처(번호·코드·다중 차량 코드 목록)를
    // 재사용한다. 번호만 주면 첫 차량은 잡히고, 코드까지 주면 driverCodes 목록의 상대
    // 차량(예: RUS)도 잡힌다.
    if (
      (query.driverNumber !== undefined || query.driverCode !== undefined) &&
      !matchesDriverEvent(event, query.driverNumber, query.driverCode)
    ) {
      return false;
    }

    if (typeSet !== null && !typeSet.has(event.type)) {
      return false;
    }

    if (!matchesLapRange(event, query.lapFrom, query.lapTo)) {
      return false;
    }

    return true;
  });

  // 원본을 건드리지 않도록 복제본을 정렬한다.
  matched.sort((left, right) => {
    const lapDiff = toLapRank(left.lapNumber) - toLapRank(right.lapNumber);

    if (lapDiff !== 0) {
      return lapDiff;
    }

    return toTimestampMs(left.timestamp) - toTimestampMs(right.timestamp);
  });

  return matched.slice(0, limit).map(toResult);
};
