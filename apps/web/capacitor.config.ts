import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor 설정 (docs/30-app-service.md §2 네이티브 래핑).
//
// 이 앱은 SSR + API 라우트 + 서버 전용 시크릿(OpenF1 키)을 쓰므로 정적 export 로 통째
// 번들할 수 없다. 그래서 **네이티브 셸이 호스팅된 웹앱 URL 을 로드**하는 방식을 쓴다
// (server.url). Capacitor 플러그인(푸시 등)은 웹 코드가 @capacitor/* 를 import 하면 브리지된다.
//
// **브랜딩·URL 은 자리표시자다** — appId(역도메인)·appName·server.url 을 실제 값으로 바꾼다.
// "F1" 등 상표는 공개 출시 전 자체 브랜드로 교체(docs/30 §법적 리스크).
const config: CapacitorConfig = {
  appId: "app.racepilot.mobile",
  appName: "Racepilot",
  // server.url 을 쓰므로 webDir 내용은 사실상 로드되지 않지만, 유효 경로여야 한다.
  webDir: "public",
  server: {
    // 배포된 웹앱 주소로 바꾼다(예: https://second-screen.vercel.app).
    // 로컬 실기기 테스트는 개발 PC 의 LAN IP 로: http://192.168.0.x:3000
    // url: "https://YOUR-DEPLOYMENT.example.com",
    androidScheme: "https",
  },
};

export default config;
