"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dictionary } from "@/i18n/Messages";
import { teamColorHex } from "@/lib/Format";
import { cn } from "@/lib/Utils";
import { LiveDriverState, TeamRadioClip } from "@f1/domain";
import { Pause, Play, Radio } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  dictionary: Dictionary;
  clips: TeamRadioClip[];
  drivers: LiveDriverState[];
};

const formatClock = (iso: string): string => {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

// 팀 라디오 클립 피드. 외부(F1 라이브타이밍) mp3 를 재생만 한다(계산 없음).
// 하나의 <audio> 를 공유해 한 번에 한 클립만 재생한다.
export const TeamRadioView = ({ dictionary, clips, drivers }: Props) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  const colorByNumber = useMemo(() => {
    const map = new Map<number, string | null>();

    for (const driver of drivers) {
      map.set(driver.driverNumber, teamColorHex(driver.teamColour));
    }

    return map;
  }, [drivers]);

  // 현재 재생 중인 클립이 목록에서 사라지면 상태를 정리한다.
  useEffect(() => {
    if (playingUrl !== null && !clips.some((c) => c.recordingUrl === playingUrl)) {
      setPlayingUrl(null);
    }
  }, [clips, playingUrl]);

  const toggle = (url: string) => {
    const audio = audioRef.current;

    if (audio === null) {
      return;
    }

    if (playingUrl === url) {
      audio.pause();
      setPlayingUrl(null);

      return;
    }

    audio.src = url;
    void audio.play();
    setPlayingUrl(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Radio className="h-4 w-4 text-primary" />
          {dictionary.teamRadio.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {clips.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            {dictionary.teamRadio.empty}
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {clips.map((clip) => {
              const isPlaying = playingUrl === clip.recordingUrl;
              const accent = colorByNumber.get(clip.driverNumber) ?? null;

              return (
                <li
                  key={`${clip.driverNumber}-${clip.timestamp}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => toggle(clip.recordingUrl)}
                    aria-label={
                      isPlaying
                        ? dictionary.teamRadio.pause
                        : dictionary.teamRadio.play
                    }
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                      isPlaying
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-foreground hover:bg-accent",
                    )}
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4 translate-x-[1px]" />
                    )}
                  </button>
                  <span
                    className="h-5 w-1 rounded-full"
                    style={{ backgroundColor: accent ?? "hsl(var(--border))" }}
                    aria-hidden
                  />
                  <span className="font-bold">{clip.driverCode}</span>
                  <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {formatClock(clip.timestamp)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <audio
          ref={audioRef}
          onEnded={() => setPlayingUrl(null)}
          className="hidden"
        />
      </CardContent>
    </Card>
  );
};
