import { normalizeLocale } from "@/lib/i18n";
import { PrivacyClient } from "./PrivacyClient";

export default async function PrivacyPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale = normalizeLocale(lang);

    return <PrivacyClient lang={locale} />;
}
