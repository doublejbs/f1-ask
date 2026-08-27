import type { MetadataRoute } from "next";

// PWA 매니페스트 (docs/30-app-service.md §1 PWA). 설치형 앱 정체성을 정의한다.
//
// **브랜딩은 자리표시자다** — name·short_name·아이콘(public/icons/*)은 리브랜딩 시 교체한다.
// "F1"·팀·서킷명은 상표 이슈가 있어 공개 출시 전 자체 브랜드로 바꿔야 한다(docs/30 §법적 리스크).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Racepilot",
    short_name: "Racepilot",
    description: "Understand the race in real time — a live second screen.",
    // 첫 화면은 /en 으로 보낸다(루트가 로케일로 리다이렉트).
    start_url: "/en",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0e1a",
    theme_color: "#0a0e1a",
    icons: [
      { src: "/icons/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      {
        src: "/icons/icon-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable",
      },
    ],
  };
}
