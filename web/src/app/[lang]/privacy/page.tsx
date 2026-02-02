import { getDictionary } from "@/lib/get-dictionary";
import { PrivacyClient } from "./PrivacyClient";

export default async function PrivacyPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang as any);

    return <PrivacyClient dict={dict} lang={lang} />;
}
