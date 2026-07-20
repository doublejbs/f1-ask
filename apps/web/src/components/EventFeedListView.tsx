"use client";

import { EventCommentaryLineView } from "@/components/EventCommentaryLineView";
import { Dictionary } from "@/i18n/Messages";
import { translateRaceEvent } from "@/i18n/TranslateRaceEvent";
import { cn } from "@/lib/Utils";
import {
  AiCommentary,
  attachCommentary,
  RaceEvent,
  RaceEventPriority,
  SupportedLocale,
} from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  // 이미 모드·개수 필터를 거쳐 최신순으로 정렬된 이벤트.
  visibleEvents: RaceEvent[];
  // 이벤트에 sourceEventId 로 결합되는 AI 해설. 없으면 윗줄만 그린다.
  commentary: AiCommentary[];
  // "전체 보기"로 전환하면 새로 보이게 될 건수. 0 이면 안내를 그리지 않는다.
  hiddenCount: number;
  // 목록이 비었을 때 문구. 드라이버 필터가 걸린 경우 그에 맞는 문구를 넘긴다.
  emptyLabel?: string;
  onSelectEvent?: (event: RaceEvent) => void;
};

// 행 내부 레이아웃. 탭 가능 여부에 따라 button / div 로 감싸므로 클래스를 공유한다.
const ROW_CLASS =
  "flex w-full min-h-[44px] items-center gap-2.5 py-3 pl-3 pr-1 text-left text-[15px] leading-snug";

// 해설 줄이 붙는 행은 아래 패딩을 해설 블록이 대신 갖는다.
const ROW_WITH_COMMENTARY_CLASS = "pb-1";

// 우선순위 점 색. Tailwind 퍼지 때문에 리터럴 클래스만 사용한다.
const getPriorityDotColor = (priority: RaceEventPriority): string => {
  switch (priority) {
    case RaceEventPriority.Critical:
      return "bg-red-400";
    case RaceEventPriority.High:
      return "bg-amber-400";
    case RaceEventPriority.Medium:
      return "bg-sky-400";
    default:
      return "bg-white/30";
  }
};

const formatClock = (iso: string): string => {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

// 이벤트에서 탭투애스크 대상이 되는 드라이버 코드를 추출한다(없으면 null).
const getEventDriverCode = (event: RaceEvent): string | null => {
  const code = event.params.driverCode;

  return typeof code === "string" && code.length > 0 ? code : null;
};

// 이벤트 목록 본문만 그리는 뷰. 섹션 제목·필터 같은 크롬은 갖지 않는다.
// 이벤트 시트는 이 목록만 스크롤 영역에 넣고 필터는 고정 크롬에 두므로
// (docs/13-race-console.md 원칙 2 — 접힘 상태에서도 최신 1건이 보여야 한다)
// 목록과 크롬을 분리해 EventFeedView(데스크톱)와 EventSheetView(모바일)가 공유한다.
export const EventFeedListView = ({
  dictionary,
  locale,
  visibleEvents,
  commentary,
  hiddenCount,
  emptyLabel,
  onSelectEvent,
}: Props) => {
  // 해설은 별도 목록이 아니라 이벤트의 한 겹이다 (docs/13-race-console.md 원칙 1).
  const rows = attachCommentary(visibleEvents, commentary);

  if (rows.length === 0) {
    return (
      <>
        <p className="px-1 text-sm text-muted-foreground">
          {emptyLabel ?? dictionary.events.empty}
        </p>

        {hiddenCount > 0 ? (
          <p className="px-1 pt-1 text-xs text-muted-foreground">
            {dictionary.events.hiddenCount.replace(
              "{count}",
              String(hiddenCount),
            )}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <ul className="flex flex-col">
        {rows.map(({ event, commentary: eventCommentary }, index) => {
          const code = getEventDriverCode(event);
          const tappable = onSelectEvent !== undefined && code !== null;
          const critical = event.priority === RaceEventPriority.Critical;
          const divided = index < rows.length - 1;
          const priorityLabel = dictionary.eventPriority[event.priority];
          const handleSelect = () => onSelectEvent?.(event);
          // 탭 가능한 항목만 네이티브 button 으로 감싼다. 클릭해도 아무 일도 없는
          // 항목까지 포커스 가능하게 만들면 키보드 사용자가 빈 항목을 타넘게 된다.
          const content = (
            <>
              {/* 배지 대신 작은 컬러 점. 우선순위 라벨은 스크린리더·툴팁으로 남긴다. */}
              <span
                role="img"
                aria-label={priorityLabel}
                title={priorityLabel}
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  getPriorityDotColor(event.priority),
                )}
              />
              <span className="flex-1">{translateRaceEvent(event, locale)}</span>
              <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {formatClock(event.timestamp)}
              </span>
            </>
          );

          return (
            <li
              key={event.id}
              className={cn(
                "relative",
                divided && "hairline",
                // Critical 은 좌측 액센트 바로 시선을 끈다.
                critical &&
                  "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-full before:bg-red-400/80",
              )}
            >
              {tappable ? (
                <button
                  type="button"
                  onClick={handleSelect}
                  className={cn(
                    ROW_CLASS,
                    eventCommentary !== null && ROW_WITH_COMMENTARY_CLASS,
                    "press cursor-pointer outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
                  )}
                >
                  {content}
                </button>
              ) : (
                <div
                  className={cn(
                    ROW_CLASS,
                    eventCommentary !== null && ROW_WITH_COMMENTARY_CLASS,
                  )}
                >
                  {content}
                </div>
              )}

              {/* 해설은 있을 때만. 없으면 이벤트 문장만 남는다(LLM 실패 내성). */}
              {eventCommentary !== null ? (
                <EventCommentaryLineView
                  dictionary={dictionary}
                  commentary={eventCommentary}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {hiddenCount > 0 ? (
        <p className="px-1 pt-1 text-xs text-muted-foreground">
          {dictionary.events.hiddenCount.replace("{count}", String(hiddenCount))}
        </p>
      ) : null}
    </>
  );
};
