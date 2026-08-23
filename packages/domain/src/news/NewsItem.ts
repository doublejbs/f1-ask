import { NewsCategory } from "./NewsCategory";
import { NewsSourceKind } from "./NewsSourceKind";

// 정규화된 뉴스 항목 (docs/28-news-tab.md §공통 모델).
//
// 소스가 무엇이든(RSS·YouTube·큐레이션) 이 한 형태로 옮겨 담는다. 화면·정렬·중복 제거는
// 이 모델만 본다. 원문 전문은 담지 않는다 — 저작권상 발췌(summary)와 외부 링크(url)까지다.
export type NewsItem = {
  // 중복 제거용 안정 키. 보통 원문 URL 에서 파생한다.
  id: string;
  kind: NewsSourceKind;
  category: NewsCategory;
  title: string;
  // 발췌. 없으면 null (원문 전문을 복제하지 않는다).
  summary: string | null;
  // 외부 원문 링크. 카드 탭 시 새 탭/브라우저로 연다.
  url: string;
  thumbnailUrl: string | null;
  // 출처 이름 표기. 예: "The Race", "F1 공식".
  sourceName: string;
  // 발행 시각 (ISO). 정렬 기준.
  publishedAt: string;
  // 원문 언어. 제목은 이 언어 그대로다(번역은 이후 단계).
  lang: string;
};

// 라이브(RSS·YouTube) 소스와 Mock 소스가 공유하는 인터페이스 (docs/28 §Mock 뉴스 소스).
// 클라이언트는 이 뒤만 보고, 소스 교체가 화면에 영향을 주지 않는다.
export type NewsSource = {
  load: () => Promise<NewsItem[]>;
};
