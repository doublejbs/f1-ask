import { NewsItem } from "./NewsItem";

// LLM 번역 응답을 원본 뉴스 항목에 입히는 **순수 함수** (docs/28 §LLM 요약·번역 — 이후 단계, 백로그 A).
//
// 네트워크(LLM 호출)는 웹 서버가 맡고, 여기는 "LLM 이 돌려준 텍스트 → 항목 매핑"만 한다.
// 파싱 실패·누락 항목은 원문을 그대로 유지한다(번역이 화면을 깨지 않게).

type TranslatedFields = { title?: string; summary?: string };

// 코드펜스·잡텍스트에서 첫 JSON 배열만 뽑는다(모델이 ```json 으로 감싸거나 설명을 덧붙여도 견딘다).
const extractJsonArray = (text: string): string | null => {
  const stripped = text.replace(/```(?:json)?/gi, "");
  const start = stripped.indexOf("[");
  const end = stripped.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return stripped.slice(start, end + 1);
};

const parseTranslationMap = (text: string): Map<string, TranslatedFields> => {
  const byId = new Map<string, TranslatedFields>();
  const jsonText = extractJsonArray(text);

  if (jsonText === null) {
    return byId;
  }

  try {
    const rows: unknown = JSON.parse(jsonText);

    if (!Array.isArray(rows)) {
      return byId;
    }

    for (const row of rows) {
      if (row === null || typeof row !== "object") {
        continue;
      }

      const record = row as Record<string, unknown>;

      if (typeof record.id !== "string") {
        continue;
      }

      byId.set(record.id, {
        title: typeof record.title === "string" ? record.title : undefined,
        summary: typeof record.summary === "string" ? record.summary : undefined,
      });
    }
  } catch {
    // 손상된 JSON — 빈 맵으로 두어 원문을 유지한다.
  }

  return byId;
};

// 번역 결과(LLM 원문 텍스트)를 항목에 입힌다. 매핑 없는 항목·빈 번역은 원문 유지, lang 은 대상 로케일.
export const applyNewsTranslation = (
  items: NewsItem[],
  llmText: string,
  locale: string,
): NewsItem[] => {
  const byId = parseTranslationMap(llmText);

  if (byId.size === 0) {
    return items;
  }

  return items.map((item) => {
    const translated = byId.get(item.id);

    if (translated === undefined) {
      return item;
    }

    return {
      ...item,
      title:
        translated.title !== undefined && translated.title.length > 0
          ? translated.title
          : item.title,
      summary:
        translated.summary !== undefined && translated.summary.length > 0
          ? translated.summary
          : item.summary,
      lang: locale,
    };
  });
};
