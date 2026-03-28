import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root redirect — check for token cookie
  if (pathname === '/') {
    const token = request.cookies.get('accessToken')?.value;
    if (token) {
      return NextResponse.redirect(new URL('/home', request.url));
    }
    return NextResponse.redirect(new URL('/landing', request.url));
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/', '/((?!api|_next|.*\\..*).*)'],
};
