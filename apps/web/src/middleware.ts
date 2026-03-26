import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root redirect — check for token cookie or header
  if (pathname === '/') {
    // In dev mode, tokens are in localStorage (client-side only)
    // For server middleware, we check cookies
    const token = request.cookies.get('accessToken')?.value;
    if (token) {
      return NextResponse.redirect(new URL('/home', request.url));
    }
    return NextResponse.redirect(new URL('/landing', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/'],
};
