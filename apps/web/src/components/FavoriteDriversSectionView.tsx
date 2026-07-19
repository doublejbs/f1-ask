import { FavoriteDriverCardView } from "@/components/FavoriteDriverCardView";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dictionary } from "@/i18n/Messages";
import { FavoriteDriverDetail, SupportedLocale } from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  details: FavoriteDriverDetail[];
  onRemove: (driverNumber: number) => void;
};

// 관심 드라이버 카드 묶음. 선택된 드라이버가 없으면 안내를 표시한다.
export const FavoriteDriversSectionView = ({
  dictionary,
  locale,
  details,
  onRemove,
}: Props) => (
  <section className="flex flex-col gap-3">
    <h2 className="text-sm font-semibold tracking-tight">
      {dictionary.favoriteCard.title}
    </h2>

    {details.length === 0 ? (
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground">
            {dictionary.favoriteCard.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-xs text-muted-foreground">
          {dictionary.favoriteCard.empty}
        </CardContent>
      </Card>
    ) : (
      details.map((detail) => (
        <FavoriteDriverCardView
          key={detail.driverNumber}
          dictionary={dictionary}
          locale={locale}
          detail={detail}
          onRemove={onRemove}
        />
      ))
    )}
  </section>
);
