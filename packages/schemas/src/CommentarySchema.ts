import {
  AiCommentary,
  CommentaryDocument,
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
  isMock: z.boolean(),
}) satisfies z.ZodType<AiCommentary>;

// Firestore `sessions/{sessionId}/aiCommentary/{docId}` 저장 문서 검증.
// 워커가 쓰고 클라이언트가 읽으므로 양쪽 경계에서 같은 스키마로 검증한다.
// isMock 이 없는 것은 의도다 — mock 텍스트는 저장 대상이 아니다
// (docs/18-ai-commentary-worker.md §폴백).
export const commentaryDocumentSchema = z.object({
  schemaVersion: z.number().int().positive(),
  sourceEventId: z.string().min(1),
  sourceEventType: z.nativeEnum(RaceEventType),
  priority: z.nativeEnum(RaceEventPriority),
  locale: z.nativeEnum(SupportedLocale),
  explanationLevel: z.nativeEnum(ExplanationLevel),
  text: z.string().min(1),
  timestamp: z.string().datetime(),
  generatedAt: z.string().datetime(),
  model: z.string().min(1),
}) satisfies z.ZodType<CommentaryDocument>;

export const parseCommentaryRequest = (value: unknown): CommentaryRequest =>
  commentaryRequestSchema.parse(value);

export const parseCommentaryDocument = (value: unknown): CommentaryDocument =>
  commentaryDocumentSchema.parse(value);

export const parseAiCommentaryList = (value: unknown): AiCommentary[] =>
  z.array(aiCommentarySchema).parse(value);
