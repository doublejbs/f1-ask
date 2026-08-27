// 기사 텍스트에서 언급된 드라이버를 찾아 코드 해시태그로 만드는 **순수 함수** (백로그: 뉴스 태그).
//
// 로스터의 성(姓)을 단어 경계로 매칭한다. 코드(VER 등)는 산문에 잘 안 나오고 오탐이 크므로
// 성으로만 매칭한다. 반환은 드라이버 코드(앱 전역 표기와 일치, 예: ["VER","NOR"]).

export type NewsTagDriver = {
  code: string;
  fullName: string;
};

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// 성 = full name 의 마지막 토큰(예: "Lando NORRIS"→NORRIS, "Max Verstappen"→Verstappen).
const surnameOf = (fullName: string): string => {
  const tokens = fullName.trim().split(/\s+/);
  return tokens[tokens.length - 1] ?? fullName;
};

// 기사 텍스트(제목+요약)에 등장하는 드라이버 코드를 로스터 순서로, 중복 없이 돌려준다.
export const extractDriverTags = (
  text: string,
  drivers: NewsTagDriver[],
): string[] => {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const driver of drivers) {
    const surname = surnameOf(driver.fullName);

    // 너무 짧은 성은 오탐 위험이 커 건너뛴다(예: 두 글자).
    if (surname.length < 3 || seen.has(driver.code)) {
      continue;
    }

    const pattern = new RegExp(`\\b${escapeRegExp(surname)}\\b`, "i");

    if (pattern.test(text)) {
      tags.push(driver.code);
      seen.add(driver.code);
    }
  }

  return tags;
};
