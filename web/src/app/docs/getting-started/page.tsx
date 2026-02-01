
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function GettingStartedPage() {
    return (
        <div>
            <h1>Getting Started</h1>
            <p>
                Welcome to the SentiNext Closed Beta. This guide will help you set up your account and start your first AI analysis.
            </p>

            <div className="p-4 bg-secondary/10 border border-secondary/20 rounded-lg my-6 flex gap-4 items-start">
                <AlertTriangle className="h-5 w-5 text-secondary mt-0.5 flex-shrink-0" />
                <div>
                    <h4 className="font-bold text-secondary mb-1 text-sm font-mono uppercase">Beta Notice</h4>
                    <p className="text-sm text-muted-foreground m-0">
                        You are using the Hosted Cloud version. No local installation or GPU is required.
                    </p>
                </div>
            </div>

            <h2>1. Access the Cloud Dashboard</h2>
            <p>
                Navigate to the <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">SentiNext App</Link>.
            </p>

            <h2>2. Authenticate</h2>
            <p>
                You must log in to trigger AI jobs. We use secure passwordless auth (Clerk).
            </p>

            <h2>3. Run Your First Agent Job</h2>
            <ol>
                <li>Click <strong>New Analysis</strong>.</li>
                <li>Enter a Steam App ID (e.g., <code>1086940</code>).</li>
                <li>Select <strong>Recent Reviews</strong> (recommended for faster results).</li>
                <li>Click <strong>Deploy Agent</strong>.</li>
            </ol>
            <p>
                The agent will queue your job. You can close the tab—we'll email you when the analysis is complete.
            </p>
        </div>
    );
}
