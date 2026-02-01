
import { Mail, MessageSquare, Twitter } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ContactPage() {
    return (
        <div className="container px-4 md:px-6 py-20 md:py-32 max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Get in touch</h1>
            <p className="text-xl text-muted-foreground mb-16 max-w-2xl mx-auto">
                Have questions about SentiNext? Found a bug? Just want to say hello? Here's how to reach us.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <ContactCard
                    icon={<Mail className="h-8 w-8 text-primary" />}
                    title="Email Support"
                    description="For general inquiries, account support, and enterprise sales."
                    action="Email Us"
                    href="mailto:hello@sentinext.com"
                />
                <ContactCard
                    icon={<Twitter className="h-8 w-8 text-blue-400" />}
                    title="Twitter / X"
                    description="Follow us for the latest updates, downtime alerts, and tips."
                    action="Follow @SentiNext"
                    href="https://twitter.com"
                />
                <ContactCard
                    icon={<MessageSquare className="h-8 w-8 text-secondary" />}
                    title="GitHub Issues"
                    description="Found a bug in the open source core? Report it directly to the repo."
                    action="Open Issue"
                    href="https://github.com/NicoCampa/SentiNext/issues"
                />
            </div>

            <div className="mt-20 p-8 rounded-2xl bg-gradient-to-br from-card to-background border border-border/50">
                <h2 className="text-2xl font-bold mb-4">Enterprise Inquiries</h2>
                <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                    Need a custom deployment, SLA, or specialized taxonomy training? We offer dedicated support for large studios and publishers.
                </p>
                <Button size="lg" className="bg-foreground text-background hover:bg-foreground/90" asChild>
                    <Link href="mailto:sales@sentinext.com">Contact Sales</Link>
                </Button>
            </div>
        </div>
    );
}

function ContactCard({ icon, title, description, action, href }: any) {
    return (
        <div className="flex flex-col items-center p-8 rounded-xl bg-card/30 border border-border/40 hover:bg-card/50 transition-colors">
            <div className="mb-4 p-3 rounded-full bg-background border border-border/50 shadow-sm">
                {icon}
            </div>
            <h3 className="text-xl font-bold mb-2">{title}</h3>
            <p className="text-muted-foreground text-sm mb-6 min-h-[40px]">{description}</p>
            <Button variant="outline" className="w-full" asChild>
                <Link href={href} target={href.startsWith('http') ? '_blank' : undefined}>{action}</Link>
            </Button>
        </div>
    )
}
