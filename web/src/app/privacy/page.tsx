
export default function PrivacyPage() {
    return (
        <div className="container px-4 md:px-6 py-20 max-w-3xl mx-auto prose prose-invert prose-headings:font-heading prose-a:text-primary">
            <h1>Privacy Policy</h1>
            <p className="text-muted-foreground">Last updated: February 1, 2026</p>

            <p>
                This Privacy Policy describes how SentiNext ("we", "us", or "our") collects, uses, and discloses your personal information when you use our service.
            </p>

            <h2>1. Information We Collect</h2>
            <p>
                <strong>Account Information:</strong> When you create an account via Clerk, we collect your email address and authentication provider ID (e.g., GitHub ID).
            </p>
            <p>
                <strong>Usage Data:</strong> We collect anonymous metrics about how you interact with the dashboard (e.g., number of searches, error rates) to improve performance.
            </p>
            <p>
                <strong>Review Data:</strong> We ingest and store public review data from the Steam Community API on your behalf. This data is public information.
            </p>

            <h2>2. How We Use Your Information</h2>
            <ul>
                <li>To provide and maintain the Service.</li>
                <li>To generate aggregated insights for your games.</li>
                <li>To notify you about changes to our Service.</li>
                <li>To provide customer support.</li>
            </ul>

            <h2>3. Data Retention</h2>
            <p>
                We generally retain data for as long as your account is active. For Free tier users, we may clear cached analysis data after 7 days of inactivity to save resources.
            </p>

            <h2>4. Third-Party Services</h2>
            <p>
                We use the following third-party services:
            </p>
            <ul>
                <li><strong>Vercel & Render:</strong> For hosting and infrastructure.</li>
                <li><strong>Clerk:</strong> For authentication and user management.</li>
                <li><strong>Neon / PostgreSQL:</strong> For database storage.</li>
                <li><strong>Google Gemini / OpenAI:</strong> For LLM processing (your review text is sent to these providers for classification).</li>
            </ul>

            <h2>5. Contact Us</h2>
            <p>
                If you have any questions about this Privacy Policy, please contact us at <a href="mailto:privacy@sentinext.com">privacy@sentinext.com</a>.
            </p>
        </div>
    );
}
