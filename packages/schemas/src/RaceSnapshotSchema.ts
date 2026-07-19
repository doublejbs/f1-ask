import {
  LiveDriverState,
  LiveRaceSnapshot,
  SessionStatus,
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
  windSpeedKph: z.number().nullable().optional(),
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
  generatedAt: z.string().datetime(),
  sourceUpdatedAt: z.string().datetime(),
  version: z.number().int().nonnegative(),
}) satisfies z.ZodType<LiveRaceSnapshot>;

export const parseLiveRaceSnapshot = (value: unknown): LiveRaceSnapshot =>
  liveRaceSnapshotSchema.parse(value);
