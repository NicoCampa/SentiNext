
export default function FaqPage() {
    return (
        <div>
            <h1>Frequently Asked Questions</h1>

            <h2>General</h2>

            <h3>Is SentiNext affiliated with Valve/Steam?</h3>
            <p>
                No. SentiNext is an independent tool that uses the public Steam Community Data API. We are not endorsed by or affiliated with Valve Corporation.
            </p>

            <h3>Can I analyze my competitor's games?</h3>
            <p>
                Yes. Since we use public review data, you can analyze any App ID available on the Steam store. This is useful for competitive benchmarking (e.g., "What are players complaining about in Game X?").
            </p>

            <h2>Analysis</h2>

            <h3>Why is analysis taking so long?</h3>
            <p>
                LLM processing is computationally expensive. We process roughly 500-1000 reviews per minute. If you requested 50,000 reviews, it can take up to an hour. Please be patient; we'll email you when it's done.
            </p>

            <h3>Can I customize the taxonomy?</h3>
            <p>
                On the <strong>Team Plan</strong>, yes. We can fine-tune the classification categories to match your specific genre (e.g., adding "Gunplay" tags for an FPS or "Economy" tags for a Strategy game).
            </p>

            <h2>Billing</h2>

            <h3>When will billing be enabled?</h3>
            <p>
                We are currently in Public Beta. All plans are free during this period. We expect to enable billing in Q4 2024.
            </p>
        </div>
    );
}
