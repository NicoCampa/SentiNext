
export default function IngestingReviewsPage() {
    return (
        <div>
            <h1>Cloud Ingestion</h1>
            <p>
                The SentiNext Cloud Agent handles all data fetching for you.
            </p>

            <h2>How the Agent Works</h2>
            <ol>
                <li><strong>Query</strong>: The agent checks the Steam Community API for the latest review batch.</li>
                <li><strong>Filter</strong>: It applies your filters (Language: English, Playtime &gt; 2h).</li>
                <li><strong>Cache</strong>: Data is stored in our high-speed PostgreSQL database.</li>
            </ol>

            <h2>Quotas</h2>
            <p>
                During the Beta, we enforce fair-use limits to ensure availability for all users.
            </p>
            <ul>
                <li><strong>Max Concurrent Jobs</strong>: 1 per user.</li>
                <li><strong>Reviews per Job</strong>: Up to 2,000.</li>
            </ul>
            <p>
                Need to ingest more history? <a href="/contact">Contact us</a> for enterprise access.
            </p>
        </div>
    );
}
