import { normalizeLocale } from "@/lib/i18n";
import { TermsClient } from "./TermsClient";

export default async function TermsPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale = normalizeLocale(lang);

    return <TermsClient lang={locale} />;
}
