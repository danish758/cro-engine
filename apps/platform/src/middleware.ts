import { NextResponse, type NextRequest } from 'next/server';
import { getAccountBySessionId, SESSION_COOKIE } from '@/lib/session';

// Node.js runtime middleware (stable since Next.js 15.5) — this is purely a
// session-auth gate now. Unlike v1, no experiment-bucketing logic lives in
// platform middleware at all: that moved to the SDK, which runs inside
// *consuming* apps (see apps/demo-consumer). Platform never computes
// anyone's bucket; it only stores config and receives events.
//
// /login and /signup are simply not in the matcher below, so they're public
// by omission rather than by an in-function exclusion check. /api/v1/* (the
// SDK-facing API) is also excluded — that's authenticated by API key inside
// the route handlers themselves, a completely different mechanism from this
// session cookie.
export const config = {
  runtime: 'nodejs',
  matcher: ['/', '/projects/:path*', '/api/projects/:path*'],
};

export async function middleware(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const account = await getAccountBySessionId(sessionId);

  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL(account ? '/projects' : '/login', request.url));
  }

  if (!account) {
    // API routes get a JSON 401, not a redirect — fetch() follows redirects
    // transparently, so a client-side fetch to /api/projects would otherwise
    // silently receive the /login page's HTML with a 200 status instead of
    // an error it can actually detect.
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}
