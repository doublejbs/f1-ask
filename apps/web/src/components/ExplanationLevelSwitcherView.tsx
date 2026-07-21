import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import { EXPLANATION_LEVELS, ExplanationLevel } from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  level: ExplanationLevel;
  onChangeLevel: (level: ExplanationLevel) => void;
};

// AI 설명 수준 전환 (입문/표준/숙련). Ask AI 와 AI 해설 모두에 적용된다.
export const ExplanationLevelSwitcherView = ({
  dictionary,
  level,
  onChangeLevel,
}: Props) => (
  <div className="flex items-center gap-2">
    <span className="hidden text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:inline">
      {dictionary.explanationLevel.label}
    </span>
    <div className="flex rounded-full border border-white/10 bg-black/20 p-0.5 backdrop-blur-md">
      {EXPLANATION_LEVELS.map((candidate) => (
        <button
          key={candidate}
          type="button"
          onClick={() => onChangeLevel(candidate)}
          aria-pressed={candidate === level}
          className={cn(
            "press rounded-full px-3 py-1 text-[13px] font-semibold transition-colors",
            candidate === level
              ? "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.25)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {dictionary.explanationLevel.levels[candidate]}
        </button>
      ))}
    </div>
  </div>
);
