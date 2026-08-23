"use client";

import { useEffect } from "react";

// 서비스 워커 등록 (docs/30-app-service.md §1 PWA). 렌더링 UI 는 없다.
// 등록 실패가 앱을 막지 않도록 조용히 흡수한다(오프라인·PWA 는 부가 기능).
export const ServiceWorkerRegister = () => {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 등록 실패는 무시한다 — 핵심 기능은 SW 없이도 동작한다.
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
};
