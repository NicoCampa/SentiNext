import { getDictionary } from "@/lib/get-dictionary";
import HomeClient from "./HomeClient";

export default async function Home({ params }: { params: Promise<{ lang: 'en' | 'it' | 'fr' | 'de' }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);

  return <HomeClient dict={dict} lang={lang} />;
}
