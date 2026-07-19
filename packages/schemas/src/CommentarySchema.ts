import {
  AiCommentary,
  ExplanationLevel,
  RaceEventPriority,
  RaceEventType,
  SupportedLocale,
} from "@f1/domain";
import { z } from "zod";
import { liveRaceSnapshotSchema } from "./RaceSnapshotSchema";
import { raceEventSchema } from "./RaceEventSchema";

// AI Commentary API 요청 검증.
export const commentaryRequestSchema = z.object({
  locale: z.nativeEnum(SupportedLocale),
  explanationLevel: z.nativeEnum(ExplanationLevel),
  snapshot: liveRaceSnapshotSchema,
  events: z.array(raceEventSchema),
});

export type CommentaryRequest = z.infer<typeof commentaryRequestSchema>;

export const aiCommentarySchema = z.object({
  id: z.string().min(1),
  sourceEventId: z.string().min(1),
  sourceEventType: z.nativeEnum(RaceEventType),
  priority: z.nativeEnum(RaceEventPriority),
  text: z.string().min(1),
  timestamp: z.string(),
}) satisfies z.ZodType<AiCommentary>;

export const parseCommentaryRequest = (value: unknown): CommentaryRequest =>
  commentaryRequestSchema.parse(value);

export const parseAiCommentaryList = (value: unknown): AiCommentary[] =>
  z.array(aiCommentarySchema).parse(value);
