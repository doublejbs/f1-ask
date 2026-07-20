import { RaceEvent } from "./RaceEvent";

// 다중 차량 인시던트에서 params.driverCodes 가 코드를 잇는 구분자.
// (OpenF1RaceControlEvents 가 `cars.map(...).join(",")` 로 만든다.)
const DRIVER_CODES_SEPARATOR = ",";

// params 값에서 문자열만 꺼낸다. 숫자·불리언·null 은 코드 비교 대상이 아니다.
const readParamString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? null : trimmed;
};

// params.driverCodes(예: "HAM,RUS")를 쉼표로 분해해 정확히 일치하는지 본다.
// includes 로 부분 일치를 보면 "HA" 나 "HAMX" 같은 값에 오탐한다.
const hasDriverCodeInList = (
  value: unknown,
  driverCode: string,
): boolean => {
  const raw = readParamString(value);

  if (raw === null) {
    return false;
  }

  return raw
    .split(DRIVER_CODES_SEPARATOR)
    .some((code) => code.trim() === driverCode);
};

// 이벤트가 해당 드라이버와 연관되는지 판정한다 (docs/13-race-console.md 원칙 3).
// 매칭 경로는 세 가지이며, 이벤트 생성 측이 어느 하나만 채우는 경우가 있어 모두 본다.
//   1) 번호 — event.driverNumber / event.targetDriverNumber
//   2) 코드 — params.driverCode / params.targetDriverCode
//   3) 다중 차량 — params.driverCodes(쉼표 목록)
export const matchesDriverEvent = (
  event: RaceEvent,
  driverNumber: number,
  driverCode?: string,
): boolean => {
  if (
    event.driverNumber === driverNumber ||
    event.targetDriverNumber === driverNumber
  ) {
    return true;
  }

  const code = readParamString(driverCode);

  if (code === null) {
    return false;
  }

  if (
    readParamString(event.params.driverCode) === code ||
    readParamString(event.params.targetDriverCode) === code
  ) {
    return true;
  }

  return hasDriverCodeInList(event.params.driverCodes, code);
};

// 해당 드라이버와 연관된 이벤트만 남긴다. 입력 순서를 그대로 보존한다
// (정렬·개수 제한은 호출 측 관심사다).
export const filterEventsByDriver = (
  events: readonly RaceEvent[],
  driverNumber: number,
  driverCode?: string,
): RaceEvent[] =>
  events.filter((event) => matchesDriverEvent(event, driverNumber, driverCode));
