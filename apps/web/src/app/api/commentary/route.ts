import {
  AiCommentary,
  selectCommentaryEvents,
  toAiCommentary,
} from "@f1/domain";
import { getRaceLlmProvider } from "@/lib/AiProvider";
import { commentaryRequestSchema } from "@f1/schemas";
import { NextResponse } from "next/server";

// AI Commentary Gateway (docs/02-architecture.md §44).
// 중요 이벤트만 골라 LLM 이 "의미"를 설명한다. LLM 은 서버에서만 호출한다.
// (Live 모드에서는 Worker 가 이벤트 발생 시 생성해 Firestore 에 저장하고
//  클라이언트는 이를 구독한다. 동일한 domain 로직을 사용한다.)
export const runtime = "nodejs";

export const POST = async (request: Request): Promise<NextResponse> => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = commentaryRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { locale, explanationLevel, snapshot, events } = parsed.data;
  const eligible = selectCommentaryEvents(events);
  const provider = getRaceLlmProvider();

  const commentary: AiCommentary[] = await Promise.all(
    eligible.map(async (event) => {
      const generated = await provider.generateCommentary({
        event,
        locale,
        explanationLevel,
        snapshot,
      });

      return toAiCommentary(event, generated.text);
    }),
  );

  return NextResponse.json(commentary);
};
