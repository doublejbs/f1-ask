"use client";

import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAskAi } from "@/hooks/UseAskAi";
import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import {
  AiConfidence,
  ExplanationLevel,
  LiveRaceSnapshot,
  LlmChatRole,
  RaceEvent,
  SupportedLocale,
} from "@f1/domain";
import { RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

// 드라이버/이벤트 탭 시 부모가 전달하는 프리필 신호. nonce 변화로 매 탭을 감지한다.
export type AskAiPrefill = {
  text: string;
  nonce: number;
};

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  explanationLevel: ExplanationLevel;
  snapshot: LiveRaceSnapshot;
  events: RaceEvent[];
  favoriteDriverNumbers: number[];
  prefill?: AskAiPrefill;
};

const FALLBACK_SUGGESTIONS: Record<SupportedLocale, string[]> = {
  [SupportedLocale.En]: [
    "Who is leading now?",
    "How is NOR's pace?",
    "How old are VER's tires?",
  ],
  [SupportedLocale.Ko]: ["지금 누가 선두야?", "NOR 페이스 어때?", "VER 타이어 몇 랩 됐어?"],
  [SupportedLocale.Ja]: ["今は誰が首位？", "NOR のペースは？", "VER のタイヤは何周目？"],
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

// Ask AI (PRD §8.1). 멀티턴 대화형: 스레드를 유지하며 서버 AI Gateway 로 질문을 보낸다.
// 드라이버/이벤트 탭(prefill)으로 질문을 자동 제출할 수 있다.
export const AskAiView = ({
  dictionary,
  locale,
  explanationLevel,
  snapshot,
  events,
  favoriteDriverNumbers,
  prefill,
}: Props) => {
  const { state, ask, reset } = useAskAi();
  const [input, setInput] = useState("");
  const threadEndRef = useRef<HTMLDivElement>(null);
  const lastPrefillNonce = useRef<number | null>(null);

  const isLoading = state.status === "loading";

  const submit = (question: string) => {
    void ask({
      question,
      locale,
      explanationLevel,
      snapshot,
      recentEvents: events,
      favoriteDriverNumbers,
    });
  };

  // 탭투애스크: nonce 가 바뀌면 해당 질문을 자동 제출한다.
  useEffect(() => {
    if (prefill === undefined || prefill.nonce === lastPrefillNonce.current) {
      return;
    }

    lastPrefillNonce.current = prefill.nonce;
    setInput("");
    submit(prefill.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce]);

  // 새 턴이 추가되면 스레드 하단으로 스크롤한다.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [state.turns.length, isLoading]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(input);
    setInput("");
  };

  const lastAnswer = state.turns
    .filter((turn) => turn.role === LlmChatRole.Assistant)
    .at(-1)?.answer;
  const suggestions =
    lastAnswer?.suggestedQuestions ?? FALLBACK_SUGGESTIONS[locale];
  const hasThread = state.turns.length > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          {dictionary.askAi.title}
        </CardTitle>
        {hasThread ? (
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            {dictionary.askAi.reset}
          </button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        {hasThread ? (
          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
            {state.turns.map((turn, index) => (
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
          <p className="text-sm text-muted-foreground">
            {dictionary.askAi.emptyHint}
          </p>
        )}

        {state.status === "error" ? (
          <p className="text-sm text-red-400">{dictionary.askAi.error}</p>
        ) : null}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={dictionary.askAi.placeholder}
            aria-label={dictionary.askAi.title}
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button type="submit" disabled={isLoading || input.trim() === ""}>
            {isLoading ? dictionary.askAi.thinking : dictionary.askAi.ask}
          </Button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={isLoading}
              onClick={() => submit(suggestion)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
