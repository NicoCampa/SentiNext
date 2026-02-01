
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function GettingStartedPage() {
    return (
        <div>
            <h1>Getting Started</h1>
            <p>
                This guide will walk you through setting up SentiNext using our hosted version.
            </p>

            <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg my-6 flex gap-4 items-start">
                <AlertCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                    <h4 className="font-bold text-primary mb-1 text-sm">Hosted Cloud vs. Local Desktop</h4>
                    <p className="text-sm text-muted-foreground m-0">
                        This guide covers the <strong>Hosted Web App</strong>. If you prefer to run SentiNext locally on your own machine (BYO API Key), check out the <Link href="/docs/developers">Developer Docs</Link>.
                    </p>
                </div>
            </div>

            <h2>1. Access the Dashboard</h2>
            <p>
                Open the <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">SentiNext Dashboard</Link>. You can browse public demo apps immediately without logging in.
            </p>

            <h2>2. Create an Account</h2>
            <p>
                To track your own games or save analysis history, click <strong>Log In</strong> in the top right. We use Clerk for secure, passwordless authentication via Email, Google, or GitHub.
            </p>

            <h2>3. Analyze Your First Game</h2>
            <ol>
                <li>Click <strong>New Analysis</strong> in the sidebar.</li>
                <li>Enter the <strong>Steam App ID</strong> of the game you want to analyze (e.g., <code>413150</code> for Stardew Valley).</li>
                <li>
                    Configure your fetch settings:
                    <ul>
                        <li><strong>Review Count</strong>: Start with 500-1000 reviews for a quick initial scan.</li>
                        <li><strong>Filter</strong>: Choose "Recent" to see the latest feedback or "All" for historical trends.</li>
                    </ul>
                </li>
                <li>Click <strong>Start Analysis</strong>.</li>
            </ol>

            <h2>4. Explore Insights</h2>
            <p>
                Once the analysis is complete (usually 1-2 minutes for 1000 reviews), you will be redirected to the Game Dashboard. Here you can explore:
            </p>
            <ul>
                <li><strong>Summary</strong>: High-level sentiment distribution and key topics.</li>
                <li><strong>Issues</strong>: Top classified bugs and technical problems.</li>
                <li><strong>Requests</strong>: Most requested features and quality-of-life improvements.</li>
                <li><strong>Explorer</strong>: Search through individual reviews with advanced filtering.</li>
            </ul>
        </div>
    );
}
