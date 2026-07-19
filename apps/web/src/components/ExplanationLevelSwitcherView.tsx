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
    <span className="text-xs uppercase tracking-wide text-muted-foreground">
      {dictionary.explanationLevel.label}
    </span>
    <div className="flex rounded-md border border-border p-0.5">
      {EXPLANATION_LEVELS.map((candidate) => (
        <button
          key={candidate}
          type="button"
          onClick={() => onChangeLevel(candidate)}
          aria-pressed={candidate === level}
          className={cn(
            "rounded px-2 py-0.5 text-xs font-medium transition-colors",
            candidate === level
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {dictionary.explanationLevel.levels[candidate]}
        </button>
      ))}
    </div>
  </div>
);
