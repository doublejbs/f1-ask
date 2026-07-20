import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind.config.ts 가 확장한 커스텀 fontSize 들. 이름을 알려 주지 않으면
// tailwind-merge 가 `text-label` 을 **색상**으로 오인해 뒤에 오는 `text-muted-foreground`
// 와 충돌시키고 조용히 지워 버린다(폰트 크기가 통째로 사라진다).
const CUSTOM_FONT_SIZES = ["hero", "stat", "label"];

const mergeClasses = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: CUSTOM_FONT_SIZES }],
    },
  },
});

// shadcn/ui 표준 className 병합 유틸.
export const cn = (...inputs: ClassValue[]): string =>
  mergeClasses(clsx(inputs));
