"use client";

import { Dictionary } from "@/i18n/Messages";
import { AiCommentary } from "@f1/domain";
import { ChevronRight } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  commentary: AiCommentary;
  // 캡션을 탭하면 이 해설로 상세 시트를 연다. 전문·원본 이벤트·시점 순위·질문이 그 안에 있다.
  onSelect: (commentary: AiCommentary) => void;
};

// 접힘 상태에서 보여줄 최대 줄 수. 이벤트 문장(윗줄)이 주인공이므로 해설이
// 행을 지배하지 않도록 3줄에서 자른다. 전문은 상세 시트가 보여주므로 인라인 확장은 없다.
const CLAMP_LINE_CLASS = "line-clamp-3";

// 이벤트 항목에 종속된 AI 해설 줄 (docs/13-race-console.md 원칙 1).
// 이벤트 문장 아래에 들여쓰기 + 뮤트 톤으로 그려 파생 데이터임을 드러낸다.
//
// 캡션 카드 전체가 탭 타깃이다(docs/21-commentary-ask.md §클릭 진입점). 탭하면 상세
// 시트가 열려 전문·원본 이벤트·그 시점 순위·질문을 보여준다. 예전의 "더 보기" 인라인
// 확장 토글은 없앴다 — 전문이 시트 안에 있어 인라인 확장이 불필요하다.
//
// 목 해설은 렌더하지 않는다. 목은 이벤트 문장을 말만 바꿔 반복할 뿐이라
// ("HAD가 STR를 추월했습니다" / "HAD가 STR를 제쳤습니다 — …") 정보를 더하지
// 못하면서 행 높이만 두 배로 만든다. 해설은 의미를 더하는 겹일 때만 존재한다.
export const EventCommentaryLineView = ({
  dictionary,
  commentary,
  onSelect,
}: Props) => {
  const handleSelect = () => {
    onSelect(commentary);
  };

  if (commentary.isMock) {
    return null;
  }

  return (
    // 좌측 세로 규칙이 우선순위 점 아래로 내려와 종속 관계를 만든다.
    // pl-[15px] = 행 패딩 12px + 점 반지름 3px → 규칙이 점 중앙과 정렬된다.
    <div className="pb-3 pl-[15px] pr-3">
      {/* press(scale 눌림) 미사용 — 탭하면 상세 시트 오버레이가 손가락 아래에 깔려
          pointerup 을 못 받고 :active 가 굳는다(순위 행·최신 이벤트 카드와 같은 처리).
          min-h-[44px] 로 44pt 터치 타깃을 보장한다(HIG). */}
      <button
        type="button"
        onClick={handleSelect}
        aria-label={dictionary.commentarySheet.open}
        className="group flex min-h-[44px] w-full items-start gap-2 rounded-lg border-l border-white/10 py-1.5 pl-3 pr-1.5 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
      >
        <span
          className={`flex-1 text-[13px] leading-relaxed text-muted-foreground ${CLAMP_LINE_CLASS}`}
        >
          {commentary.text}
        </span>

        <ChevronRight
          aria-hidden
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground"
        />
      </button>
    </div>
  );
};
