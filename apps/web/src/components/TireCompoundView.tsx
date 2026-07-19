import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import { TireCompound } from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  compound: TireCompound;
  tireAgeLaps: number | null;
};

const compoundColor = (compound: TireCompound): string => {
  switch (compound) {
    case TireCompound.Soft:
      return "border-red-500 text-red-400";
    case TireCompound.Medium:
      return "border-amber-400 text-amber-300";
    case TireCompound.Hard:
      return "border-slate-200 text-slate-200";
    case TireCompound.Intermediate:
      return "border-emerald-500 text-emerald-400";
    case TireCompound.Wet:
      return "border-sky-500 text-sky-400";
    default:
      return "border-slate-600 text-slate-400";
  }
};

// 타이어 컴파운드 + 사용 랩 수.
export const TireCompoundView = ({
  dictionary,
  compound,
  tireAgeLaps,
}: Props) => (
  <div className="flex items-center gap-2">
    <span
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold",
        compoundColor(compound),
      )}
      title={dictionary.compound[compound]}
    >
      {compound === TireCompound.Unknown ? "?" : compound.charAt(0)}
    </span>
    <span className="text-xs tabular-nums text-muted-foreground">
      {tireAgeLaps === null ? "—" : `${tireAgeLaps}${dictionary.table.lapsUnit}`}
    </span>
  </div>
);
