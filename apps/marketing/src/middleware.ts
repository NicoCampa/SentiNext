import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // Skip public files, api, and _next
    if (
        [
            '/favicon.ico',
            '/logo.png',
        ].includes(pathname) ||
        pathname.startsWith('/api') ||
        pathname.startsWith('/_next') ||
        pathname.includes('.')
    ) {
        return;
    }

    // Always redirect to /en if no locale prefix
    const hasPrefixEn = pathname.startsWith('/en/') || pathname === '/en';
    if (!hasPrefixEn) {
        return NextResponse.redirect(
            new URL(`/en${pathname === '/' ? '' : pathname}`, request.url)
        );
    }
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
