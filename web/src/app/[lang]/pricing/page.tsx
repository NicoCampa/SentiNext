import { getDictionary } from "@/lib/get-dictionary";
import { normalizeLocale } from "@/lib/i18n";
import PricingClient from "./PricingClient";

export default async function Pricing({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale = normalizeLocale(lang);
    const dict = await getDictionary(locale);

    return <PricingClient dict={dict} />;
}
