import { LiveDashboardView } from "@/components/LiveDashboardView";
import { DEFAULT_LOCALE, isSupportedLocale } from "@f1/domain";

type Props = {
  params: Promise<{ locale: string }>;
};

const LocaleHomePage = async ({ params }: Props) => {
  const { locale } = await params;
  const resolved = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;

  return <LiveDashboardView locale={resolved} />;
};

export default LocaleHomePage;
