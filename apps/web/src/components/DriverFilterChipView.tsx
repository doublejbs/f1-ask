"use client";

import { DriverEventFilterTarget } from "@/hooks/UseDriverEventFilter";
import { Dictionary } from "@/i18n/Messages";
import { teamColorHex } from "@/lib/Format";
import { X } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  // 적용 중인 드라이버 필터. null 이면 아무것도 그리지 않는다.
  driverFilter: DriverEventFilterTarget | null;
  onClear: () => void;
};

// 이벤트 피드에 걸린 드라이버 필터 칩 — "HAM ×" (docs/13-race-console.md 원칙 3).
// 팀 컬러를 테두리·코드 색 액센트로 써서 어느 드라이버로 좁혔는지 한눈에 보이게 한다.
// 칩 전체가 해제 버튼이며 44pt 터치 타깃을 확보한다.
export const DriverFilterChipView = ({
  dictionary,
  driverFilter,
  onClear,
}: Props) => {
  if (driverFilter === null) {
    return null;
  }

  const accent = teamColorHex(driverFilter.teamColour) ?? "hsl(var(--border))";

  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={dictionary.events.driverFilterClear.replace(
        "{code}",
        driverFilter.code,
      )}
      style={{ borderColor: accent }}
      className="press glass-chip flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring/70"
    >
      <span
        className="text-[11px] font-bold tracking-wide"
        style={{ color: accent }}
      >
        {driverFilter.code}
      </span>

      <X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
    </button>
  );
};
