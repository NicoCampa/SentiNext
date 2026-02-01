
import Link from "next/link";
import { Terminal } from "lucide-react";

export default function DevelopersPage() {
    return (
        <div>
            <div className="flex items-center gap-2 mb-6 text-muted-foreground">
                <Terminal className="h-5 w-5" />
                <span className="uppercase tracking-widest text-xs font-bold">Contributor Zone</span>
            </div>

            <h1>For Developers</h1>
            <p>
                SentiNext operates an "Open Core" model. The backend engine, frontend UI, and desktop wrapper are all open source.
            </p>

            <div className="p-4 border border-border/40 rounded-lg bg-card/30 my-6">
                <h3 className="text-lg font-bold mt-0">Repositories</h3>
                <ul className="list-none pl-0 mt-2 space-y-2">
                    <li>
                        <Link href="https://github.com/NicoCampa/SentiNext" className="font-mono text-primary hover:underline">
                            github.com/NicoCampa/SentiNext
                        </Link>
                        <br />
                        <span className="text-sm text-muted-foreground">Monorepo containing Backend (FastAPI), Frontend (Next.js), and Desktop (Tauri).</span>
                    </li>
                </ul>
            </div>

            <h2>Running Locally</h2>
            <p>
                You can run the full stack on your machine.
            </p>

            <h3>Prerequisites</h3>
            <ul>
                <li>Node.js 18+</li>
                <li>Python 3.11+ (Conda recommended)</li>
                <li>PostgreSQL (or use the built-in SQLite/DuckDB mode for testing)</li>
            </ul>

            <h3>Quick Start</h3>
            <pre>
                {`# 1. Clone the repo
git clone https://github.com/NicoCampa/SentiNext.git
cd SentiNext

# 2. Setup Backend
conda env create -f environment.yml
conda activate SentiNext
uvicorn backend.local_app:app --reload

# 3. Setup Frontend
cd frontend
npm install
npm run dev`}
            </pre>

            <h2>Desktop App</h2>
            <p>
                The project includes a Tauri-based desktop wrapper that bundles the Python server and Next.js frontend into a single native executable for macOS and Windows.
            </p>
            <p>
                See <code>/desktop/README.md</code> in the repo for build instructions.
            </p>
        </div>
    );
}
