"use client";

import { Dictionary } from "@/i18n/Messages";
import { DashboardTab } from "@/lib/DashboardTab";
import { cn } from "@/lib/Utils";
import { ListOrdered, type LucideIcon, Radio, Sparkles } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  activeTab: DashboardTab;
  onChangeTab: (tab: DashboardTab) => void;
};

type TabConfig = {
  tab: DashboardTab;
  labelKey: keyof Dictionary["tabs"];
  Icon: LucideIcon;
};

const TAB_CONFIGS: TabConfig[] = [
  { tab: DashboardTab.Now, labelKey: "now", Icon: Radio },
  { tab: DashboardTab.Standings, labelKey: "standings", Icon: ListOrdered },
  { tab: DashboardTab.Ask, labelKey: "ask", Icon: Sparkles },
];

// 하단 탭바(모바일 전용). 지금 / 순위 / AI 3버튼. pb-safe + 44pt 이상 터치 타깃.
export const TabBarView = ({ dictionary, activeTab, onChangeTab }: Props) => (
  <nav
    className="fixed inset-x-0 bottom-0 z-40 pb-safe lg:hidden"
    aria-label={dictionary.appName}
  >
    <div className="glass-panel flex items-stretch rounded-none border-x-0 border-b-0">
      {TAB_CONFIGS.map(({ tab, labelKey, Icon }) => {
        const isActive = tab === activeTab;

        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChangeTab(tab)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "press flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            <span>{dictionary.tabs[labelKey]}</span>
          </button>
        );
      })}
    </div>
  </nav>
);
