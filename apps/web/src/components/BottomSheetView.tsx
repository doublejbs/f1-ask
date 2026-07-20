"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  // aria-labelledby 대상 id. children 안에 이 id 를 가진 제목 요소가 있어야 한다.
  titleId: string;
  // 오버레이·닫기 버튼의 접근성 라벨.
  closeLabel: string;
  children: ReactNode;
};

// 공유 바텀 시트 셸: 오버레이 + 패널 + 닫기(X) 를 한 곳에서 담당한다.
// body 스크롤 잠금 · ESC 닫기 · role=dialog/aria-modal/aria-labelledby · 진입/복귀 포커스를
// 함께 제공한다(완전한 포커스 트랩은 범위 밖 — 진입 시 패널 포커스, 닫힐 때 트리거 복귀만).
export const BottomSheetView = ({
  isOpen,
  onClose,
  titleId,
  closeLabel,
  children,
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
        className="glass-panel animate-fade-up relative w-full max-w-lg rounded-t-2xl p-5 pb-safe outline-none sm:rounded-2xl sm:pb-5"
      >
        {/* 닫기 버튼. 44pt 터치 타깃(HIG). */}
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="press absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {children}
      </div>
    </div>
  );
};
