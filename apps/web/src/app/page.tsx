import { DEFAULT_LOCALE } from "@f1/domain";
import { redirect } from "next/navigation";

// 루트 진입 시 기본 locale 로 이동한다.
const RootPage = () => {
  redirect(`/${DEFAULT_LOCALE}`);
};

export default RootPage;
