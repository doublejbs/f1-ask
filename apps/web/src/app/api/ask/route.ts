import { getRaceLlmProvider } from "@/lib/AiProvider";
import { askAiRequestSchema } from "@f1/schemas";
import { NextResponse } from "next/server";

// AI Gateway (docs/02-architecture.md §42).
// LLM provider 는 서버에서만 호출한다 (실제 OpenAI 키는 클라이언트에 노출되지 않음).
// OPENAI_API_KEY 유무에 따라 OpenAI 또는 Mock provider 를 사용한다.
export const runtime = "nodejs";

export const POST = async (request: Request): Promise<NextResponse> => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 신뢰할 수 없는 클라이언트 입력을 schema 로 검증한다.
  // NOTE: Live 모드에서는 클라이언트가 보낸 snapshot 을 신뢰하지 않고
  //       서버가 Firestore 의 authoritative snapshot 을 읽어야 한다.
  const parsed = askAiRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const answer = await getRaceLlmProvider().answerQuestion(parsed.data);

  return NextResponse.json(answer);
};
