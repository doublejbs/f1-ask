import {
  LiveDriverState,
  LiveRaceContextSummary,
  LiveRaceSnapshot,
  OvertakeContextSummary,
  OvertakeForecast,
  OvertakeForecastConfidence,
  PitContextSummary,
  SessionStatus,
  StintContextSummary,
  TeamRadioClip,
  TireCompound,
  WeatherState,
} from "@f1/domain";
import { z } from "zod";

// Firestore/네트워크 경계에서 신뢰할 수 없는 데이터를 런타임 검증한다.
// (docs/02-architecture.md §19 Runtime Schema Validation)

export const weatherStateSchema = z.object({
  airTemperatureCelsius: z.number().nullable(),
  trackTemperatureCelsius: z.number().nullable(),
  humidityPercent: z.number().nullable(),
  rainfall: z.boolean(),
  windSpeedMps: z.number().nullable().optional(),
}) satisfies z.ZodType<WeatherState>;

export const liveDriverStateSchema = z.object({
  driverNumber: z.number().int(),
  code: z.string().min(1),
  fullName: z.string().min(1),
  teamName: z.string().min(1),
  position: z.number().int().nullable(),
  startingPosition: z.number().int().nullable(),
  positionChange: z.number().int().nullable(),
  gapToLeaderSeconds: z.number().nullable(),
  intervalToAheadSeconds: z.number().nullable(),
  intervalToBehindSeconds: z.number().nullable(),
  lastLapSeconds: z.number().nullable(),
  personalBestLapSeconds: z.number().nullable(),
  compound: z.nativeEnum(TireCompound),
  tireAgeLaps: z.number().int().nullable(),
  pitStopCount: z.number().int().nonnegative(),
  inPit: z.boolean(),
  retired: z.boolean(),
  recentLapTimesSeconds: z.array(z.number()),
  teamColour: z.string().nullable().optional(),
  headshotUrl: z.string().nullable().optional(),
  lastSectorsSeconds: z.array(z.number().nullable()).optional(),
  topSpeedKph: z.number().nullable().optional(),
}) satisfies z.ZodType<LiveDriverState>;

export const teamRadioClipSchema = z.object({
  driverNumber: z.number().int(),
  driverCode: z.string().min(1),
  recordingUrl: z.string().url(),
  timestamp: z.string(),
}) satisfies z.ZodType<TeamRadioClip>;

const pitContextSummarySchema = z.object({
  totalStops: z.number().int().nonnegative(),
  medianDurationSeconds: z.number().nullable(),
}) satisfies z.ZodType<PitContextSummary>;

const stintContextSummarySchema = z.object({
  driverNumber: z.number().int(),
  stintCount: z.number().int().nonnegative(),
  currentStintStartLap: z.number().int().nullable(),
  previousCompound: z.nativeEnum(TireCompound).nullable(),
  lastPitLap: z.number().int().nullable(),
  usedCompounds: z.array(
    z.object({
      compound: z.nativeEnum(TireCompound),
      startedNew: z.boolean(),
    }),
  ),
}) satisfies z.ZodType<StintContextSummary>;

const overtakeContextSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  mostActiveDriverNumber: z.number().int().nullable(),
  mostActiveCount: z.number().int().nonnegative(),
}) satisfies z.ZodType<OvertakeContextSummary>;

// 워커가 계산해 싣는 결정론적 요약. optional — mock·replay·옛 스냅샷엔 없다.
// 경계에서 방어적으로 파싱한다: 필드가 없으면 그냥 undefined 로 통과시킨다.
export const liveRaceContextSummarySchema = z.object({
  pits: pitContextSummarySchema,
  stints: z.array(stintContextSummarySchema),
  overtakes: overtakeContextSummarySchema,
}) satisfies z.ZodType<LiveRaceContextSummary>;

// 워커가 계산해 싣는 순위 인접 페어의 배틀 진입 예측. optional — mock·replay·옛 스냅샷엔 없다.
const overtakeForecastSchema = z.object({
  chaserNumber: z.number().int(),
  targetNumber: z.number().int(),
  intervalSeconds: z.number(),
  closingRateSecondsPerLap: z.number(),
  predictedLapsToBattle: z.number().int(),
  predictedLap: z.number().int(),
  confidence: z.nativeEnum(OvertakeForecastConfidence),
}) satisfies z.ZodType<OvertakeForecast>;

export const liveRaceSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  sessionId: z.string().min(1),
  sessionKey: z.number().int(),
  meetingKey: z.number().int(),
  sessionName: z.string().min(1),
  sessionType: z.string().min(1),
  circuitName: z.string().min(1),
  countryCode: z.string().min(1),
  status: z.nativeEnum(SessionStatus),
  currentLap: z.number().int().nullable(),
  totalLaps: z.number().int().nullable(),
  drivers: z.array(liveDriverStateSchema),
  weather: weatherStateSchema.optional(),
  teamRadios: z.array(teamRadioClipSchema).optional(),
  contextSummary: liveRaceContextSummarySchema.optional(),
  overtakeForecasts: z.array(overtakeForecastSchema).optional(),
  generatedAt: z.string().datetime(),
  sourceUpdatedAt: z.string().datetime(),
  version: z.number().int().nonnegative(),
}) satisfies z.ZodType<LiveRaceSnapshot>;

// 옛 워커가 쓴 라이브 스냅샷은 우리가 나중에 추가한 필드를 갖고 있지 않다:
//   - contextSummary.stints[].usedCompounds (PR: 사용한 타이어 경우의 수)
//   - overtakeForecasts[].confidence (PR: 추월 예측 신뢰도)
// 스키마는 이 필드들을 required 로 두고(mock·replay·우리 워커는 항상 채운다), 대신
// 경계에서 옛 스냅샷만 보정한다 — 없으면 기본값을 채워 전체 검증이 실패하지 않게 한다.
// 스키마 자체를 느슨하게 만들면(.catch) 입력 타입이 unknown 으로 넓어져 이 스키마를
// 조합하는 다른 스키마(AskAiSchema 등)의 satisfies 가 연쇄로 깨지므로, 보정은 여기서 한다.
const normalizeLegacyLiveSnapshot = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") {
    return value;
  }

  const snapshot = value as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  const contextSummary = snapshot.contextSummary;
  if (
    contextSummary !== null &&
    typeof contextSummary === "object" &&
    Array.isArray((contextSummary as Record<string, unknown>).stints)
  ) {
    const cs = contextSummary as Record<string, unknown>;
    const stints = (cs.stints as unknown[]).map((stint) => {
      if (
        stint !== null &&
        typeof stint === "object" &&
        (stint as Record<string, unknown>).usedCompounds === undefined
      ) {
        return { ...(stint as Record<string, unknown>), usedCompounds: [] };
      }
      return stint;
    });
    patch.contextSummary = { ...cs, stints };
  }

  if (Array.isArray(snapshot.overtakeForecasts)) {
    patch.overtakeForecasts = (snapshot.overtakeForecasts as unknown[]).map(
      (forecast) => {
        if (
          forecast !== null &&
          typeof forecast === "object" &&
          (forecast as Record<string, unknown>).confidence === undefined
        ) {
          return {
            ...(forecast as Record<string, unknown>),
            confidence: OvertakeForecastConfidence.Low,
          };
        }
        return forecast;
      },
    );
  }

  return Object.keys(patch).length > 0 ? { ...snapshot, ...patch } : value;
};

export const parseLiveRaceSnapshot = (value: unknown): LiveRaceSnapshot =>
  liveRaceSnapshotSchema.parse(normalizeLegacyLiveSnapshot(value));
