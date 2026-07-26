// JSON 파싱 헬퍼. 마크다운 코드펜스와 산문을 처리한다.

/**
 * LLM 모델이 JSON을 마크다운 코드펜스로 감싸거나 앞뒤에 산문을 붙이는 경우가 있다.
 * 이 함수는 다음 순서로 파싱을 시도한다:
 *
 * 1. 원본 JSON.parse (성공하면 즉시 반환)
 * 2. 마크다운 코드펜스 제거 후 재시도
 *    - ```json ... ``` 형태의 언어 태그 있음
 *    - ``` ... ``` 형태의 언어 태그 없음
 *    - 앞뒤 공백·개행 허용
 * 3. 첫 { 부터 마지막 } 까지 추출 후 재시도
 *    (모델이 앞뒤에 산문을 붙인 경우)
 * 4. 모두 실패하면 null
 *
 * 왜: Gemini 같은 모델이 tool 루프 중 프롬프트 지시사항을 무시하고
 * JSON을 펜스로 감싼다. 기존 path(JSON.parse 만 시도)가 실패하면,
 * toAnswer 폴백(content.trim())이 원문을 answer로 사용자에게 노출시킨다.
 */
const parseJsonSafely = (content: string): Record<string, unknown> | null => {
  // 1단계: 순수 JSON
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    // 계속해서 다음 단계 시도
  }

  // 2단계: 마크다운 코드펜스 제거.
  // ````\s*```(?:json)?\s*\n?... 대신 단순히 ```을 앞뒤에서 찾는다.
  // 앞뒤 공백·개행(e.g., " \n ```json\n{...}\n``` \n")을 허용한다.
  const fenceMatch = content.match(/^\s*```(?:json)?\s*\n?([\s\S]*?)\n?\s*```\s*$/);

  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]!) as Record<string, unknown>;
    } catch {
      // 계속해서 다음 단계 시도
    }
  }

  // 3단계: 첫 { 부터 마지막 } 까지 추출.
  // 모델이 앞뒤에 산문을 붙인 경우(e.g., "Here's the response: {...} Hope this helps!").
  const braceStart = content.indexOf("{");
  const braceEnd = content.lastIndexOf("}");

  if (braceStart !== -1 && braceEnd !== -1 && braceStart < braceEnd) {
    try {
      return JSON.parse(content.substring(braceStart, braceEnd + 1)) as Record<
        string,
        unknown
      >;
    } catch {
      // 모두 실패
    }
  }

  return null;
};

export { parseJsonSafely };
