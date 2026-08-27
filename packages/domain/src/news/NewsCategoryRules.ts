import { NewsCategory } from "./NewsCategory";

// 제목 키워드로 뉴스 카테고리를 정하는 결정론 규칙 (docs/28 §분류·정렬: LLM 없이 규칙).
//
// RSS 는 카테고리를 주지 않거나 소스마다 제각각이라, 제목 텍스트로 우리 4분류에 매핑한다.
// 순서가 곧 우선순위다 — 규정 > 팀 업데이트 > 결과 > 일반. 겹치는 제목(예: "페널티로
// 순위 뒤집혀")은 더 좁은 주제(규정)를 우선한다. 완벽한 분류가 아니라 필터 칩을 쓸 만하게
// 하는 근사이며, 애매하면 General 로 떨어뜨려 All 에서만 보이게 한다.

const RULE_PATTERN =
  /\b(penalt|steward|fia|regulation|rule chang|rulebook|ban(?:ned|s)?|disqualif|appeal|protest|investigat|breach|fine|grid drop|track limit)/i;

const TEAM_UPDATE_PATTERN =
  /\b(upgrade|new floor|new part|livery|sponsor|line-?up|contract|re-?sign|signs?|deal|power unit|engine|academy|junior|reserve|principal|team boss|factory|wind tunnel|budget cap)/i;

const RESULT_PATTERN =
  /\b(win(?:s|ner)?|won|victory|pole|podium|result|qualif|fastest lap|grand prix|sprint|classif|standings|championship|points|finish|dnf|retire|crash|collision|overtak)/i;

// 제목 하나를 우리 4분류로 옮긴다. 어느 규칙에도 안 걸리면 General.
export const categorizeNewsTitle = (title: string): NewsCategory => {
  if (RULE_PATTERN.test(title)) {
    return NewsCategory.Rule;
  }

  if (TEAM_UPDATE_PATTERN.test(title)) {
    return NewsCategory.TeamUpdate;
  }

  if (RESULT_PATTERN.test(title)) {
    return NewsCategory.Result;
  }

  return NewsCategory.General;
};
