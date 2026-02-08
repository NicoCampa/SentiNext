import { getDictionary } from "@/lib/get-dictionary";
import { normalizeLocale } from "@/lib/i18n";
import HowItWorksClient from "./HowItWorksClient";

export default async function HowItWorks({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale = normalizeLocale(lang);
    const dict = await getDictionary(locale);

    return <HowItWorksClient dict={dict} />;
}
