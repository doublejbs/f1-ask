"use client";

import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { ChatTurn } from "@/hooks/UseAskAi";
import { Dictionary } from "@/i18n/Messages";
import { translateRaceEvent } from "@/i18n/TranslateRaceEvent";
import { getPriorityDotColor } from "@/lib/EventPriorityColor";
import { formatGap } from "@/lib/Format";
import { formatRadioClock } from "@/lib/TeamRadio";
import { cn } from "@/lib/Utils";
import {
  AiCommentary,
  AiConfidence,
  CommentaryStandingsRow,
  LlmChatRole,
  RaceEvent,
  SupportedLocale,
} from "@f1/domain";
import { Flag, Info, ListOrdered, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  commentary: AiCommentary;
  // 원본 이벤트. 목록에서 밀려나 못 찾으면 null — 그러면 요약 섹션을 생략한다.
  sourceEvent: RaceEvent | null;
  // 시점 맥락으로 질문을 좁힐 수 있는지. false 면 "현재 데이터 기준" 주석을 보인다.
  hasFocus: boolean;
  turns: ChatTurn[];
  isLoading: boolean;
  isError: boolean;
};

const confidenceVariant = (
  confidence: AiConfidence,
): NonNullable<BadgeProps["variant"]> => {
  switch (confidence) {
    case AiConfidence.High:
      return "live";
    case AiConfidence.Medium:
      return "medium";
    default:
      return "low";
  }
};

type StandingsSectionProps = {
  dictionary: Dictionary;
  rows: CommentaryStandingsRow[];
  // 해설 대상 드라이버 — 순위에서 강조한다.
  focusedCode: string | null;
};

// 그 시점 순위 슬라이스(상위 3 + 대상 앞뒤). 저장된 값을 그대로 그린다 — 재조회 없음.
const CommentaryStandingsSection = ({
  dictionary,
  rows,
  focusedCode,
}: StandingsSectionProps) => (
  <div className="mt-5 flex flex-col">
    <div className="flex items-center gap-2 pb-1">
      <ListOrdered
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <span className="text-xs text-muted-foreground">
        {dictionary.commentarySheet.standings}
      </span>
    </div>

    <ul className="flex flex-col">
      {rows.map((row, index) => {
        const isFocused = row.code === focusedCode;

        return (
          <li
            key={row.code}
            className={cn(
              "flex items-center gap-3 py-2 text-sm",
              index < rows.length - 1 && "hairline",
            )}
          >
            <span className="w-7 shrink-0 text-right font-bold tabular-nums text-muted-foreground">
              P{row.position}
            </span>

            <span
              className={cn(
                "font-semibold",
                isFocused && "text-primary",
              )}
            >
              {row.code}
            </span>

            <span className="truncate text-xs text-muted-foreground">
              {row.team}
            </span>

            <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
              {row.position === 1
                ? dictionary.table.leader
                : formatGap(row.gapToLeaderSeconds)}
            </span>
          </li>
        );
      })}
    </ul>
  </div>
);

// 상세 시트 본문. 해설 전문 → 원본 이벤트 요약 → 그 시점 순위 → 질문 스레드 순.
// 시트를 여는 조건이 commentary !== null 이므로 여기서는 항상 확정값을 받는다.
export const CommentaryDetailContentView = ({
  dictionary,
  locale,
  commentary,
  sourceEvent,
  hasFocus,
  turns,
  isLoading,
  isError,
}: Props) => {
  const standings = commentary.pointInTimeContext?.standings ?? [];
  const focusedCode = commentary.pointInTimeContext?.event.driverCode ?? null;
  const threadEndRef = useRef<HTMLDivElement>(null);

  // 새 턴/로딩이 붙으면 스레드 끝을 보이게 스크롤한다 — 답변이 순위 아래로 밀려
  // 화면 밖에 생기지 않게 한다.
  useEffect(() => {
    if (turns.length === 0 && !isLoading) {
      return;
    }

    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, isLoading]);

  return (
    <>
      {/* 해설 전문. 캡션은 3줄에서 잘렸을 수 있으므로 여기서는 자르지 않는다. */}
      <div className="mb-1 flex items-center gap-2 pr-11">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <h2
          id="commentary-sheet-title"
          className="text-xs font-medium text-muted-foreground"
        >
          {dictionary.commentarySheet.title}
        </h2>
      </div>

      <p className="text-[15px] leading-relaxed text-foreground">
        {commentary.text}
      </p>

      {/* 원본 이벤트 요약 — 타입 · 드라이버 · 랩. 이벤트를 못 찾으면 생략한다. */}
      {sourceEvent !== null ? (
        <div className="mt-5 flex flex-col">
          <div className="flex items-center gap-2 pb-1">
            <Flag
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="text-xs text-muted-foreground">
              {dictionary.commentarySheet.sourceEvent}
            </span>
          </div>

          <div className="flex items-center gap-2.5 py-1 text-[15px] leading-snug">
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                getPriorityDotColor(sourceEvent.priority),
              )}
            />

            <span className="flex-1">
              {translateRaceEvent(sourceEvent, locale)}
            </span>

            <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
              {formatRadioClock(sourceEvent.timestamp)}
            </span>
          </div>
        </div>
      ) : null}

      {/* 그 시점 순위. 저장된 슬라이스가 있을 때만. 없으면 아래 주석으로 대신 알린다. */}
      {standings.length > 0 ? (
        <CommentaryStandingsSection
          dictionary={dictionary}
          rows={standings}
          focusedCode={focusedCode}
        />
      ) : null}

      {/* 시점 맥락이 없으면 답변이 현재 데이터 기준임을 알린다 — 사용자가 "그 순간" 으로
          오해하지 않게 한다(docs/21 §pointInTimeContext 없음 처리). */}
      {!hasFocus ? (
        <div className="mt-5 flex items-start gap-2 rounded-lg bg-white/[0.04] px-3 py-2.5">
          <Info
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {dictionary.commentarySheet.noContextNote}
          </p>
        </div>
      ) : null}

      {/* 질문 스레드. 답변이 여기에 누적된다(입력은 하단 고정 footer). */}
      {turns.length > 0 || isLoading ? (
        <div className="mt-5 flex flex-col gap-2">
          {turns.map((turn, index) => (
            <div
              key={index}
              className={cn(
                "flex",
                turn.role === LlmChatRole.User
                  ? "justify-end"
                  : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  turn.role === LlmChatRole.User
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm border border-border bg-muted/40",
                )}
              >
                <p>{turn.content}</p>

                {turn.role === LlmChatRole.Assistant && turn.answer ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Badge variant={confidenceVariant(turn.answer.confidence)}>
                      {dictionary.askAi.confidenceLabel}:{" "}
                      {dictionary.askAi.confidence[turn.answer.confidence]}
                    </Badge>
                    {turn.answer.insufficientData ? (
                      <span className="text-xs text-muted-foreground">
                        {dictionary.askAi.insufficient}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {isLoading ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                <span className="animate-pulse">
                  {dictionary.askAi.thinking}
                </span>
              </div>
            </div>
          ) : null}

          <div ref={threadEndRef} />
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">
          {dictionary.commentarySheet.emptyHint}
        </p>
      )}

      {isError ? (
        <p className="mt-3 text-sm text-red-400">{dictionary.askAi.error}</p>
      ) : null}
    </>
  );
};
