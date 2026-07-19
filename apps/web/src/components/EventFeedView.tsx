import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dictionary } from "@/i18n/Messages";
import { translateRaceEvent } from "@/i18n/TranslateRaceEvent";
import { RaceEvent, RaceEventPriority, SupportedLocale } from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  events: RaceEvent[];
};

const MAX_EVENTS = 12;

const priorityVariant = (
  priority: RaceEventPriority,
): NonNullable<BadgeProps["variant"]> => {
  switch (priority) {
    case RaceEventPriority.Critical:
      return "critical";
    case RaceEventPriority.High:
      return "high";
    case RaceEventPriority.Medium:
      return "medium";
    default:
      return "low";
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

// 최근 이벤트 피드. 이벤트는 locale 에 따라 번역해 표시한다.
export const EventFeedView = ({ dictionary, locale, events }: Props) => {
  const recent = events.slice(-MAX_EVENTS).reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.events.title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {recent.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            {dictionary.events.empty}
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {recent.map((event) => (
              <li
                key={event.id}
                className="flex items-start gap-2 px-4 py-2.5 text-sm"
              >
                <Badge variant={priorityVariant(event.priority)}>
                  {event.priority}
                </Badge>
                <span className="flex-1">
                  {translateRaceEvent(event, locale)}
                </span>
                <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {formatClock(event.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
