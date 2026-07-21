import {
  ArchivePodiumEntry,
  ArchiveRaceDetail,
  ArchiveRaceListItem,
  ArchiveRaceSession,
  ArchiveResultRow,
  ArchiveResultStatus,
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
