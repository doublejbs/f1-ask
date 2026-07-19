import { RaceSummaryData, SupportedLocale } from "@f1/domain";
import { z } from "zod";
import { raceEventSchema } from "./RaceEventSchema";
import { liveRaceSnapshotSchema } from "./RaceSnapshotSchema";

// Race Summary API 요청 검증.
export const summaryRequestSchema = z.object({
  locale: z.nativeEnum(SupportedLocale),
  snapshot: liveRaceSnapshotSchema,
  events: z.array(raceEventSchema),
});

export type SummaryRequest = z.infer<typeof summaryRequestSchema>;

export const raceSummaryDataSchema = z.object({
  sessionId: z.string().min(1),
  sessionName: z.string().min(1),
  winnerDriverNumber: z.number().int().nullable(),
  podiumDriverNumbers: z.array(z.number().int()),
  fastestLapDriverNumber: z.number().int().nullable(),
  totalOvertakes: z.number().int().nonnegative(),
  totalPitStops: z.number().int().nonnegative(),
  retiredDriverNumbers: z.array(z.number().int()),
  keyMoments: z.array(raceEventSchema),
}) satisfies z.ZodType<RaceSummaryData>;

// API 응답: 결정론적 사실 + AI 서술.
export const raceSummaryResponseSchema = z.object({
  data: raceSummaryDataSchema,
  narrative: z.string().min(1),
});

export type RaceSummaryResponse = z.infer<typeof raceSummaryResponseSchema>;

export const parseSummaryRequest = (value: unknown): SummaryRequest =>
  summaryRequestSchema.parse(value);

export const parseRaceSummaryResponse = (
  value: unknown,
): RaceSummaryResponse => raceSummaryResponseSchema.parse(value);
