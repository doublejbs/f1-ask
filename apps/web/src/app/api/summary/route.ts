import { selectRaceSummaryData } from "@f1/domain";
import { getRaceLlmProvider } from "@/lib/AiProvider";
import { summaryRequestSchema } from "@f1/schemas";
import { NextResponse } from "next/server";

// Race Summary Gateway (docs/01-project-overview.md §6 After Race).
// 결정론적 사실은 도메인이 계산하고, LLM 은 서술만 한다. LLM 은 서버에서만 호출한다.
export const runtime = "nodejs";

export const POST = async (request: Request): Promise<NextResponse> => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = summaryRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { locale, snapshot, events } = parsed.data;
  const data = selectRaceSummaryData(snapshot, events);
  const generated = await getRaceLlmProvider().generateSummary({
    summary: data,
    snapshot,
    locale,
  });

  return NextResponse.json({ data, narrative: generated.text });
};
