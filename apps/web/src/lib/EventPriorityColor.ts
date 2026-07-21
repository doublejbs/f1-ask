import { RaceEventPriority } from "@f1/domain";

// 우선순위 점 색. Tailwind 퍼지 때문에 리터럴 클래스만 사용한다.
// 드라이버 상세 시트와 아카이브 타임라인이 같은 표현을 공유한다.
export const getPriorityDotColor = (priority: RaceEventPriority): string => {
  switch (priority) {
    case RaceEventPriority.Critical:
      return "bg-red-400";
    case RaceEventPriority.High:
      return "bg-amber-400";
    case RaceEventPriority.Medium:
      return "bg-sky-400";
    default:
      return "bg-white/30";
  }
};
