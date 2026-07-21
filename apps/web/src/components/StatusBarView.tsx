"use client";

import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import {
  DataFreshnessStatus,
  LiveRaceSnapshot,
  SessionStatus,
} from "@f1/domain";
import { Flag, Settings } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  snapshot: LiveRaceSnapshot;
  freshness: DataFreshnessStatus;
  onOpenSettings: () => void;
};

// 트랙 상태별 상태바 배경 틴트. 색만으로 상황 판단이 끝나도록 은은하게 깔린다.
// 순수 검정 + 앰비언트 워시 팔레트에서는 틴트가 묻히므로 이전보다 한 단계 진하게 잡는다.
const getStatusTintClass = (status: SessionStatus): string => {
  switch (status) {
    case SessionStatus.Green:
      return "bg-emerald-500/[0.14]";
    case SessionStatus.Yellow:
    case SessionStatus.SafetyCar:
    case SessionStatus.VirtualSafetyCar:
      return "bg-amber-500/[0.16]";
    case SessionStatus.Red:
    case SessionStatus.Suspended:
      return "bg-red-500/[0.18]";
    default:
      return "bg-transparent";
  }
};

// 트랙 상태 점 색상. 배경 틴트와 같은 색 계열로 맞춘다.
const getStatusDotClass = (status: SessionStatus): string => {
  switch (status) {
    case SessionStatus.Green:
      return "bg-emerald-400";
    case SessionStatus.Yellow:
    case SessionStatus.SafetyCar:
    case SessionStatus.VirtualSafetyCar:
      return "bg-amber-400";
    case SessionStatus.Red:
    case SessionStatus.Suspended:
      return "bg-red-400";
    case SessionStatus.Finished:
      return "bg-slate-300";
    default:
      return "bg-slate-500";
  }
};

// freshness 점 색상. 라벨은 생략하고 점 하나로 축약한다(상세는 상태 변화 시에만 의미).
const getFreshnessDotClass = (freshness: DataFreshnessStatus): string => {
  switch (freshness) {
    case DataFreshnessStatus.Live:
      return "bg-emerald-400";
    case DataFreshnessStatus.Delayed:
      return "bg-amber-400";
    case DataFreshnessStatus.Stale:
      return "bg-red-400";
    default:
      return "bg-slate-500";
  }
};

// 고정 상태바: 대형 히어로(SessionHeaderView)를 대체하는 한 줄 요약.
// 모든 탭·데스크톱 공통으로 상단 sticky. 좌우 여백을 둔 떠 있는 알약이며
// 랩 숫자를 히어로 타이포로 키운다. 트랙 상태 틴트 · 컬러 점 + 라벨 · freshness · 설정.
export const StatusBarView = ({
  dictionary,
  snapshot,
  freshness,
  onOpenSettings,
}: Props) => {
  const isFinished = snapshot.status === SessionStatus.Finished;
  const lapText =
    snapshot.currentLap === null
      ? "—"
      : snapshot.totalLaps === null
        ? String(snapshot.currentLap)
        : `${snapshot.currentLap}/${snapshot.totalLaps}`;

  return (
    <div className="sticky top-0 z-40 -mx-4 px-4 pt-safe">
      <div className="glass-float flex items-center gap-3 overflow-hidden rounded-full py-1.5 pl-4 pr-1.5">
        {/* 상태 틴트 오버레이. 글래스 배경 위에 색만 은은하게 덧입힌다. */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0",
            getStatusTintClass(snapshot.status),
          )}
          aria-hidden
        />

        {/* 좌: 랩 히어로 수치 + 작은 라벨 */}
        <div className="relative flex min-w-0 flex-col leading-none">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {dictionary.statusBar.appShort} · {dictionary.header.lap}
          </span>
          <span className="mt-0.5 text-2xl font-bold tabular-nums leading-none tracking-tight">
            {lapText}
          </span>
        </div>

        {/* 중: 트랙 상태 — 컬러 점 + 라벨 */}
        <div className="glass-chip relative mx-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">
          {isFinished ? (
            <Flag className="h-3 w-3 text-slate-300" aria-hidden />
          ) : (
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                getStatusDotClass(snapshot.status),
              )}
              aria-hidden
            />
          )}
          <span className="truncate">
            {dictionary.status[snapshot.status]}
          </span>
        </div>

        {/* 우: freshness 점 + 설정 버튼 */}
        <div className="relative flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              getFreshnessDotClass(freshness),
            )}
            aria-label={dictionary.freshness[freshness]}
            title={dictionary.freshness[freshness]}
          />
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={dictionary.statusBar.settings}
            // press(scale 눌림) 미사용 — 설정 시트 오버레이가 손가락 아래에
            // 깔려 pointerup 을 못 받고 :active 가 굳는다.
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
