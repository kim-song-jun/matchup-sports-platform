import { QueryClient } from '@tanstack/react-query';

export function createV1QueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        retry: 1,
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
