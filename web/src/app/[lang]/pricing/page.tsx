import { getDictionary } from "@/lib/get-dictionary";
import PricingClient from "./PricingClient";

export default async function Pricing({ params }: { params: Promise<{ lang: 'en' | 'it' | 'fr' | 'de' }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang);

    return <PricingClient dict={dict} lang={lang} />;
}
