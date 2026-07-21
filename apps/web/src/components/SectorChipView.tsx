import { cn } from "@/lib/Utils";
import { formatSector } from "@/lib/Format";

type Props = {
  // 이 섹터의 마지막 랩 기록(초). 없으면 "—".
  value: number | null;
  // 필드 전체 최근 랩 기준 이 섹터의 최속(퍼플 판정용).
  best: number | null;
};

const EPSILON = 0.0005;

// 섹터 미니 칩 1개. 필드 최속 섹터는 퍼플(F1 관례), 그 외는 중립색으로 표시한다.
// 순위 목록은 섹터를 열 3개로 쪼개 쓰고(좁은 가로 스크롤 창에 한 칸씩 들어와야 한다),
// 상세 시트는 SectorChipsView 로 3개를 한 줄에 묶어 쓴다.
export const SectorChipView = ({ value, best }: Props) => {
  const isPurple = value !== null && best !== null && value <= best + EPSILON;

  return (
    <span
      className={cn(
        "min-w-[3.25rem] rounded px-1 py-0.5 text-center text-[11px]",
        value === null
          ? "text-muted-foreground"
          : isPurple
            ? "bg-purple-500/20 font-semibold text-purple-300"
            : "bg-muted/50 text-muted-foreground",
      )}
    >
      {formatSector(value)}
    </span>
  );
};
