import { LiveDriverState } from "./LiveDriverState";

// 「지금」 탭 배틀 위젯 뷰 모델 (docs/11-mobile-ux.md §지금 탭).
// snapshot 의 인접 순위 쌍에서 간격이 좁은 접전만 "선택·투영"한 결과다.
export type Battle = {
  aheadDriver: LiveDriverState;
  chasingDriver: LiveDriverState;
  gapSeconds: number;
  isDrsRange: boolean;
};
