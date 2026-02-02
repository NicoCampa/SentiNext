import { getDictionary } from "@/lib/get-dictionary";
import HowItWorksClient from "./HowItWorksClient";

export default async function HowItWorks({ params }: { params: Promise<{ lang: 'en' | 'it' | 'fr' | 'de' }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang);

    return <HowItWorksClient dict={dict} lang={lang} />;
}
