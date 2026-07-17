import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const CAMPAIGN_PATH_PREFIX = '/tournaments/campaigns/';
const PUBLIC_DETAIL_PATH =
  /^\/(matches|teams|team-matches|tournaments|notices)\/([^/]+)(?:\/(bracket|results|awards|reviews))?$/;
const UUID_PATH_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith(CAMPAIGN_PATH_PREFIX)) {
    const encodedSlug = pathname.slice(CAMPAIGN_PATH_PREFIX.length);
    const response = await fetch(
      `${getInternalApiOrigin()}/api/v1/tournaments/campaigns/${encodedSlug}/availability`,
      { method: 'HEAD', cache: 'no-store', headers: { accept: 'application/json' } },
    );

    return response.status === 404
      ? NextResponse.next({ status: 404 })
      : NextResponse.next();
  }

  const detailMatch = pathname.match(PUBLIC_DETAIL_PATH);
  if (!detailMatch) return NextResponse.next();
  const [, resource, id, subroute] = detailMatch;
  if (subroute && resource !== 'tournaments') return NextResponse.next();
  if ((resource === 'matches' || resource === 'teams' || resource === 'team-matches') && id === 'new') {
    return NextResponse.next();
  }
  if (!UUID_PATH_SEGMENT.test(id)) return NextResponse.next({ status: 404 });

  const response = await fetch(
    `${getInternalApiOrigin()}/api/v1/${resource}/${id}`,
    { cache: 'no-store', headers: { accept: 'application/json' } },
  );

  return response.status === 404
    ? NextResponse.next({ status: 404 })
    : NextResponse.next();
}

export const config = {
  matcher: [
    '/matches/:id',
    '/teams/:id',
    '/team-matches/:id',
    '/tournaments/:id',
    '/tournaments/:id/bracket',
    '/tournaments/:id/results',
    '/tournaments/:id/awards',
    '/tournaments/:id/reviews',
    '/tournaments/campaigns/:slug',
    '/notices/:id',
  ],
};

function getInternalApiOrigin(): string {
  const configured = process.env.INTERNAL_API_ORIGIN
    || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, '');
  if (configured) return configured.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production' ? 'http://v1_api:8121' : 'http://localhost:8121';
}
