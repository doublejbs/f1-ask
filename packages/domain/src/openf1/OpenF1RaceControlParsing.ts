import { InvestigationStatus } from "../InvestigationStatus";
import { RaceIncidentReason } from "../RaceIncidentReason";
import { OpenF1RaceControlCategory } from "./OpenF1RaceControlCategory";
import { OpenF1RaceControlFlag } from "./OpenF1RaceControlFlag";
import { OpenF1RaceControlScope } from "./OpenF1RaceControlScope";

// race_control 응답 파싱 헬퍼.
// 구조화 필드(category/flag/scope)를 enum 으로 좁히고, 구조화가 불가능한 항목만
// 메시지 문자열에서 뽑아낸다. 어떤 입력에도 예외를 던지지 않는다.

const CATEGORY_VALUES = new Set<string>(
  Object.values(OpenF1RaceControlCategory),
);
const FLAG_VALUES = new Set<string>(Object.values(OpenF1RaceControlFlag));
const SCOPE_VALUES = new Set<string>(Object.values(OpenF1RaceControlScope));
const INCIDENT_REASON_VALUES = new Set<string>(
  Object.values(RaceIncidentReason),
);

// 알 수 없는 값은 예외 대신 null 로 흘려 무시한다.
export const parseRaceControlCategory = (
  value: string | null | undefined,
): OpenF1RaceControlCategory | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return CATEGORY_VALUES.has(value)
    ? (value as OpenF1RaceControlCategory)
    : null;
};

export const parseRaceControlFlag = (
  value: string | null | undefined,
): OpenF1RaceControlFlag | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return FLAG_VALUES.has(value) ? (value as OpenF1RaceControlFlag) : null;
};

export const parseRaceControlScope = (
  value: string | null | undefined,
): OpenF1RaceControlScope | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return SCOPE_VALUES.has(value) ? (value as OpenF1RaceControlScope) : null;
};

export type ParsedIncidentCar = {
  driverNumber: number;
  driverCode: string;
};

const CAR_PATTERN = /CARS?\s+(\d+)\s*\((\w+)\)/g;
// 복수형 `CARS` 절이 있을 때만 두 번째 이후 차량을 추가로 수집한다.
const PLURAL_CARS_PATTERN = /CARS\s+\d+\s*\(\w+\)/;
// "CARS 44 (HAM) AND 63 (RUS)" 처럼 두 번째 차량에는 CAR 접두사가 없다.
// 접두사 없이 `숫자 (코드)` 만 훑으면 "LAP 12 (SC)" 같은 구간을 유령 차량으로 잡으므로
// 반드시 구분자(`AND` / `,`)에 앵커링한다.
const ADDITIONAL_CAR_PATTERN = /(?:\bAND|,)\s+(\d+)\s*\(([A-Z]{2,4})\)/g;
const TURN_PATTERN = /TURN\s+(\d+)/;
const PENALTY_SECONDS_PATTERN = /(\d+)\s+SECOND(?:S)?\s+(?:TIME\s+)?PENALTY/;
const RAIN_PERCENT_PATTERN = /RISK OF RAIN.*?IS\s+(\d+)\s*%/;
// 말미 시각 괄호 `(HH:MM:SS)` 는 사유 구간에 포함되지 않는다.
const TRAILING_TIME_PATTERN = /\s*\(\d{1,2}:\d{2}:\d{2}\)\s*$/;
// 사유 구간 구분자. 하이픈이 여러 개인 문구에서는 **마지막** 구분자 뒤가 사유다.
const REASON_SEPARATOR_PATTERN = /\s+-\s+/g;

const CONCLUDED_TEXTS = [
  "NO FURTHER ACTION",
  "NO FURTHER INVESTIGATION",
  "INVESTIGATION COMPLETE",
];
const UNDER_INVESTIGATION_TEXTS = [
  "WILL BE INVESTIGATED",
  "UNDER INVESTIGATION",
];
const NOTED_TEXT = "NOTED";

const collectCars = (
  message: string,
  pattern: RegExp,
  into: Map<number, ParsedIncidentCar>,
): void => {
  for (const match of message.matchAll(pattern)) {
    const rawNumber = match[1];
    const code = match[2];

    if (rawNumber === undefined || code === undefined) {
      continue;
    }

    const driverNumber = Number.parseInt(rawNumber, 10);

    if (Number.isNaN(driverNumber) || into.has(driverNumber)) {
      continue;
    }

    into.set(driverNumber, { driverNumber, driverCode: code });
  }
};

