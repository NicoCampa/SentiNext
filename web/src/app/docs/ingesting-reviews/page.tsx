
export default function IngestingReviewsPage() {
    return (
        <div>
            <h1>Ingesting Reviews</h1>
            <p>
                SentiNext pulls data directly from the public Steam Community API. We do not require a Steam Publisher API Key, so you can analyze any game on the store, including competitors.
            </p>

            <h2>How it Works</h2>
            <p>
                When you trigger an ingestion job, the backend:
            </p>
            <ol>
                <li>Queries the Steam API for the specified App ID.</li>
                <li>Iteratively fetches pages of reviews using a <code>cursor</code>.</li>
                <li>Deduplicates reviews against existing data in our database.</li>
                <li>Filters out "off-topic" reviews or those with insufficient playtime (configurable).</li>
            </ol>

            <h2>Rate Limits & Performance</h2>
            <h3>Steam API Limits</h3>
            <p>
                Steam rates limit aggressive scraping. SentiNext includes built-in backoff strategies.
            </p>
            <ul>
                <li><strong>Hosted Cloud</strong>: We manage a shared quota pool. Large ingestions (&gt;5,000 reviews) may be queued.</li>
                <li><strong>Local Desktop</strong>: Your IP is the limit. You can generally fetch ~10,000 reviews significantly faster.</li>
            </ul>

            <h3>Processing Time</h3>
            <p>
                After fetching, reviews are sent to the LLM for classification. This is the most time-consuming step.
            </p>
            <table className="w-full text-left border-collapse my-6">
                <thead>
                    <tr className="border-b border-border/40">
                        <th className="py-2">Batch Size</th>
                        <th className="py-2">Est. Time</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className="border-b border-border/20">
                        <td className="py-2">100 Reviews</td>
                        <td className="py-2">~15 seconds</td>
                    </tr>
                    <tr className="border-b border-border/20">
                        <td className="py-2">1,000 Reviews</td>
                        <td className="py-2">~2 minutes</td>
                    </tr>
                    <tr className="border-b border-border/20">
                        <td className="py-2">10,000 Reviews</td>
                        <td className="py-2">~15-20 minutes</td>
                    </tr>
                </tbody>
            </table>

            <h2>Updating Data</h2>
            <p>
                You can re-run analysis on an existing game at any time. SentiNext uses an "Incremental Update" strategy:
            </p>
            <ul>
                <li>By default, we look for new reviews posted since the last scan.</li>
                <li>You can force a <strong>Full Refresh</strong> to re-classify old reviews with a newer taxonomy model.</li>
            </ul>
        </div>
    );
}
