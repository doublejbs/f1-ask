import { SectorChipView } from "@/components/SectorChipView";

type Props = {
  // 이 드라이버의 마지막 랩 섹터 S1/S2/S3 (초).
  sectors?: (number | null)[];
  // 필드 전체 최근 랩 기준 각 섹터 최속(퍼플 판정용).
  fieldBest: (number | null)[];
};

// 섹터 미니 칩 3개 묶음. 최근 랩 기준이라 라이브 중 매 랩 갱신된다.
export const SectorChipsView = ({ sectors, fieldBest }: Props) => {
  if (sectors === undefined || sectors.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex justify-end gap-1 tabular-nums">
      {[0, 1, 2].map((i) => (
        <SectorChipView key={i} value={sectors[i] ?? null} best={fieldBest[i] ?? null} />
      ))}
    </div>
  );
};
