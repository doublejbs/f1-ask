import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dictionary } from "@/i18n/Messages";
import { AiCommentary, RaceEventPriority } from "@f1/domain";
import { Sparkles } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  commentary: AiCommentary[];
};

const priorityVariant = (
  priority: RaceEventPriority,
): NonNullable<BadgeProps["variant"]> =>
  priority === RaceEventPriority.Critical ? "critical" : "high";

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

// AI 자동 해설 피드 (PRD §8.2). 중요 이벤트의 의미를 설명한다.
export const AiCommentaryView = ({ dictionary, commentary }: Props) => {
  const recent = commentary.slice().reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          {dictionary.commentary.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {recent.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            {dictionary.commentary.empty}
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {recent.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={priorityVariant(item.priority)}>
                    {item.priority}
                  </Badge>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatClock(item.timestamp)}
                  </span>
                </div>
                <p className="text-sm leading-relaxed">{item.text}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
