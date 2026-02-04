import { normalizeLocale } from "@/lib/i18n";
import { ContactClient } from "./ContactClient";

export default async function ContactPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale = normalizeLocale(lang);

    return <ContactClient lang={locale} />;
}
