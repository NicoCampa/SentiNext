import { getDictionary } from "@/lib/get-dictionary";
import { normalizeLocale } from "@/lib/i18n";
import ProductClient from "./ProductClient";

export default async function Product({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale = normalizeLocale(lang);
    const dict = await getDictionary(locale);

    return <ProductClient dict={dict} />;
}
