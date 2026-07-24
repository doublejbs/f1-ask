import {
  LiveDriverState,
  LiveRaceContextSummary,
  LiveRaceSnapshot,
  OvertakeContextSummary,
  OvertakeForecast,
  PitContextSummary,
  PitWave,
  RaceFastestLap,
  RaceMover,
  RaceNarrative,
  RaceProgress,
  RaceRetirement,
  SafetyCarKind,
  SafetyCarPeriod,
  SessionStatus,
  StintContextSummary,
  TeamRadioClip,
  TireCompound,
  WeatherShift,
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
}) satisfies z.ZodType<StintContextSummary>;

const overtakeContextSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  mostActiveDriverNumber: z.number().int().nullable(),
  mostActiveCount: z.number().int().nonnegative(),
}) satisfies z.ZodType<OvertakeContextSummary>;

// 경기 서사 하위 스키마 (docs/25). 각 하위객체를 타입과 satisfies 로 묶어, 스냅샷 read·바디
// 파싱에서 narrative 가 조용히 스트립되지 않게 한다 (넣지 않으면 provider 도달 전에 사라진다).
const raceProgressSchema = z.object({
  currentLap: z.number().int().nullable(),
  totalLaps: z.number().int().nullable(),
  phase: z.nativeEnum(SessionStatus),
}) satisfies z.ZodType<RaceProgress>;

const raceRetirementSchema = z.object({
  driverNumber: z.number().int(),
  lap: z.number().int(),
}) satisfies z.ZodType<RaceRetirement>;

const pitWaveSchema = z.object({
  startLap: z.number().int(),
  endLap: z.number().int(),
  count: z.number().int().nonnegative(),
}) satisfies z.ZodType<PitWave>;

const raceMoverSchema = z.object({
  driverNumber: z.number().int(),
  from: z.number().int(),
  to: z.number().int(),
  delta: z.number().int(),
}) satisfies z.ZodType<RaceMover>;

const raceFastestLapSchema = z.object({
  driverNumber: z.number().int(),
  lapSeconds: z.number(),
  lap: z.number().int(),
}) satisfies z.ZodType<RaceFastestLap>;

const weatherShiftSchema = z.object({
  lap: z.number().int().nullable(),
  toWet: z.boolean(),
}) satisfies z.ZodType<WeatherShift>;

const safetyCarPeriodSchema = z.object({
  kind: z.nativeEnum(SafetyCarKind),
  startLap: z.number().int(),
}) satisfies z.ZodType<SafetyCarPeriod>;

// narrative 는 전체가 optional 이라 옛 스냅샷·mock 에서 안전하게 생략된다. 존재하면 하위 필드는
// 워커가 통째로 채우므로 타입대로 요구한다 (fastestLap 만 데이터 없으면 null).
const raceNarrativeSchema = z.object({
  progress: raceProgressSchema,
  leadChanges: z.array(z.number().int()),
  retirements: z.array(raceRetirementSchema),
  pitWaves: z.array(pitWaveSchema),
  biggestMovers: z.array(raceMoverSchema),
  fastestLap: raceFastestLapSchema.nullable(),
  weatherShifts: z.array(weatherShiftSchema),
  safetyCars: z.array(safetyCarPeriodSchema),
}) satisfies z.ZodType<RaceNarrative>;

// 워커가 계산해 싣는 결정론적 요약. optional — mock·replay·옛 스냅샷엔 없다.
// 경계에서 방어적으로 파싱한다: 필드가 없으면 그냥 undefined 로 통과시킨다.
export const liveRaceContextSummarySchema = z.object({
  pits: pitContextSummarySchema,
  stints: z.array(stintContextSummarySchema),
  overtakes: overtakeContextSummarySchema,
  // 경기 서사(docs/25). optional — 없으면 그대로 undefined 로 통과, 있으면 스트립 없이 보존.
  narrative: raceNarrativeSchema.optional(),
}) satisfies z.ZodType<LiveRaceContextSummary>;

// 워커가 계산해 싣는 순위 인접 페어의 배틀 진입 예측. optional — mock·replay·옛 스냅샷엔 없다.
const overtakeForecastSchema = z.object({
  chaserNumber: z.number().int(),
  targetNumber: z.number().int(),
  intervalSeconds: z.number(),
  closingRateSecondsPerLap: z.number(),
  predictedLapsToBattle: z.number().int(),
  predictedLap: z.number().int(),
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

export const parseLiveRaceSnapshot = (value: unknown): LiveRaceSnapshot =>
  liveRaceSnapshotSchema.parse(value);
