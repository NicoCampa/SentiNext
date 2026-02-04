import { getDictionary } from "@/lib/get-dictionary";
import { normalizeLocale } from "@/lib/i18n";
import HomeClient from "./HomeClient";

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = normalizeLocale(lang);
  const dict = await getDictionary(locale);

  return <HomeClient dict={dict} lang={locale} />;
}
