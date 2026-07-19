import {
  AiConfidence,
  ExplanationLevel,
  LlmAnswer,
  LlmQuestionRequest,
  SupportedLocale,
} from "@f1/domain";
import { z } from "zod";
import { raceEventSchema } from "./RaceEventSchema";
import { liveRaceSnapshotSchema } from "./RaceSnapshotSchema";

// Ask AI API 요청 검증. 신뢰할 수 없는 클라이언트 입력을 경계에서 검증한다.
export const askAiRequestSchema = z.object({
  question: z.string().min(1).max(500),
  locale: z.nativeEnum(SupportedLocale),
  explanationLevel: z.nativeEnum(ExplanationLevel),
  snapshot: liveRaceSnapshotSchema,
  recentEvents: z.array(raceEventSchema),
  favoriteDriverNumbers: z.array(z.number().int()),
}) satisfies z.ZodType<LlmQuestionRequest>;

export const llmAnswerSchema = z.object({
  answer: z.string(),
  confidence: z.nativeEnum(AiConfidence),
  insufficientData: z.boolean(),
  dataTimestamp: z.string(),
  snapshotVersion: z.number().int(),
  referencedDriverNumbers: z.array(z.number().int()),
  referencedEventIds: z.array(z.string()),
  suggestedQuestions: z.array(z.string()),
}) satisfies z.ZodType<LlmAnswer>;

export const parseAskAiRequest = (value: unknown): LlmQuestionRequest =>
  askAiRequestSchema.parse(value);

export const parseLlmAnswer = (value: unknown): LlmAnswer =>
  llmAnswerSchema.parse(value);
