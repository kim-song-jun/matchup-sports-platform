import { QueryClient, environmentManager } from '@tanstack/react-query';
import { isTransientFailure } from './api-client';

export function createV1QueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // 서버 렌더는 요청마다 새 클라이언트를 만든다. 유한한 gcTime 은 쿼리마다 타이머를 걸어 그 요청의
        // 클라이언트와 데이터를 gcTime 동안 heap 에 붙잡는다 — 서버는 TanStack 기본값(Infinity, 타이머 없음)을 쓴다.
        gcTime: environmentManager.isServer() ? Infinity : 10 * 60_000,
        // 4xx 는 다시 보내도 같은 답이라 재시도하지 않는다. 서버 오류·네트워크 단절만 한 번 더.
        retry: (failureCount, error) => failureCount < 1 && isTransientFailure(error),
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
        // 기본값('online')은 오프라인 쓰기를 멈춰 두었다가 연결되는 순간 저절로 보내서, 누른 사람은
        // 결과를 모른 채 다른 버튼을 누르게 된다. 오프라인이면 바로 실패시키고 api-client 가 이유를 붙인다.
        networkMode: 'always',
      },
    },
  });
}
