import {
  CommentaryContext,
  CommentaryStandingsRow,
  RaceEventParamValue,
  RaceEventScope,
} from "@f1/domain";
import { z } from "zod";

// buildCommentaryContext 가 만드는 시점 맥락의 zod 스키마.
// 해설 문서(pointInTimeContext)와 Ask AI 요청(focus.context)이 함께 쓴다 —
// 저장할 때와 질문할 때 같은 형태를 같은 스키마로 검증한다
// (docs/21-commentary-ask.md §시점 맥락을 해설 문서에 저장한다).

const paramValueSchema: z.ZodType<RaceEventParamValue> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const standingsRowSchema = z.object({
  position: z.number().int(),
  code: z.string(),
  team: z.string(),
  gapToLeaderSeconds: z.number().nullable(),
}) satisfies z.ZodType<CommentaryStandingsRow>;

export const commentaryContextSchema = z.object({
  scope: z.nativeEnum(RaceEventScope),
  event: z.object({
    type: z.string(),
    driverNumber: z.number().int().nullable(),
    driverCode: z.string().nullable(),
    lapNumber: z.number().int().nullable(),
    params: z.record(paramValueSchema),
  }),
  session: z.object({
    status: z.string(),
    currentLap: z.number().int().nullable(),
    totalLaps: z.number().int().nullable(),
    lapsRemaining: z.number().int().nullable(),
    retiredCount: z.number().int(),
  }),
  // Session 범위 이벤트에는 순위 슬라이스가 없다 — optional 이다.
  standings: z.array(standingsRowSchema).optional(),
  recentCommentary: z.array(z.string()),
}) satisfies z.ZodType<CommentaryContext>;
