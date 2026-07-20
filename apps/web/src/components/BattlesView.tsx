"use client";

import { SectionView } from "@/components/ui/SectionView";
import { Dictionary } from "@/i18n/Messages";
import { teamColorHex } from "@/lib/Format";
import { cn } from "@/lib/Utils";
import { Battle, LiveRaceSnapshot, SessionStatus, selectBattles } from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  snapshot: LiveRaceSnapshot;
  // 배틀 행 탭 → 탭투애스크. 앞차·뒤차 코드를 넘긴다.
  onSelectBattle: (aheadCode: string, chasingCode: string) => void;
};

type RowProps = {
  dictionary: Dictionary;
  battle: Battle;
  // 목록 마지막 행에는 헤어라인을 붙이지 않는다.
  divided: boolean;
  onSelectBattle: (aheadCode: string, chasingCode: string) => void;
};

// 상위 몇 쌍의 배틀을 노출할지. 스펙 §지금 탭 기준 2~3쌍.
const MAX_BATTLES = 3;

const formatGapSeconds = (seconds: number): string => `${seconds.toFixed(1)}s`;

// 배틀 행: [팀바] P6 HAD ↔ P7 NOR ... [DRS] 0.7s. 카드 없이 헤어라인으로 구분한다.
const BattleRow = ({
  dictionary,
  battle,
  divided,
  onSelectBattle,
}: RowProps) => {
  const aheadAccent = teamColorHex(battle.aheadDriver.teamColour);
  const chasingAccent = teamColorHex(battle.chasingDriver.teamColour);

  const handleSelect = () => {
    onSelectBattle(battle.aheadDriver.code, battle.chasingDriver.code);
  };

  return (
    <button
      type="button"
      onClick={handleSelect}
      className={cn(
        "press flex min-h-[56px] w-full items-center gap-2 px-1 py-2.5 text-left outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
        divided && "hairline",
      )}
    >
      <span
        className="h-7 w-[3px] shrink-0 rounded-full"
        style={{ backgroundColor: aheadAccent ?? "hsl(var(--border))" }}
        aria-hidden
      />
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        P{battle.aheadDriver.position}
      </span>
      <span className="shrink-0 font-bold">{battle.aheadDriver.code}</span>

      <span className="shrink-0 text-muted-foreground" aria-hidden>
        ↔
      </span>

      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        P{battle.chasingDriver.position}
      </span>
      <span className="shrink-0 font-bold">{battle.chasingDriver.code}</span>
      <span
        className="h-7 w-[3px] shrink-0 rounded-full"
        style={{ backgroundColor: chasingAccent ?? "hsl(var(--border))" }}
        aria-hidden
      />

      <div className="flex-1" />

      {battle.isDrsRange ? (
        <span className="glass-chip shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
          {dictionary.battles.drsLabel}
        </span>
      ) : null}

      <span
        className={cn(
          "shrink-0 text-right text-xl font-bold tabular-nums",
          battle.isDrsRange ? "text-amber-300" : "text-foreground",
        )}
      >
        {formatGapSeconds(battle.gapSeconds)}
      </span>
    </button>
  );
};

// 「지금」 탭 배틀 위젯. 간격이 좁은 접전 상위 3쌍을 노출한다.
// 배틀이 없거나 세션이 종료된 경우(끝난 경기의 "배틀"은 무의미) 위젯 자체를 미표시한다.
export const BattlesView = ({ dictionary, snapshot, onSelectBattle }: Props) => {
  if (snapshot.status === SessionStatus.Finished) {
    return null;
  }

  const battles = selectBattles(snapshot, MAX_BATTLES);

  if (battles.length === 0) {
    return null;
  }

  return (
    <SectionView title={dictionary.battles.title}>
      <div className="flex flex-col">
        {battles.map((battle, index) => (
          <BattleRow
            key={`${battle.aheadDriver.driverNumber}-${battle.chasingDriver.driverNumber}`}
            dictionary={dictionary}
            battle={battle}
            divided={index < battles.length - 1}
            onSelectBattle={onSelectBattle}
          />
        ))}
      </div>
    </SectionView>
  );
};
