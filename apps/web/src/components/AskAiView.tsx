"use client";

import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAskAi } from "@/hooks/UseAskAi";
import { Dictionary } from "@/i18n/Messages";
import {
  AiConfidence,
  ExplanationLevel,
  LiveRaceSnapshot,
  RaceEvent,
  SupportedLocale,
} from "@f1/domain";
import { Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  explanationLevel: ExplanationLevel;
  snapshot: LiveRaceSnapshot;
  events: RaceEvent[];
  favoriteDriverNumbers: number[];
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

// Ask AI (PRD §8.1). 질문을 서버 AI Gateway 로 보내 현재 데이터 기반 답변을 받는다.
export const AskAiView = ({
  dictionary,
  locale,
  explanationLevel,
  snapshot,
  events,
  favoriteDriverNumbers,
}: Props) => {
  const { state, ask } = useAskAi();
  const [input, setInput] = useState("");

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(input);
  };

  const suggestions =
    state.answer?.suggestedQuestions ?? FALLBACK_SUGGESTIONS[locale];
  const isLoading = state.status === "loading";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          {dictionary.askAi.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
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
              onClick={() => {
                setInput(suggestion);
                submit(suggestion);
              }}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {state.status === "error" ? (
          <p className="text-sm text-red-400">{dictionary.askAi.error}</p>
        ) : null}

        {state.status === "success" && state.answer !== null ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-sm leading-relaxed">{state.answer.answer}</p>
            <div className="flex items-center gap-2">
              <Badge variant={confidenceVariant(state.answer.confidence)}>
                {dictionary.askAi.confidenceLabel}:{" "}
                {dictionary.askAi.confidence[state.answer.confidence]}
              </Badge>
              {state.answer.insufficientData ? (
                <span className="text-xs text-muted-foreground">
                  {dictionary.askAi.insufficient}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
