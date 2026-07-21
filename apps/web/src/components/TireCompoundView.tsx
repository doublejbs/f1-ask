import { TireCompoundSize } from "@/components/TireCompoundSize";
import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import { TireCompound } from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  compound: TireCompound;
  tireAgeLaps: number | null;
  // 생략하면 상세 시트용 기본 크기(28px 비드)를 쓴다.
  size?: TireCompoundSize;
};

// 컴파운드별 링 색상(HSL) — 3D 비드 그라디언트에 사용.
const compoundRing = (compound: TireCompound): { ring: string; text: string } => {
  switch (compound) {
    case TireCompound.Soft:
      return { ring: "0 84% 60%", text: "text-red-300" };
    case TireCompound.Medium:
      return { ring: "45 93% 58%", text: "text-amber-200" };
    case TireCompound.Hard:
      return { ring: "210 20% 92%", text: "text-slate-100" };
    case TireCompound.Intermediate:
      return { ring: "150 70% 50%", text: "text-emerald-300" };
    case TireCompound.Wet:
      return { ring: "205 85% 58%", text: "text-sky-300" };
    default:
      return { ring: "215 15% 55%", text: "text-slate-400" };
  }
};

// 크기 변형별 클래스. Tailwind 퍼지 때문에 리터럴 클래스만 쓴다.
const getSizeClasses = (
  size: TireCompoundSize,
): { root: string; bead: string; age: string; ringWidth: number } => {
  if (size === TireCompoundSize.Compact) {
    return {
      root: "gap-1",
      bead: "h-5 w-5 text-[9px]",
      age: "text-[11px]",
      ringWidth: 1.5,
    };
  }

  return {
    root: "gap-2",
    bead: "h-7 w-7 text-[10px]",
    age: "text-xs",
    ringWidth: 2,
  };
};

// 타이어 컴파운드를 입체 비드(도넛 타이어)로 표현 + 사용 랩 수.
export const TireCompoundView = ({
  dictionary,
  compound,
  tireAgeLaps,
  size = TireCompoundSize.Default,
}: Props) => {
  const { ring, text } = compoundRing(compound);
  const sizeClasses = getSizeClasses(size);

  return (
    <div className={cn("flex items-center", sizeClasses.root)}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full font-bold",
          sizeClasses.bead,
          text,
        )}
        title={dictionary.compound[compound]}
        style={{
          background: `radial-gradient(circle at 50% 35%, hsl(${ring} / 0.28), hsl(220 30% 10%) 62%)`,
          boxShadow: `inset 0 0 0 ${sizeClasses.ringWidth}px hsl(${ring} / 0.9), inset 0 -3px 5px hsl(220 40% 4% / 0.7), inset 0 3px 4px hsl(${ring} / 0.35), 0 2px 6px -2px hsl(220 40% 2% / 0.8)`,
        }}
      >
        {compound === TireCompound.Unknown ? "?" : compound.charAt(0)}
      </span>

      <span
        className={cn(
          "shrink-0 tabular-nums text-muted-foreground",
          sizeClasses.age,
        )}
      >
        {tireAgeLaps === null ? "—" : `${tireAgeLaps}${dictionary.table.lapsUnit}`}
      </span>
    </div>
  );
};
