
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function DocsIndex() {
    return (
        <div>
            <h1>Welcome to SentiNext Docs</h1>
            <p className="lead text-xl text-muted-foreground mb-8">
                Learn how to turn raw Steam reviews into actionable product insights.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-12">
                <DocsCard
                    title="Getting Started"
                    description="Create your account and analyze your first game in under 5 minutes."
                    href="/docs/getting-started"
                />
                <DocsCard
                    title="Ingesting Reviews"
                    description="Learn how SentiNext fetches, cleans, and caches Steam Community data."
                    href="/docs/ingesting-reviews"
                />
                <DocsCard
                    title="Insights & Taxonomy"
                    description="Understand how our AI classifies issues, requests, and sentiment."
                    href="/docs/insights-and-taxonomy"
                />
            </div>

            <h2>What is SentiNext?</h2>
            <p>
                SentiNext is an intelligence tool for game developers. It moves beyond simple "thumbs up/down" ratios to specific, categorized feedback.
            </p>
            <p>
                By ingesting thousands of reviews and passing them through a specialized LLM pipeline, SentiNext answers questions like:
            </p>
            <ul>
                <li>What are the top 5 technical issues causing negative reviews this week?</li>
                <li>Which feature requests are most correlated with high playtime users?</li>
                <li>Is the sentiment for "Combat Balance" improving after the last patch?</li>
            </ul>

            <div className="mt-8">
                <Button asChild>
                    <Link href="/docs/getting-started">
                        Get Started <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </div>
        </div>
    );
}

function DocsCard({ title, description, href }: any) {
    return (
        <Link href={href} className="block group">
            <div className="h-full p-6 border border-border/40 rounded-lg bg-card/30 hover:bg-card/50 transition-colors">
                <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors flex items-center">
                    {title} <ArrowRight className="ml-2 h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h3>
                <p className="text-muted-foreground text-sm no-underline">{description}</p>
            </div>
        </Link>
    )
}
