import { getDictionary } from "@/lib/get-dictionary";
import { TermsClient } from "./TermsClient";

export default async function TermsPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang as any);

    return <TermsClient dict={dict} lang={lang} />;
}
