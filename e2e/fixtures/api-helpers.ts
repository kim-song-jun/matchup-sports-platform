import { API_BASE } from './test-users';

const API_RETRY_ATTEMPTS = 6;

async function waitFor(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(input: string, init: RequestInit, label: string): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= API_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.ok) {
        return response;
      }

      const text = await response.text();
      throw new Error(`${label} failed: ${response.status} ${text}`);
    } catch (error) {
      lastError = error;
      if (attempt === API_RETRY_ATTEMPTS) {
        break;
      }

      await waitFor(attempt * 500);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

/** Generic authenticated API call helper. */
async function apiCall<T>(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetchWithRetry(`${API_BASE}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  }, `API ${method} ${path}`);
  const json = await res.json() as Record<string, unknown>;
  return ((json.data ?? json) as unknown) as T;
}

async function publicApiCall<T>(path: string): Promise<T> {
  const res = await fetchWithRetry(`${API_BASE}/api/v1${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  }, `API GET ${path}`);
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

export async function joinMatchViaApi(
  token: string,
  matchId: string,
): Promise<{ id: string; matchId: string; userId: string }> {
  return apiCall('POST', `/matches/${matchId}/join`, token);
}

export async function preparePaymentViaApi(
  token: string,
  data: {
    participantId: string;
    amount: number;
    method?: string;
  },
): Promise<{ paymentId: string; orderId: string; amount: number }> {
  return apiCall('POST', '/payments/prepare', token, {
    method: 'card',
    ...data,
  });
}

export async function confirmPaymentViaApi(
  token: string,
  data: {
    orderId: string;
    paymentKey?: string;
  },
): Promise<{ id: string; orderId: string }> {
  return apiCall('POST', '/payments/confirm', token, {
    paymentKey: `e2e-${Date.now()}`,
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
    venueAddress?: string;
    totalFee: number;
    quarterCount?: number;
    hostTeamId?: string;
  },
): Promise<{ id: string }> {
  return apiCall('POST', '/team-matches', token, {
    quarterCount: 4,
    matchStyle: 'friendly',
    skillGrade: 'B',
    venueAddress: 'E2E address',
    ...data,
  });
}

export async function applyTeamMatchViaApi(
  token: string,
  matchId: string,
  data: {
    applicantTeamId: string;
    message?: string;
  },
): Promise<{ id: string; teamMatchId: string; applicantTeamId: string; status: string }> {
  return apiCall('POST', `/team-matches/${matchId}/apply`, token, data);
}

export async function approveTeamMatchApplicationViaApi(
  token: string,
  matchId: string,
  applicationId: string,
): Promise<{ id: string; teamMatchId: string; applicantTeamId: string; status: string }> {
  return apiCall('PATCH', `/team-matches/${matchId}/applications/${applicationId}/approve`, token);
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

export async function addTeamMemberViaApi(
  token: string,
  teamId: string,
  userId: string,
  role: 'member' | 'manager' = 'member',
): Promise<void> {
  await apiCall('POST', `/teams/${teamId}/members`, token, { userId, role });
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
    const res = await fetchWithRetry(`${API_BASE}/api/v1/health`, { method: 'GET' }, 'API health check');
    return res.ok;
  } catch {
    return false;
  }
}
