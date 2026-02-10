import { getDictionary } from "@/lib/get-dictionary";
import { normalizeLocale } from "@/lib/i18n";
import DemoClient from "./DemoClient";

export default async function Demo({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale = normalizeLocale(lang);
    const dict = await getDictionary(locale);

    return <DemoClient dict={dict} />;
}
