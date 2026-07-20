"use client";

import { Dictionary } from "@/i18n/Messages";
import { EventFeedFilterMode } from "@/lib/EventFeedFilterMode";
import { cn } from "@/lib/Utils";

type Props = {
  dictionary: Dictionary;
  mode: EventFeedFilterMode;
  onChangeMode: (mode: EventFeedFilterMode) => void;
};

const MODES: EventFeedFilterMode[] = [
  EventFeedFilterMode.Primary,
  EventFeedFilterMode.All,
];

// 피드 우선순위 세그먼티드 컨트롤. LocaleSwitcherView 와 동일한 디자인 언어를 따른다.
export const EventFeedFilterView = ({
  dictionary,
  mode,
  onChangeMode,
}: Props) => {
  const getLabel = (value: EventFeedFilterMode): string =>
    value === EventFeedFilterMode.All
      ? dictionary.events.filterAll
      : dictionary.events.filterPrimary;

  return (
    <div
      role="group"
      aria-label={dictionary.events.filterLabel}
      className="glass-chip flex shrink-0 items-center rounded-full p-0.5"
    >
      {MODES.map((value) => {
        const active = value === mode;
        const handleClick = () => onChangeMode(value);

        return (
          <button
            key={value}
            type="button"
            onClick={handleClick}
            aria-pressed={active}
            className={cn(
              "press rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/70",
              active
                ? "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.25)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {getLabel(value)}
          </button>
        );
      })}
    </div>
  );
};
