import { SetHtmlLang } from "@/components/SetHtmlLang";
import { isSupportedLocale, SUPPORTED_LOCALES } from "@f1/domain";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export const generateStaticParams = () =>
  SUPPORTED_LOCALES.map((locale) => ({ locale }));

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

const LocaleLayout = async ({ children, params }: Props) => {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  return (
    <>
      <SetHtmlLang locale={locale} />
      {children}
    </>
  );
};

export default LocaleLayout;
