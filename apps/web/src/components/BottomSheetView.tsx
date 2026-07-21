"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/Utils";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  // aria-labelledby 대상 id. children 안에 이 id 를 가진 제목 요소가 있어야 한다.
  titleId: string;
  // 오버레이·닫기 버튼의 접근성 라벨.
  closeLabel: string;
  children: ReactNode;
  // 스크롤 영역 밖에 고정되는 하단 영역. 주요 행동 버튼처럼 항상 닿아야 하는
  // 컨트롤을 여기에 넘긴다. 없으면 하단 고정 영역 자체를 그리지 않는다.
  footer?: ReactNode;
};

// 시트 패널 최대 높이. 바닥 앵커에서 위쪽에 배경(순위 목록)이 남아야 "시트"로 읽히고
// 화면 전환으로 오해되지 않는다. 85dvh 면 가장 빡빡한 iPhone SE(667px)에서도
// 배경이 100px 남고, 393x852 기기에서는 128px 남는다.
const SHEET_MAX_HEIGHT_CLASS = "max-h-[85dvh]";

// 공유 바텀 시트 셸: 오버레이 + 패널 + 닫기(X) 를 한 곳에서 담당한다.
// body 스크롤 잠금 · ESC 닫기 · role=dialog/aria-modal/aria-labelledby · 진입/복귀 포커스를
// 함께 제공한다(완전한 포커스 트랩은 범위 밖 — 진입 시 패널 포커스, 닫힐 때 트리거 복귀만).
//
// 레이아웃은 3분할이다: 상단 고정(그랩 핸들 + 닫기 버튼) / 스크롤 본문 / 하단 고정(footer).
// 내용이 화면을 넘겨도 시트 안에서만 스크롤되며, overscroll-contain 으로 배경까지
// 스크롤이 새지 않는다.
export const BottomSheetView = ({
  isOpen,
  onClose,
  titleId,
  closeLabel,
  children,
  footer,
}: Props) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // 열려 있는 동안 body 스크롤을 잠근다. 닫히면 직전 값으로 원복한다.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // ESC 로 닫는다.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // 열릴 때 패널로 포커스를 옮기고, 닫힐 때 직전에 포커스됐던 트리거로 되돌린다.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    return () => {
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* 오버레이 탭 → 닫기 */}
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "glass-sheet animate-fade-up flex w-full max-w-lg flex-col rounded-t-[1.75rem] outline-none sm:rounded-[1.75rem]",
          SHEET_MAX_HEIGHT_CLASS,
        )}
      >
        {/* 상단 고정 영역. 그랩 핸들이 스크롤과 함께 밀려 올라가지 않도록 분리한다. */}
        <div className="shrink-0 pb-3 pt-3 sm:pb-0 sm:pt-5">
          {/* 그랩 핸들. iOS 시트 관례 — 바닥에서 올라오는 모바일 레이아웃에서만 노출한다. */}
          <div
            className="mx-auto h-1 w-10 rounded-full bg-white/25 sm:hidden"
            aria-hidden
          />
        </div>

        {/* 닫기 버튼. 원형 글래스 + 44pt 터치 타깃(HIG).
            스크롤 컨테이너가 아니라 패널(.glass-sheet — position: relative) 기준으로
            띄워 두어 본문이 아무리 스크롤돼도 항상 같은 자리에 보인다. */}
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="press glass-chip absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 스크롤 본문. min-h-0 이 있어야 flex 자식이 내용 높이로 부풀지 않고 줄어든다. */}
        <div
          className={cn(
            "scroll-slim min-h-0 flex-1 overflow-y-auto overscroll-contain px-5",
            footer === undefined ? "pb-safe sm:pb-5" : "pb-2",
          )}
        >
          {children}
        </div>

        {/* 하단 고정 영역. 주요 행동이 스크롤 밖으로 밀리지 않게 항상 보인다. */}
        {footer !== undefined ? (
          <div className="shrink-0 px-5 pb-safe pt-3 sm:pb-5">{footer}</div>
        ) : null}
      </div>
    </div>
  );
};
