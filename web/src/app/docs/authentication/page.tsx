
import Link from "next/link";

export default function AuthenticationPage() {
    return (
        <div>
            <h1>Authentication</h1>
            <p>
                SentiNext uses <Link href="https://clerk.com" target="_blank">Clerk</Link> for secure, managed authentication.
            </p>

            <h2>Why Log In?</h2>
            <p>
                While some features are available anonymously (e.g., viewing public demo dashboards), you need an account to:
            </p>
            <ul>
                <li>Trigger new analysis jobs.</li>
                <li>Save games to your personal dashboard.</li>
                <li>Access Team organizations (if on a Team plan).</li>
            </ul>

            <h2>Supported Methods</h2>
            <p>Currently, we support:</p>
            <ul>
                <li><strong>Email / Password</strong></li>
                <li><strong>Google OAuth</strong></li>
                <li><strong>GitHub OAuth</strong></li>
            </ul>

            <h2>Session Management</h2>
            <p>
                Sessions persist for 7 days. If you are using the SentiNext API directly, you will need to generate a <strong>Bearer Token</strong> from the UI (profile settings) to authenticate your requests.
            </p>
        </div>
    );
}
