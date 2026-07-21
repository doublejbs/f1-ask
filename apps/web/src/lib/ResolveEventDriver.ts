import { LiveDriverState, RaceEvent } from "@f1/domain";

// 다중 차량 인시던트에서 params.driverCodes 가 코드를 잇는 구분자.
const DRIVER_CODES_SEPARATOR = ",";

// 코드로 로스터에서 드라이버를 찾는다. 트림 후 **정확히 일치**할 때만 매칭한다.
const findDriverByCode = (
  drivers: readonly LiveDriverState[],
  code: string,
): LiveDriverState | null => {
  const target = code.trim().toUpperCase();

  if (target.length === 0) {
    return null;
  }

  return (
    drivers.find((driver) => driver.code.trim().toUpperCase() === target) ?? null
  );
};

// 이벤트가 가리키는 드라이버를 로스터에서 찾는다. 특정할 수 없으면 null.
//
// 우선순위 (docs/14-event-placement.md "최신 이벤트 카드"):
//   1) event.driverNumber — 가장 확실한 식별자
//   2) params.driverCode — 단일 차량 이벤트
//   3) params.driverCodes 의 첫 차량 — 다중 차량 인시던트
//
// 순수 함수이며 예외를 던지지 않는다.
export const resolveEventDriver = (
  event: RaceEvent,
  drivers: readonly LiveDriverState[],
): LiveDriverState | null => {
  if (event.driverNumber !== undefined) {
    const byNumber = drivers.find(
      (driver) => driver.driverNumber === event.driverNumber,
    );

    if (byNumber !== undefined) {
      return byNumber;
    }
  }

  const code = event.params.driverCode;

  if (typeof code === "string") {
    const byCode = findDriverByCode(drivers, code);

    if (byCode !== null) {
      return byCode;
    }
  }

  const codes = event.params.driverCodes;

  if (typeof codes !== "string") {
    return null;
  }

  for (const token of codes.split(DRIVER_CODES_SEPARATOR)) {
    const byListedCode = findDriverByCode(drivers, token);

    if (byListedCode !== null) {
      return byListedCode;
    }
  }

  return null;
};
