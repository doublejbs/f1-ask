// AI 설명 수준 (docs/03-firestore-and-auth.md §8.1, PRD §8.3/§8.4).
// 입문자에게는 개념을 풀어 설명하고, 숙련자에게는 전략적 깊이를 더한다.
export enum ExplanationLevel {
  Beginner = "beginner",
  Standard = "standard",
  Expert = "expert",
}

export const EXPLANATION_LEVELS: readonly ExplanationLevel[] = [
  ExplanationLevel.Beginner,
  ExplanationLevel.Standard,
  ExplanationLevel.Expert,
];

export const DEFAULT_EXPLANATION_LEVEL: ExplanationLevel =
  ExplanationLevel.Standard;

export const isExplanationLevel = (value: string): value is ExplanationLevel =>
  (EXPLANATION_LEVELS as readonly string[]).includes(value);
