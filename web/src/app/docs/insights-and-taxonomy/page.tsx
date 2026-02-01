
export default function InsightsAndTaxonomyPage() {
    return (
        <div>
            <h1>Insights & Taxonomy</h1>
            <p>
                The core value of SentiNext is turning unstructured text (reviews) into structured data (taxonomy). We use a specialized Large Language Model (LLM) pipeline to achieve this.
            </p>

            <h2>The Taxonomy Model</h2>
            <p>
                Every review is evaluated against three primary vectors:
            </p>

            <h3>1. Sentiment</h3>
            <p>
                Beyond Steam's binary "Recommend / Not Recommend", we classify specific sentiment towards game aspects:
            </p>
            <ul>
                <li><strong>Appreciation</strong>: Praise for art, music, story, etc.</li>
                <li><strong>Frustration</strong>: Anger towards bugs, monetization, or balance.</li>
                <li><strong>Mixed</strong>: Nuanced feedback.</li>
            </ul>

            <h3>2. Issues (Bugs & Friction)</h3>
            <p>
                We identify technical shortcomings and map them to standard categories:
            </p>
            <ul>
                <li><code>Performance</code> (Lag, FPS drops, stuttering)</li>
                <li><code>Stability</code> (Crashes, freezes, launch errors)</li>
                <li><code>UX/UI</code> (Menu navigation, font size, controls)</li>
                <li><code>Network</code> (Disconnection, lag compensation)</li>
                <li><code>Gameplay</code> (Bugs, glitches, soft-locks)</li>
            </ul>

            <h3>3. Requests (Features & Content)</h3>
            <p>
                We extract user desires and group them:
            </p>
            <ul>
                <li><code>Content</code> (New maps, characters, skins)</li>
                <li><code>QoL</code> (Quality of Life improvements)</li>
                <li><code>Balance</code> (Buffs, nerfs, difficulty adjustments)</li>
                <li><code>Accessibility</code> (Colorblind modes, controller support)</li>
            </ul>

            <h2>Evidence Extraction</h2>
            <p>
                SentiNext doesn't just tag a review; it extracts the <strong>Evidence Quote</strong>.
            </p>
            <blockquote className="border-l-4 border-primary pl-4 italic my-4 text-muted-foreground">
                "The game is great but it crashes every time I try to load the second level."
            </blockquote>
            <p>
                <strong>Tags:</strong> <code>Stability / Crash</code>, <code>Context: Second Level</code>
            </p>
            <p>
                This allows you to verify <em>why</em> a tag was applied without reading the entire 5-paragraph review.
            </p>
        </div>
    );
}
