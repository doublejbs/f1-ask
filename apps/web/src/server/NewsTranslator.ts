import { applyNewsTranslation, NewsItem } from "@f1/domain";

// 뉴스 제목·요약을 대상 로케일로 LLM 번역한다 (docs 계획 §백로그 A). 서버 전용.
//
// 프로바이더 추상화(answerQuestion 툴 루프)는 번역에 과하므로, GeminiProvider 와 같은 REST
// 엔드포인트를 직접 한 번 호출한다. **키가 없거나 실패하면 원문을 그대로 돌려준다**(무해한 폴백)
// — 현재 배포처럼 AI 키가 없으면 뉴스는 영어 원문으로 남는다(회귀 없음).

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

const LANGUAGE: Record<string, string> = {
  ko: "Korean",
  ja: "Japanese",
};

const resolveModel = (): string =>
  (process.env.GEMINI_MODEL ?? "gemini-3.5-flash").replace(/^models\//, "");

// 한 번의 호출로 배치 전체를 번역한다(항목 수와 무관하게 1요청). 실패 시 원문 유지.
export const translateNews = async (
  items: NewsItem[],
  locale: string,
): Promise<NewsItem[]> => {
  const apiKey = process.env.GEMINI_API_KEY;
  const language = LANGUAGE[locale];

  // en(원문)·키 없음·대상 언어 아님·빈 목록 → 번역하지 않는다.
  if (
    apiKey === undefined ||
    apiKey.length === 0 ||
    language === undefined ||
    items.length === 0
  ) {
    return items;
  }

  try {
    const payload = items.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary ?? "",
    }));

    const system =
      `You translate Formula 1 news headlines and summaries into ${language}. ` +
      `Keep it concise and natural for F1 fans. Preserve driver surnames, team names, ` +
      `sponsor and circuit names, and render "Grand Prix" idiomatically. ` +
      `Return ONLY a JSON array of objects {id, title, summary} with the SAME ids, ` +
      `translating title and summary. No commentary, no code fences.`;

    const body = {
      contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4_096,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch(
      `${GEMINI_BASE}/models/${resolveModel()}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );

    clearTimeout(timer);

    if (!response.ok) {
      return items;
    }

    const json: unknown = await response.json();
    const parts =
      (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
        ?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((part) => part.text ?? "").join("");

    return applyNewsTranslation(items, text, locale);
  } catch {
    // 타임아웃·네트워크·파싱 실패 — 원문 유지.
    return items;
  }
};
