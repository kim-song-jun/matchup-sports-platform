import { API_BASE } from './test-users';

/** Generic authenticated API call helper. */
async function apiCall<T>(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} failed: ${res.status} ${text}`);
  }
  const json = await res.json() as Record<string, unknown>;
  return ((json.data ?? json) as unknown) as T;
}

async function publicApiCall<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API GET ${path} failed: ${res.status} ${text}`);
  }
  const json = await res.json() as Record<string, unknown>;
  return ((json.data ?? json) as unknown) as T;
}

export async function createTeamViaApi(
  token: string,
  data: {
    name: string;
    sportType: string;
    city: string;
    description?: string;
    isRecruiting?: boolean;
  },
): Promise<{ id: string; name: string }> {
  return apiCall('POST', '/teams', token, {
    isRecruiting: true,
    ...data,
  });
}

export async function createMatchViaApi(
  token: string,
  data: {
    title: string;
    sportType: string;
    matchDate: string;
    startTime: string;
    endTime: string;
    venueId: string;
    maxPlayers: number;
    fee?: number;
    description?: string;
    levelMin?: number;
    levelMax?: number;
  },
): Promise<{ id: string }> {
  return apiCall('POST', '/matches', token, {
    fee: 0,
    levelMin: 1,
    levelMax: 5,
    ...data,
  });
}

export async function findVenueBySport(
  sportType: string,
): Promise<{ id: string; name: string; address: string }> {
  const venues = await publicApiCall<Array<{ id: string; name: string; address: string }>>(
    `/venues?sportType=${encodeURIComponent(sportType)}`,
  );

  if (!Array.isArray(venues) || venues.length === 0) {
    throw new Error(`No venue found for sportType="${sportType}"`);
  }

  return venues[0];
}

export async function createTeamMatchViaApi(
  token: string,
  data: {
    title: string;
    sportType: string;
    matchDate: string;
    startTime: string;
    endTime: string;
    venueName: string;
    totalFee: number;
    quarterCount?: number;
    hostTeamId?: string;
  },
): Promise<{ id: string }> {
  return apiCall('POST', '/team-matches', token, {
    quarterCount: 4,
    matchStyle: 'friendly',
    skillGrade: 'B',
    ...data,
  });
}

export async function createMercenaryPostViaApi(
  token: string,
  data: {
    teamId: string;
    sportType: string;
    matchDate: string;
    venue: string;
    position: string;
    count?: number;
    level?: number;
    fee?: number;
  },
): Promise<{ id: string }> {
  return apiCall('POST', '/mercenary', token, {
    count: 1,
    level: 3,
    fee: 0,
    ...data,
  });
}

export async function createListingViaApi(
  token: string,
  data: {
    title: string;
    description: string;
    price: number;
    category: string;
  },
): Promise<{ id: string }> {
  return apiCall('POST', '/marketplace/listings', token, data);
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
