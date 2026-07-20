"use client";

import { TeamRadioClip } from "@f1/domain";
import { useCallback, useEffect, useRef, useState } from "react";

export type TeamRadioPlayerController = {
  // 현재 재생 중인 클립의 recordingUrl. 재생 중이 아니면 null.
  playingUrl: string | null;
  // 같은 url 을 다시 누르면 일시정지, 다른 url 이면 그 클립으로 갈아탄다.
  togglePlay: (url: string) => void;
};

// 팀 라디오 재생 소유권을 훅으로 끌어올린다.
// 재생 버튼이 순위 행과 상세 시트 두 곳에 있으므로 단일 <audio> 를 훅이 소유해
// 어디서 눌러도 한 번에 하나만 재생되게 한다. 계산 없이 외부 mp3 를 재생만 한다.
export const useTeamRadioPlayer = (
  clips: TeamRadioClip[],
): TeamRadioPlayerController => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  // 오디오 엘리먼트는 클라이언트에서만 생성한다.
  useEffect(() => {
    const audio = new Audio();

    const handleEnded = () => {
      setPlayingUrl(null);
    };

    // 재생이 끝나면 상태를 되돌린다(일시정지 아이콘이 남는 것을 막는다).
    audio.addEventListener("ended", handleEnded);
    audioRef.current = audio;

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  // 재생 중이던 클립이 목록에서 사라지면 상태를 정리한다.
  useEffect(() => {
    if (playingUrl === null) {
      return;
    }

    if (clips.some((clip) => clip.recordingUrl === playingUrl)) {
      return;
    }

    audioRef.current?.pause();
    setPlayingUrl(null);
  }, [clips, playingUrl]);

  const togglePlay = useCallback(
    (url: string) => {
      const audio = audioRef.current;

      if (audio === null) {
        return;
      }

      if (playingUrl === url) {
        audio.pause();
        setPlayingUrl(null);

        return;
      }

      audio.pause();
      audio.src = url;
      setPlayingUrl(url);

      // 외부 mp3 404 · 자동재생 차단 등으로 reject 될 수 있다. 조용히 상태만 되돌린다.
      void audio.play().catch(() => {
        setPlayingUrl((current) => (current === url ? null : current));
      });
    },
    [playingUrl],
  );

  return { playingUrl, togglePlay };
};
