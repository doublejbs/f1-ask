import { RaceEvent } from "../RaceEvent";
import { RaceEventType } from "../RaceEventType";
import { JsonSchemaType } from "./JsonSchemaType";
import { DriverEventQuery, queryDriverEvents } from "./QueryDriverEvents";

// provider 중립 툴 정의.
//
// **왜 여기서 한 벌만 두는가:** 세 provider(Gemini functionDeclarations · Claude tools/tool_use
// · OpenAI tools/function)의 wire 포맷은 다르지만 툴의 스키마·이름·실행은 하나여야 한다
// (docs/26 §툴 호출 추상화, 수용 기준 4 "세 벌 안 만든다"). provider 어댑터는 이 정의를
// 자기 wire 포맷으로 변환만 하고, 무엇을 조회하는지는 모른다.

// JSON-schema 부분집합의 한 프로퍼티. type + (배열이면) items + (열거면) enum 만 담는다.
export type ToolPropertySchema = {
  type: JsonSchemaType;
  description?: string;
  // 배열 요소 타입 (type 이 Array 일 때).
  items?: ToolPropertySchema;
  // 허용 값 목록 (RaceEventType 등 닫힌 집합).
  enum?: string[];
};

// 툴 파라미터 스키마 — 항상 object 루트다.
export type ToolParameterSchema = {
  type: JsonSchemaType.Object;
  properties: Record<string, ToolPropertySchema>;
  required?: string[];
};

export type QuestionToolDefinition = {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
};

// 툴 실행 추상화. provider 는 이름·args 만 넘기고 이 executor 를 호출만 한다 —
// 실제 조회 대상(픽스처 이벤트 / Firestore 이벤트)은 executor 팩토리가 캡슐화한다.
export type QuestionToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

// 툴 이름은 한곳에서 상수로 — provider 어댑터·executor·정의가 같은 문자열을 참조하게 한다.
export const QUERY_DRIVER_EVENTS_TOOL_NAME = "queryDriverEvents";

// enum 전체 값을 스키마 enum 으로 노출한다. 모델이 유효한 type 만 넣도록 유도한다.
const EVENT_TYPE_VALUES: string[] = Object.values(RaceEventType);

// 모델이 언제 쓸지 알 만큼 구체적으로 쓴다. 프롬프트 문자열이므로(SYSTEM_RULES 와 같은
// 성격) 모델 이해도를 위해 영어로 둔다 — 시스템 프롬프트 언어와 맞춘다.
export const QUESTION_TOOL_DEFINITIONS: QuestionToolDefinition[] = [
  {
    name: QUERY_DRIVER_EVENTS_TOOL_NAME,
    description: [
      "Query a driver's full event history (pit stops, investigations, penalties, etc.) across the whole race.",
      "Use this to reach past events that fall outside the recent events already in the context —",
      "for example an early-race pit stop or an incident many laps ago that is no longer in the recent-40 window.",
      "Filter by driver and/or event type; lapFrom/lapTo only apply to types that record a lap (not overtake/fastest_lap).",
    ].join(" "),
    parameters: {
      type: JsonSchemaType.Object,
      properties: {
        driverNumber: {
          type: JsonSchemaType.Integer,
          description: "Car number of the driver. Omit to query all drivers.",
        },
        driverCode: {
          type: JsonSchemaType.String,
          description:
            "Three-letter driver code (e.g. VER). Helps match multi-car incidents.",
        },
        types: {
          type: JsonSchemaType.Array,
          description: "Event types to include. Omit to include all types.",
          items: { type: JsonSchemaType.String, enum: EVENT_TYPE_VALUES },
        },
        lapFrom: {
          type: JsonSchemaType.Integer,
          description: "Inclusive lower lap bound.",
        },
        lapTo: {
          type: JsonSchemaType.Integer,
          description: "Inclusive upper lap bound.",
        },
        limit: {
          type: JsonSchemaType.Integer,
          description: "Maximum number of results (default 50).",
        },
      },
    },
  },
];

// 유한한 숫자만 통과시킨다. 모델이 문자열 "1" 이나 NaN 을 줘도 안전하게 버린다.
const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return undefined;
};

// 공백만 있는 문자열은 필터로 취급하지 않는다.
const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return undefined;
};

const VALID_EVENT_TYPES = new Set<string>(EVENT_TYPE_VALUES);

// 유효한 RaceEventType 만 남긴다. 하나도 없으면 미지정(전 타입)으로 취급한다.
const toEventTypes = (value: unknown): RaceEventType[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const types = value.filter(
    (item): item is RaceEventType =>
      typeof item === "string" && VALID_EVENT_TYPES.has(item),
  );

  if (types.length === 0) {
    return undefined;
  }

  return types;
};

// 모델이 준 임의 args → 검증된 DriverEventQuery. 잘못된 타입 축은 조용히 빼서
// "필터 안 함"으로 처리한다 — 크래시 없이 항상 안전한 질의를 만든다.
const toDriverEventQuery = (args: Record<string, unknown>): DriverEventQuery => {
  const query: DriverEventQuery = {};

  const driverNumber = toFiniteNumber(args.driverNumber);

  if (driverNumber !== undefined) {
    query.driverNumber = driverNumber;
  }

  const driverCode = toNonEmptyString(args.driverCode);

  if (driverCode !== undefined) {
    query.driverCode = driverCode;
  }

  const types = toEventTypes(args.types);

  if (types !== undefined) {
    query.types = types;
  }

  const lapFrom = toFiniteNumber(args.lapFrom);

  if (lapFrom !== undefined) {
    query.lapFrom = lapFrom;
  }

  const lapTo = toFiniteNumber(args.lapTo);

  if (lapTo !== undefined) {
    query.lapTo = lapTo;
  }

  const limit = toFiniteNumber(args.limit);

  if (limit !== undefined) {
    query.limit = limit;
  }

  return query;
};

// 이벤트 배열을 캡슐화한 executor 를 만든다.
//
// 테스트는 픽스처 전체 이벤트로, 프로덕션(후속)은 Firestore 이벤트로 같은 팩토리를 쓴다 —
// provider 는 executor 만 호출하므로 조회 대상이 무엇이든 코드가 갈라지지 않는다.
export const createDriverEventsExecutor = (
  events: RaceEvent[],
): QuestionToolExecutor => {
  return async (name, args) => {
    // 이 executor 는 queryDriverEvents 하나만 안다. 다른 이름은 조용히 빈 결과로 처리해
    // 모델의 오타·미지원 툴 호출이 루프를 깨지 않게 한다.
    if (name !== QUERY_DRIVER_EVENTS_TOOL_NAME) {
      return [];
    }

    const query = toDriverEventQuery(args);

    return queryDriverEvents(events, query);
  };
};
