import { cn } from "@/lib/Utils";
import { formatSector } from "@/lib/Format";

type Props = {
  // 이 드라이버의 마지막 랩 섹터 S1/S2/S3 (초).
  sectors?: (number | null)[];
  // 필드 전체 최근 랩 기준 각 섹터 최속(퍼플 판정용).
  fieldBest: (number | null)[];
};

const EPSILON = 0.0005;

// 섹터 미니 칩. 필드 최속 섹터는 퍼플(F1 관례), 그 외는 중립색으로 표시한다.
// 최근 랩 기준이라 라이브 중 매 랩 갱신된다.
export const SectorChipsView = ({ sectors, fieldBest }: Props) => {
  if (sectors === undefined || sectors.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex justify-end gap-1 tabular-nums">
      {[0, 1, 2].map((i) => {
        const value = sectors[i] ?? null;
        const best = fieldBest[i] ?? null;
        const isPurple =
          value !== null && best !== null && value <= best + EPSILON;

        return (
          <span
            key={i}
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
      })}
    </div>
  );
};
