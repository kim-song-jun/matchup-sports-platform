import { V1ApiError, isTransientFailure } from '@/lib/api-client';
import { isAccessDeniedError } from '@/lib/access-denied-error';

export type ChatRoomLoadError = {
  title: string;
  body: string;
  /** 다시 불러와도 같은 답이면 false — 화면은 재시도 대신 목록으로 돌아가는 길을 준다. */
  retryable: boolean;
};

const CODE_MATCH_CHAT_PARTICIPANTS_REQUIRED = 'MATCH_CHAT_PARTICIPANTS_REQUIRED';

export function describeChatRoomLoadError(error: unknown): ChatRoomLoadError {
  if (isAccessDeniedError(error)) {
    return {
      title: '참여 중인 멤버만 볼 수 있어요',
      body: '팀에서 빠졌거나 채팅방에서 나가면 이 대화를 볼 수 없어요. 다시 함께하려면 팀에 새로 신청해 주세요.',
      retryable: false,
    };
  }
  if (error instanceof V1ApiError && error.code === CODE_MATCH_CHAT_PARTICIPANTS_REQUIRED) {
    return {
      title: '지금은 열 수 없는 채팅방이에요',
      body: '참가가 확정된 사람이 있어야 열 수 있는 채팅방이에요.',
      retryable: false,
    };
  }
  if (error instanceof V1ApiError && error.statusCode === 404) {
    return {
      title: '찾을 수 없는 채팅방이에요',
      body: '사라졌거나 볼 수 없는 채팅방이에요. 목록에서 다른 채팅방을 골라 주세요.',
      retryable: false,
    };
  }
  if (!isTransientFailure(error)) {
    return {
      title: '채팅방을 열 수 없어요',
      body: '다시 불러와도 같은 결과예요. 목록으로 돌아가 주세요.',
      retryable: false,
    };
  }
  return {
    title: '채팅방을 불러오지 못했어요',
    body: '네트워크 상태를 확인하고 다시 시도해 주세요.',
    retryable: true,
  };
}
