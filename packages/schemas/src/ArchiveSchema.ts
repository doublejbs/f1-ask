import {
  ArchivePodiumEntry,
  ArchiveRaceDetail,
  ArchiveRaceListItem,
  ArchiveRaceSession,
  ArchiveResultRow,
  ArchiveResultStatus,
  DriverWeekendTires,
  PracticeResult,
  QualifyingResult,
  QualifyingSegment,
  SessionTireUse,
  TireCompound,
  WeekendFormat,
  WeekendResults,
  WeekendSessionKind,
  WeekendSessionResults,
  WeekendTireSession,
  WeekendTireUsage,
} from "@f1/domain";
import { z } from "zod";
import { raceEventSchema } from "./RaceEventSchema";
import { raceSummaryDataSchema } from "./SummarySchema";

// 지난 레이스 기록 API 응답 검증 (docs/17-race-archive.md).
// 서버 라우트는 OpenF1 원본을 그대로 흘리지 않고 이 형태로만 내보낸다.

export const archiveRaceSessionSchema = z.object({
  sessionKey: z.number().int(),
  sessionId: z.string().min(1),
  meetingKey: z.number().int(),
  round: z.number().int().nonnegative(),
  meetingName: z.string().min(1),
  sessionName: z.string().min(1),
  circuitName: z.string().min(1),
  countryCode: z.string().min(1),
  countryName: z.string().min(1),
  dateStart: z.string().nullable(),
  dateEnd: z.string().min(1),
}) satisfies z.ZodType<ArchiveRaceSession>;

export const archivePodiumEntrySchema = z.object({
  position: z.number().int(),
  driverNumber: z.number().int(),
  driverCode: z.string().min(1),
  fullName: z.string().min(1),
  teamName: z.string(),
  teamColour: z.string().nullable(),
}) satisfies z.ZodType<ArchivePodiumEntry>;

export const archiveRaceListItemSchema = archiveRaceSessionSchema.extend({
  podium: z.array(archivePodiumEntrySchema),
}) satisfies z.ZodType<ArchiveRaceListItem>;

export const archiveRaceListResponseSchema = z.object({
  races: z.array(archiveRaceListItemSchema),
});

export type ArchiveRaceListResponse = z.infer<
  typeof archiveRaceListResponseSchema
>;

export const archiveResultRowSchema = z.object({
  position: z.number().int().nullable(),
  driverNumber: z.number().int(),
  driverCode: z.string().min(1),
  fullName: z.string().min(1),
  teamName: z.string(),
  teamColour: z.string().nullable(),
  gapToLeaderSeconds: z.number().nullable(),
  gapLabel: z.string().nullable(),
  totalTimeSeconds: z.number().nullable(),
  lapsCompleted: z.number().int().nullable(),
  points: z.number().nullable(),
  status: z.nativeEnum(ArchiveResultStatus),
}) satisfies z.ZodType<ArchiveResultRow>;

export const archiveRaceDetailSchema = z.object({
  session: archiveRaceSessionSchema,
  results: z.array(archiveResultRowSchema),
  summary: raceSummaryDataSchema,
  events: z.array(raceEventSchema),
}) satisfies z.ZodType<ArchiveRaceDetail>;

export const parseArchiveRaceListResponse = (
  value: unknown,
): ArchiveRaceListResponse => archiveRaceListResponseSchema.parse(value);

export const parseArchiveRaceDetail = (value: unknown): ArchiveRaceDetail =>
  archiveRaceDetailSchema.parse(value);

// 주말 타이어 사용 (docs/29 §범위 밖 → 구현).
const weekendTireSessionSchema = z.object({
  sessionKey: z.number().int(),
  name: z.string(),
  kind: z.nativeEnum(WeekendSessionKind),
}) satisfies z.ZodType<WeekendTireSession>;

const sessionTireUseSchema = z.object({
  sessionKey: z.number().int(),
  compounds: z.array(
    z.object({
      compound: z.nativeEnum(TireCompound),
      startedNew: z.boolean(),
    }),
  ),
}) satisfies z.ZodType<SessionTireUse>;

const driverWeekendTiresSchema = z.object({
  driverNumber: z.number().int(),
  code: z.string(),
  sessions: z.array(sessionTireUseSchema),
}) satisfies z.ZodType<DriverWeekendTires>;

export const weekendTireUsageSchema = z.object({
  format: z.nativeEnum(WeekendFormat),
  sessions: z.array(weekendTireSessionSchema),
  drivers: z.array(driverWeekendTiresSchema),
}) satisfies z.ZodType<WeekendTireUsage>;

export const parseWeekendTireUsage = (value: unknown): WeekendTireUsage =>
  weekendTireUsageSchema.parse(value);

// 주말 프랙티스·퀄리 결과 (docs/27, E1).
const practiceResultSchema = z.object({
  driverNumber: z.number().int(),
  code: z.string(),
  position: z.number().int().nullable(),
  bestLapSeconds: z.number().nullable(),
  gapToLeaderSeconds: z.number().nullable(),
}) satisfies z.ZodType<PracticeResult>;

const qualifyingSegmentSchema = z.object({
  index: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  lapSeconds: z.number().nullable(),
  rank: z.number().int().nullable(),
}) satisfies z.ZodType<QualifyingSegment>;

const qualifyingResultSchema = z.object({
  driverNumber: z.number().int(),
  code: z.string(),
  finalPosition: z.number().int().nullable(),
  segments: z.array(qualifyingSegmentSchema),
}) satisfies z.ZodType<QualifyingResult>;

const weekendSessionResultsSchema = z.discriminatedUnion("type", [
  z.object({
    sessionKey: z.number().int(),
    name: z.string(),
    kind: z.nativeEnum(WeekendSessionKind),
    type: z.literal("practice"),
    practice: z.array(practiceResultSchema),
  }),
  z.object({
    sessionKey: z.number().int(),
    name: z.string(),
    kind: z.nativeEnum(WeekendSessionKind),
    type: z.literal("qualifying"),
    qualifying: z.array(qualifyingResultSchema),
  }),
]) satisfies z.ZodType<WeekendSessionResults>;

export const weekendResultsSchema = z.object({
  sessions: z.array(weekendSessionResultsSchema),
}) satisfies z.ZodType<WeekendResults>;

export const parseWeekendResults = (value: unknown): WeekendResults =>
  weekendResultsSchema.parse(value);
