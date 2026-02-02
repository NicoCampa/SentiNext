import { getDictionary } from "@/lib/get-dictionary";
import ProductClient from "./ProductClient";

export default async function Product({ params }: { params: Promise<{ lang: 'en' | 'it' | 'fr' | 'de' }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang);

    return <ProductClient dict={dict} lang={lang} />;
}
