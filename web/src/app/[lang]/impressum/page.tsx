import { getDictionary } from "@/lib/get-dictionary";
import { ImpressumClient } from "./ImpressumClient";

export default async function ImpressumPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang as any);

    return <ImpressumClient dict={dict} lang={lang} />;
}
