"use client";

import { Dictionary } from "@/i18n/Messages";
import { formatRaceDate } from "@/lib/Format";
import { teamColorHex } from "@/lib/Format";
import { getTeamShortName } from "@/lib/TeamShortName";
import { cn } from "@/lib/Utils";
import { ArchiveRaceListItem, SupportedLocale } from "@f1/domain";
import { ChevronRight } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  races: ArchiveRaceListItem[];
  onSelectRace: (sessionKey: number) => void;
};

// OpenF1 의 session_name 원문("Race" / "Sprint")을 로케일 라벨로 옮긴다.
// 모르는 값이 오면 원문을 그대로 노출해 빈 자리가 생기지 않게 한다.
const getSessionLabel = (
  dictionary: Dictionary,
  sessionName: string,
): string => {
  if (sessionName.toLowerCase() === "sprint") {
    return dictionary.archive.sessionName.sprint;
  }

  if (sessionName.toLowerCase() === "race") {
    return dictionary.archive.sessionName.race;
  }

  return sessionName;
};

// 완료 레이스 목록. 카드가 아니라 헤어라인으로 나뉜 행이다
// (docs/12-glass-design-language.md §2 카드가 아니라 행).
export const ArchiveRaceListView = ({
  dictionary,
  locale,
  races,
  onSelectRace,
}: Props) => (
  <ul className="flex flex-col">
    {races.map((race, index) => (
      <li
        key={race.sessionKey}
        className={cn(index < races.length - 1 && "hairline")}
      >
        <button
          type="button"
          onClick={() => onSelectRace(race.sessionKey)}
          aria-label={dictionary.archive.openRace.replace(
            "{name}",
            race.meetingName,
          )}
          className="press flex min-h-[4.5rem] w-full items-center gap-3 py-3 text-left"
        >
          {/* 0 패딩 라운드 번호. 라운드를 못 구한 경우(0)에는 자리를 비운다. */}
          <span className="w-9 shrink-0 text-lg font-semibold tabular-nums text-muted-foreground">
            {race.round > 0
              ? dictionary.archive.round.replace(
                  "{round}",
                  String(race.round).padStart(2, "0"),
                )
              : ""}
          </span>

          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-base font-bold leading-tight">
              {race.meetingName}
            </span>

            <span className="text-xs text-muted-foreground">
              {race.circuitName} · {formatRaceDate(race.dateEnd, locale)} ·{" "}
              {getSessionLabel(dictionary, race.sessionName)}
            </span>

            {/* 포디움 3인. 팀 컬러 점 + 코드로 짧게 — 팀명은 여기서 쓰지 않는다. */}
            {race.podium.length > 0 ? (
              <span
                className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5"
                aria-label={dictionary.archive.podium}
              >
                {race.podium.map((entry) => (
                  <span
                    key={entry.driverNumber}
                    className="flex items-center gap-1.5 text-xs font-semibold tabular-nums"
                    title={`P${entry.position} ${entry.fullName} — ${getTeamShortName(entry.teamName)}`}
                  >
                    <span className="text-muted-foreground">
                      P{entry.position}
                    </span>
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor:
                          teamColorHex(entry.teamColour) ??
                          "hsl(var(--muted-foreground))",
                      }}
                    />
                    <span>{entry.driverCode}</span>
                  </span>
                ))}
              </span>
            ) : null}
          </span>

          <ChevronRight
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </button>
      </li>
    ))}
  </ul>
);
