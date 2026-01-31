#!/bin/bash
# Generate TypeScript types from OpenAPI schema
#
# Usage:
#   ./scripts/generate-types.sh [backend-url]
#
# Examples:
#   ./scripts/generate-types.sh                    # Uses localhost:8000
#   ./scripts/generate-types.sh http://api.example.com
#
# Prerequisites:
#   - Backend must be running
#   - Run `npm install` in frontend/ first

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

BACKEND_URL="${1:-http://localhost:8000}"
OPENAPI_URL="$BACKEND_URL/openapi.json"

echo "Generating TypeScript types from OpenAPI schema..."
echo "  Backend URL: $BACKEND_URL"
echo "  OpenAPI URL: $OPENAPI_URL"

# Check if backend is reachable
if ! curl -s --head "$OPENAPI_URL" | head -n 1 | grep -q "200"; then
    echo ""
    echo "Error: Cannot reach $OPENAPI_URL"
    echo "Make sure the backend is running:"
    echo "  cd backend && python -m backend.main"
    exit 1
fi

cd "$FRONTEND_DIR"

# Check if openapi-typescript is installed
if ! npx openapi-typescript --version > /dev/null 2>&1; then
    echo "Installing openapi-typescript..."
    npm install --save-dev openapi-typescript
fi

# Generate types
OUTPUT_FILE="src/types/api.generated.ts"
echo "  Output: $OUTPUT_FILE"

npx openapi-typescript "$OPENAPI_URL" -o "$OUTPUT_FILE"

echo ""
echo "Types generated successfully!"
echo ""
echo "Usage in your code:"
echo "  import type { paths, components } from '@/types/api.generated';"
echo "  type AnalyzeResponse = components['schemas']['AnalyzeResponse'];"
