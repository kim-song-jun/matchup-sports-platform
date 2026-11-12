import { liveV1DataSource, type V1DataSource } from '@/components/providers/v1-data-source';

/** Public projections must not inherit the operator's optional staff visibility bypass. */
export function memberBracketPublicSource(tournamentId: string): V1DataSource {
  const denied = async (): Promise<never> => { throw new Error('대진표 조회 전용 화면이에요.'); };
  const get: V1DataSource['v1Get'] = async <T>(path: string, query?: Parameters<V1DataSource['v1Get']>[1]): Promise<T> => {
    const base = `/tournaments/${tournamentId}`;
    if (path !== base && path !== `${base}/schedule`) return denied();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
    const response = await fetch(`/api/v1${path}${params.size ? `?${params}` : ''}`, {
      credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' },
    });
    const envelope = await response.json();
    if (!response.ok || envelope.status !== 'success') throw new Error(envelope.message ?? '대진표를 불러오지 못했어요.');
    return envelope.data as T;
  };
  return { ...liveV1DataSource, v1Get: get, v1Api: denied, v1Post: denied, v1Put: denied,
    v1Patch: denied, v1Delete: denied, v1MultipartPost: denied };
}
