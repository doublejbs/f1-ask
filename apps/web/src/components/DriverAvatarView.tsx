"use client";

import { cn } from "@/lib/Utils";
import { teamColorHex } from "@/lib/Format";
import { useState } from "react";

type Props = {
  code: string;
  headshotUrl?: string | null;
  teamColour?: string | null;
  className?: string;
};

// 드라이버 헤드샷 아바타. 사진이 없거나 로드 실패하면 팀 컬러 링 + 코드 이니셜로 대체한다.
// OpenF1 headshot_url 은 외부 CDN 이므로 최적화 없이 plain <img> 로 렌더한다.
export const DriverAvatarView = ({
  code,
  headshotUrl,
  teamColour,
  className,
}: Props) => {
  const [failed, setFailed] = useState(false);
  const ring = teamColorHex(teamColour) ?? "hsl(var(--border))";
  const showImage = headshotUrl && !failed;

  return (
    <span
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-muted text-[10px] font-bold",
        className,
      )}
      style={{ borderColor: ring }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={headshotUrl}
          alt={code}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-muted-foreground">{code.slice(0, 3)}</span>
      )}
    </span>
  );
};
