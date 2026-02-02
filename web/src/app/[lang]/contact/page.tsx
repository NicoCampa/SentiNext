import { getDictionary } from "@/lib/get-dictionary";
import { ContactClient } from "./ContactClient";

export default async function ContactPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang as any);

    return <ContactClient dict={dict} lang={lang} />;
}
