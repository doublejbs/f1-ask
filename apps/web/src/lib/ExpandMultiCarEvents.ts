import { LiveDriverState, RaceEvent } from "@f1/domain";

// 다중 차량 인시던트에서 params.driverCodes 가 코드를 잇는 구분자.
// 생성 측(OpenF1RaceControlEvents)이 `cars.map(...).join(",")` 로 만든다.
const DRIVER_CODES_SEPARATOR = ",";

// 드라이버 코드 → 번호 로스터. 대소문자 차이를 흡수하려고 키를 대문자로 맞춘다.
export const buildDriverNumberByCode = (
  drivers: readonly LiveDriverState[],
): Map<string, number> => {
  const byCode = new Map<string, number>();

  for (const driver of drivers) {
    const code = driver.code.trim().toUpperCase();

    if (code.length === 0) {
      continue;
    }

    byCode.set(code, driver.driverNumber);
  }

  return byCode;
};

// params.driverCodes 를 쉼표로 분해해 로스터에서 번호를 찾는다.
// **부분 문자열 매칭을 하지 않는다** — 분해한 각 토큰을 트림한 뒤 정확히 일치시킨다.
// ("HAM" 이 "HAMILTON" 이나 "CHAM" 에 걸리면 엉뚱한 차에 페널티가 붙는다)
const resolveDriverNumbers = (
  driverCodes: unknown,
  numberByCode: Map<string, number>,
): number[] => {
  if (typeof driverCodes !== "string") {
    return [];
  }

  const numbers: number[] = [];

  for (const token of driverCodes.split(DRIVER_CODES_SEPARATOR)) {
    const code = token.trim().toUpperCase();

    if (code.length === 0) {
      continue;
    }

    const driverNumber = numberByCode.get(code);

    // 로스터에 없는 코드는 번호를 알 수 없어 마커를 붙일 대상이 없다.
    if (driverNumber === undefined) {
      continue;
    }

    if (!numbers.includes(driverNumber)) {
      numbers.push(driverNumber);
    }
  }

  return numbers;
};

// 다중 차량 인시던트를 차량 수만큼 복제해 각 차량에 driverNumber 를 채운 목록을 만든다.
//
// 도메인의 `selectDriverStateMarkers` 는 `event.driverNumber`(첫 차량)에만 마커를
// 붙인다 — 코드→번호 매핑이 도메인에 없기 때문이다. UI 에는 `snapshot.drivers`
// 로스터가 있으므로 여기서 보정한다. (docs/14-event-placement.md)
//
// 셀렉터에 넣기 **전에** 이벤트를 복제하는 방식을 택한 이유: 셀렉터가 나중에
// 마커를 복사하는 것보다 정확하다. 페널티 합산·조사 종결 같은 접기 규칙이
// 각 차량에 대해 셀렉터 안에서 그대로 돌아간다.
//
// 순수 함수이며 예외를 던지지 않는다. 원본 배열과 이벤트 객체를 변경하지 않는다.
export const expandMultiCarEvents = (
  events: readonly RaceEvent[],
  drivers: readonly LiveDriverState[],
): RaceEvent[] => {
  const numberByCode = buildDriverNumberByCode(drivers);
  const expanded: RaceEvent[] = [];

  for (const event of events) {
    const driverNumbers = resolveDriverNumbers(
      event.params.driverCodes,
      numberByCode,
    );

    // 단일 차량이거나 로스터에서 아무 코드도 못 찾으면 원본을 그대로 둔다.
    if (driverNumbers.length <= 1) {
      expanded.push(event);

      continue;
    }

    for (const driverNumber of driverNumbers) {
      expanded.push({
        ...event,
        driverNumber,
        // 복제본이 서로 다른 이벤트임을 id 로도 드러낸다(셀렉터는 id 를 쓰지 않지만
        // 이 목록이 다른 곳으로 흘러가도 키가 충돌하지 않게 한다).
        id: `${event.id}:${driverNumber}`,
      });
    }
  }

  return expanded;
};
