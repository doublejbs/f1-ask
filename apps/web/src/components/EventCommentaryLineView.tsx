"use client";

import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import { AiCommentary } from "@f1/domain";
import { useEffect, useRef, useState } from "react";

type Props = {
  dictionary: Dictionary;
  commentary: AiCommentary;
};

// 접힘 상태에서 보여줄 최대 줄 수. 이벤트 문장(윗줄)이 주인공이므로 해설이
// 행을 지배하지 않도록 3줄에서 자른다.
const CLAMP_LINE_CLASS = "line-clamp-3";

// 이벤트 항목에 종속된 AI 해설 줄 (docs/13-race-console.md 원칙 1).
// 이벤트 문장 아래에 들여쓰기 + 뮤트 톤으로 그려 파생 데이터임을 드러낸다.
// 실제로 잘렸을 때만 확장 버튼을 노출한다(짧은 해설에 죽은 컨트롤을 만들지 않기 위함).
//
// 목 해설은 렌더하지 않는다. 목은 이벤트 문장을 말만 바꿔 반복할 뿐이라
// ("HAD가 STR를 추월했습니다" / "HAD가 STR를 제쳤습니다 — …") 정보를 더하지
// 못하면서 행 높이만 두 배로 만든다. 해설은 의미를 더하는 겹일 때만 존재한다.
export const EventCommentaryLineView = ({ dictionary, commentary }: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const element = textRef.current;

    if (element === null) {
      return;
    }

    // 펼친 뒤에는 scrollHeight === clientHeight 라 측정값이 뒤집힌다.
    // 접힘 상태에서만 측정해 "접기" 버튼이 사라지지 않게 한다.
    const measure = () => {
      if (isExpanded) {
        return;
      }

      setIsClamped(element.scrollHeight - element.clientHeight > 1);
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(element);

    return () => observer.disconnect();
  }, [commentary.text, isExpanded]);

  const handleToggleExpand = () => setIsExpanded((previous) => !previous);

  if (commentary.isMock) {
    return null;
  }

  return (
    // 좌측 세로 규칙이 우선순위 점 아래로 내려와 종속 관계를 만든다.
    // pl-[15px] = 행 패딩 12px + 점 반지름 3px → 규칙이 점 중앙과 정렬된다.
    <div className="pb-3 pl-[15px] pr-3">
      <div className="border-l border-white/10 pl-3">
        <p
          ref={textRef}
          className={cn(
            "text-[13px] leading-relaxed text-muted-foreground",
            !isExpanded && CLAMP_LINE_CLASS,
          )}
        >
          {commentary.text}
        </p>

        {isClamped ? (
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleExpand}
              aria-expanded={isExpanded}
              className="press cursor-pointer rounded text-[11px] text-muted-foreground underline-offset-2 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
            >
              {isExpanded
                ? dictionary.events.commentaryCollapse
                : dictionary.events.commentaryExpand}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
