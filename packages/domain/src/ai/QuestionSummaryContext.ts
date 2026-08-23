import { LiveRaceContextSummary } from "../LiveRaceContextSummary";
import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import {
  combineMinimums,
  MANDATORY_RACE_MINIMUMS,
  remainingSetCount,
  remainingTirePossibilities,
  summarizeRemainingRanges,
  totalReturnedSets,
  WeekendFormat,
} from "../tire/TireAllocation";
import { remainingMinimumsFromCompoundUses } from "../tire/WeekendTires";

// 스냅샷의 결정론적 컨텍스트를 질문용 JSON 형태로 만든다 (docs/22 §B, C1·C4).
//
// **세 provider(Claude·Gemini·OpenAI)가 이 함수 하나를 호출한다.** 요약 주입을 세 곳에
// 각자 두면 컨텍스트가 갈라진다. 여기에 워커 집계(피트·스틴트·추월)에 더해 **추월 예측(C4)**
// 과 **드라이버별 타이어 전략(C1)** 을 실어, AI 가 "누가 곧 추월?" · "X 타이어 몇 세트 남았어?"
// 같은 질문에 답할 수 있게 한다. 전부 결정론이라 LLM 이 수치를 지어내지 않는다.
//
// 데이터가 없으면(mock·replay·옛 스냅샷) null 을 준다 — 프롬프트에 "요약 없음"이 명시되어
// LLM 이 필드를 지어내지 않게 한다.

// AI 컨텍스트용 추월 예측 한 건(C4). 스냅샷 필드를 그대로 옮긴다.
type ForecastView = {
  chaser: string;
  target: string;
  inLaps: number;
  confidence: string;
  gapSeconds: number;
};

// AI 컨텍스트용 드라이버 타이어 전략(C1). 사용 이력 + 규정 기반 잔여 추정.
type TireStrategyView = {
  code: string;
  usedCompounds: { compound: string; new: boolean }[];
  // 규정상 반납 후 보유 세트(정확). 일반 주말 기준.
  setsRemaining: number;
  // 컴파운드별 잔여 가능 범위(레이스 신품 사용분 + 레이스 의무 보유로 좁힘).
  remaining: { soft: [number, number]; medium: [number, number]; hard: [number, number] };
};

export type QuestionSummaryContext = LiveRaceContextSummary & {
  overtakeForecasts: ForecastView[] | null;
  tireStrategy: TireStrategyView[] | null;
};

const buildForecastViews = (snapshot: LiveRaceSnapshot): ForecastView[] | null => {
  const forecasts = snapshot.overtakeForecasts;

  if (forecasts === undefined || forecasts.length === 0) {
    return null;
  }

  const codeByNumber = new Map<number, string>();

  for (const driver of snapshot.drivers) {
    codeByNumber.set(driver.driverNumber, driver.code);
  }

  return forecasts.map((forecast) => ({
    chaser: codeByNumber.get(forecast.chaserNumber) ?? `#${forecast.chaserNumber}`,
    target: codeByNumber.get(forecast.targetNumber) ?? `#${forecast.targetNumber}`,
    inLaps: forecast.predictedLapsToBattle,
    confidence: forecast.confidence,
    gapSeconds: forecast.intervalSeconds,
  }));
};

// 규정 기반 잔여 추정(일반 주말). 하한 = 이번 레이스 신품 사용분 + 레이스 의무 보유.
// 주말 데이터가 없어도 레이스 스틴트만으로 컴파운드별 범위를 좁힌다(C1, docs/29).
const buildTireStrategyViews = (
  snapshot: LiveRaceSnapshot,
): TireStrategyView[] | null => {
  const stints = snapshot.contextSummary?.stints;

  if (stints === undefined || stints.length === 0) {
    return null;
  }

  const codeByNumber = new Map<number, string>();

  for (const driver of snapshot.drivers) {
    codeByNumber.set(driver.driverNumber, driver.code);
  }

  const format = WeekendFormat.Conventional;
  const returned = totalReturnedSets(format);
  const setsRemaining = remainingSetCount(format, returned);

  return stints.map((stint) => {
    const minimums = combineMinimums(
      remainingMinimumsFromCompoundUses(stint.usedCompounds),
      MANDATORY_RACE_MINIMUMS[format],
    );
    const narrowed = remainingTirePossibilities(format, returned, minimums);
    const possibilities =
      narrowed.length > 0 ? narrowed : remainingTirePossibilities(format, returned);
    const ranges = summarizeRemainingRanges(possibilities);

    return {
      code: codeByNumber.get(stint.driverNumber) ?? `#${stint.driverNumber}`,
      usedCompounds: stint.usedCompounds.map((use) => ({
        compound: use.compound,
        new: use.startedNew,
      })),
      setsRemaining,
      remaining: {
        soft: [ranges.soft.min, ranges.soft.max],
        medium: [ranges.medium.min, ranges.medium.max],
        hard: [ranges.hard.min, ranges.hard.max],
      },
    };
  });
};

export const toQuestionSummaryContext = (
  snapshot: LiveRaceSnapshot,
): QuestionSummaryContext | null => {
  const summary = snapshot.contextSummary ?? null;
  const overtakeForecasts = buildForecastViews(snapshot);
  const tireStrategy = buildTireStrategyViews(snapshot);

  if (summary === null && overtakeForecasts === null && tireStrategy === null) {
    return null;
  }

  // 집계(피트·스틴트·추월)를 그대로 펴고, 예측·타이어 전략을 더한다. summary 가 없으면
  // 그 키들은 빠지고 예측/타이어만 담긴다.
  return {
    ...(summary ?? ({} as LiveRaceContextSummary)),
    overtakeForecasts,
    tireStrategy,
  };
};
