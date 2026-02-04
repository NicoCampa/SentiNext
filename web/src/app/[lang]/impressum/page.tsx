import { normalizeLocale } from "@/lib/i18n";
import { ImpressumClient } from "./ImpressumClient";

export default async function ImpressumPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale = normalizeLocale(lang);

    return <ImpressumClient lang={locale} />;
}
