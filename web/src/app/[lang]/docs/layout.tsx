import { getDictionary } from "@/lib/get-dictionary";
import { DocsSidebar } from "@/components/layout/docs-sidebar";

export default async function DocsLayout({
    children,
    params
}: {
    children: React.ReactNode,
    params: Promise<{ lang: string }>
}) {
    const { lang } = await params;
    const dict = await getDictionary(lang as any);

    return (
        <div className="container px-4 md:px-6 py-16 flex flex-col md:flex-row gap-16 relative">
            <div className="absolute inset-0 bg-[#00F0FF]/[0.02] -z-10" />

            <DocsSidebar dict={dict} lang={lang} />

            {/* Main Content */}
            <main className="flex-1 min-w-0 max-w-4xl prose prose-invert 
                prose-headings:font-bold prose-headings:tracking-tighter prose-headings:uppercase
                prose-h1:text-5xl prose-h1:mb-12
                prose-h2:text-2xl prose-h2:mt-16 prose-h2:mb-6 prose-h2:text-[#00F0FF]/80
                prose-p:text-lg prose-p:leading-relaxed prose-p:text-foreground/70 prose-p:font-light
                prose-li:text-lg prose-li:my-4 prose-li:text-foreground/70
                prose-strong:text-foreground prose-strong:font-bold
                prose-code:text-[#00F0FF] prose-code:bg-[#00F0FF]/10 prose-code:border prose-code:border-[#00F0FF]/20 prose-code:px-2 prose-code:py-0.5 prose-code:rounded-sm
                prose-a:text-[#00F0FF] prose-a:no-underline hover:prose-a:text-[#00F0FF]/80
                ">
                {children}
            </main>
        </div>
    );
}