// `CARS` 절만 잘라낸다. 사유 구간(` - ` 이후)까지 훑으면 사유 문구 안의 숫자·약어를
// 차량으로 오인할 수 있다.
const takeCarsClause = (message: string, fromIndex: number): string => {
  const rest = message.slice(fromIndex);
  const separator = /\s+-\s+/.exec(rest);

  if (separator === null) {
    return rest;
  }

  return rest.slice(0, separator.index);
};

// "CARS 44 (HAM) AND 63 (RUS)" 처럼 복수로 등장하는 차량을 모두 수집한다.
export const parseIncidentCars = (message: string): ParsedIncidentCar[] => {
  const cars = new Map<number, ParsedIncidentCar>();

  collectCars(message, CAR_PATTERN, cars);

  if (cars.size === 0) {
    return [];
  }

  const plural = PLURAL_CARS_PATTERN.exec(message);

  if (plural === null) {
    return [...cars.values()];
  }

  const clause = takeCarsClause(message, plural.index + plural[0].length);

  collectCars(clause, ADDITIONAL_CAR_PATTERN, cars);

  return [...cars.values()];
};

const parseFirstInt = (message: string, pattern: RegExp): number | null => {
  const match = pattern.exec(message);
  const raw = match?.[1];

  if (raw === undefined) {
    return null;
  }

  const value = Number.parseInt(raw, 10);

  return Number.isNaN(value) ? null : value;
};

export const parseTurnNumber = (message: string): number | null =>
  parseFirstInt(message, TURN_PATTERN);

export const parsePenaltySeconds = (message: string): number | null =>
  parseFirstInt(message, PENALTY_SECONDS_PATTERN);

export const parseRainPercent = (message: string): number | null =>
  parseFirstInt(message, RAIN_PERCENT_PATTERN);

const normalizeReasonPhrase = (phrase: string): string =>
  phrase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

// 사유 구간을 snake_case 키로 정규화한 뒤 알려진 값만 채택한다.
// 모르는 문구는 영어 원문 노출을 막기 위해 버린다.
//
// 하이픈이 여러 개인 스튜어드 문구가 존재한다.
//   "... 5 SECOND TIME PENALTY FOR CAR 1 (VER) - CAUSING A COLLISION - TURN 4 (15:10:00)"
// 최좌측 구분자만 보면 "CAUSING A COLLISION - TURN 4" 를 통째로 잡아 매치에 실패하고,
// 최우측만 보면 "TURN 4" 를 잡아 역시 실패한다. 따라서 구분자로 나눈 뒤
// **뒤에서부터** 훑어 알려진 사유에 처음 걸리는 구간을 채택한다.
export const parseIncidentReason = (
  message: string,
): RaceIncidentReason | null => {
  const body = message.replace(TRAILING_TIME_PATTERN, "");
  const segments = body.split(REASON_SEPARATOR_PATTERN);

  // 첫 구간은 사유가 아니라 인시던트 본문이므로 제외한다.
  for (let index = segments.length - 1; index >= 1; index -= 1) {
    const segment = segments[index];

    if (segment === undefined) {
      continue;
    }

    const normalized = normalizeReasonPhrase(segment);

    if (INCIDENT_REASON_VALUES.has(normalized)) {
      return normalized as RaceIncidentReason;
    }
  }

  return null;
};

// NOTED 는 접수이지 종결이 아니다. 종결 통보는 별도 문구로 온다.
// 판정 우선순위: 종결 > 조사 중 > 접수.
export const parseInvestigationStatus = (
  message: string,
): InvestigationStatus | null => {
  if (CONCLUDED_TEXTS.some((text) => message.includes(text))) {
    return InvestigationStatus.Concluded;
  }

  if (UNDER_INVESTIGATION_TEXTS.some((text) => message.includes(text))) {
    return InvestigationStatus.UnderInvestigation;
  }

  if (message.includes(NOTED_TEXT)) {
    return InvestigationStatus.Noted;
  }

  return null;
};
