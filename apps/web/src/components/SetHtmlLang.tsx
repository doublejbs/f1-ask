"use client";

import { SupportedLocale } from "@f1/domain";
import { useEffect } from "react";

type Props = {
  locale: SupportedLocale;
};

// 현재 locale 에 맞춰 <html lang> 을 갱신한다.
export const SetHtmlLang = ({ locale }: Props) => {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
};
