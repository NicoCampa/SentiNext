
export default function AdminAndDataPage() {
    return (
        <div>
            <h1>Admin & Data Policies</h1>
            <p>
                We take data integrity and safety seriously. SentiNext is designed to prevent accidental data loss.
            </p>

            <h2>Destructive Actions</h2>
            <p>
                By default, <strong>Destructive Actions</strong> (Deleting a game, Clearing the database) are:
            </p>
            <ol>
                <li><strong>Disabled via Environment Variables</strong>: The server must be started with <code>SENTINEXT_ENABLE_DESTRUCTIVE=1</code>.</li>
                <li><strong>Gated by Admin Token</strong>: Even if enabled, requests must include a secret <code>x-admin-token</code> header or be performed by an allowed Admin User ID.</li>
            </ol>
            <p>
                In the Hosted Web App, these features are strictly limited to System Administrators. You cannot accidentally delete your team's data.
            </p>

            <h2>Data Retention</h2>
            <p>
                We store public Steam reviews that you ask us to ingest.
            </p>
            <ul>
                <li><strong>Free Tier</strong>: Data is retained for 7 days. Afterward, the cached reviews may be flushed, requiring a re-fetch.</li>
                <li><strong>Pro/Team</strong>: Data is retained for 90 days or indefinitely, depending on your plan.</li>
            </ul>

            <h2>Removing Data</h2>
            <p>
                If you wish to remove your account or specific analysis data:
            </p>
            <ul>
                <li><strong>Self-Service</strong>: Use the "Delete Account" option in your Profile settings. This will wipe your user record and disassociate any analysis jobs.</li>
                <li><strong>Contact Support</strong>: Email us at <a href="mailto:privacy@sentinext.com">privacy@sentinext.com</a> for a full GDPR/CCPA request.</li>
            </ul>
        </div>
    );
}
