'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { AdminPageHeader, AdminToasts, useAdminToast } from '@/components/admin';
import { useV1AdminIntegrationSettings, useV1AdminMe, useV1UpdateIntegrationSettings } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1IntegrationKeySource } from '@/types/api';

// undefined = 미변경(전송 안 함), ''(빈 문자열) = 삭제 의도(전송 시 서버가 env 폴백/미설정으로 되돌림),
// 그 외 문자열 = 새 값으로 설정. useState('')를 쓰면 "안 건드림"과 "삭제"를 구분할 수 없어
// truthy 체크(`value ? {...} : {}`)로 빈 문자열 제출이 통째로 드롭되는 버그가 생긴다.
type KeyFieldValue = string | undefined;

function sourceLabel(source: V1IntegrationKeySource): string {
  if (source === 'admin') return '이 화면에서 설정한 값 사용 중';
  if (source === 'env') return '서버 환경변수 값 사용 중';
  return '설정된 값 없음 — 관련 기능 비활성화';
}

export default function AdminIntegrationSettingsPage() {
  const [kakaoRestApiKey, setKakaoRestApiKey] = useState<KeyFieldValue>(undefined);
  const [kakaoMapsJsKey, setKakaoMapsJsKey] = useState<KeyFieldValue>(undefined);

  const { toasts, showToast } = useAdminToast();
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;

  const { data: settings, isPending, isError, error, refetch } = useV1AdminIntegrationSettings();
  const updateSettings = useV1UpdateIntegrationSettings();

  // 입력칸은 항상 비워둔다 — 마스킹된 값을 입력칸에 채우면 사용자가 그 마스킹 문자열을
  // 그대로 다시 저장해버릴 위험이 있다. 대신 현재 상태는 마스킹된 값 + 출처로만 안내한다.
  useEffect(() => {
    if (settings) {
      setKakaoRestApiKey(undefined);
      setKakaoMapsJsKey(undefined);
    }
  }, [settings]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (kakaoRestApiKey === undefined && kakaoMapsJsKey === undefined) {
      showToast('변경할 키를 하나 이상 입력하거나 삭제해 주세요.', 'error');
      return;
    }

    updateSettings.mutate(
      {
        ...(kakaoRestApiKey !== undefined ? { kakaoRestApiKey } : {}),
        ...(kakaoMapsJsKey !== undefined ? { kakaoMapsJsKey } : {}),
      },
      {
        onSuccess: () => {
          setKakaoRestApiKey(undefined);
          setKakaoMapsJsKey(undefined);
          showToast('연동 설정을 저장했어요.', 'success');
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '연동 설정 저장에 실패했어요.'), 'error');
        },
      },
    );
  }

  const errorMessage = isError ? extractErrorMessage(error, '연동 설정을 불러오지 못했어요.') : undefined;

  return (
    <>
      <AdminPageHeader
        title="연동 설정"
        description="카카오맵 API 키를 등록하면 대회 상세의 현장 안내에 실제 지도와 내비게이션 길찾기가 표시돼요. 등록하지 않아도 기존 네이버 지도 검색 링크는 그대로 동작해요."
      />

      <div className="max-w-[560px]">
        <section className="rounded-2xl border border-gray-100 bg-white p-5" aria-label="카카오맵 연동 설정">
          <h2 className="text-[var(--font-size-body-lg)] font-bold text-gray-900">카카오맵 연동</h2>
          <p className="mt-1 text-[var(--font-size-caption)] text-gray-500 leading-relaxed">
            REST API 키는 대회 장소 지오코딩(서버 전용)에, JS 키는 대회 상세 지도 임베드에 사용돼요. 두 키
            모두{' '}
            <a
              href="https://developers.kakao.com/console/app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 font-semibold hover:underline"
            >
              Kakao Developers
            </a>
            에서 앱을 등록하고 발급받아요.
          </p>

          {isError ? (
            <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-[var(--font-size-caption)] text-red-600">
              {errorMessage}
              <button type="button" onClick={() => void refetch()} className="ml-2 font-semibold underline">
                다시 시도
              </button>
            </div>
          ) : null}

          <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1.5">
              <span className="text-[var(--font-size-label)] font-semibold text-gray-700">카카오 REST API 키</span>
              <input
                value={kakaoRestApiKey ?? ''}
                onChange={(event) => setKakaoRestApiKey(event.target.value)}
                maxLength={200}
                disabled={!canWrite || isPending || updateSettings.isPending}
                placeholder={isPending ? '불러오는 중...' : settings?.kakaoRestApiKey ? `현재: ${settings.kakaoRestApiKey}` : '새 키 입력'}
                className="h-[44px] rounded-xl border border-gray-200 px-3 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400"
              />
              <KeyFieldFooter
                canWrite={canWrite}
                disabled={isPending || updateSettings.isPending}
                sourceText={settings ? sourceLabel(settings.kakaoRestApiKeySource) : ' '}
                canDelete={settings?.kakaoRestApiKeySource === 'admin'}
                pendingDelete={kakaoRestApiKey === ''}
                onDelete={() => setKakaoRestApiKey('')}
                onCancelDelete={() => setKakaoRestApiKey(undefined)}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[var(--font-size-label)] font-semibold text-gray-700">카카오맵 JS 키</span>
              <input
                value={kakaoMapsJsKey ?? ''}
                onChange={(event) => setKakaoMapsJsKey(event.target.value)}
                maxLength={200}
                disabled={!canWrite || isPending || updateSettings.isPending}
                placeholder={isPending ? '불러오는 중...' : settings?.kakaoMapsJsKey ? `현재: ${settings.kakaoMapsJsKey}` : '새 키 입력'}
                className="h-[44px] rounded-xl border border-gray-200 px-3 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400"
              />
              <KeyFieldFooter
                canWrite={canWrite}
                disabled={isPending || updateSettings.isPending}
                sourceText={settings ? sourceLabel(settings.kakaoMapsJsKeySource) : ' '}
                canDelete={settings?.kakaoMapsJsKeySource === 'admin'}
                pendingDelete={kakaoMapsJsKey === ''}
                onDelete={() => setKakaoMapsJsKey('')}
                onCancelDelete={() => setKakaoMapsJsKey(undefined)}
              />
              <span className="text-[var(--font-size-micro)] text-gray-400">
                JS 키는 지도 스크립트에 포함되어 브라우저에 그대로 노출돼요 — 카카오 개발자 콘솔에서 이 앱의
                사용 도메인을 등록해두면 다른 도메인에서의 무단 사용을 막을 수 있어요.
              </span>
            </label>

            {!canWrite ? (
              <p className="rounded-xl bg-gray-50 px-3 py-2 text-[var(--font-size-caption)] text-gray-500">
                지원 역할은 연동 설정을 조회할 수 있지만 저장할 수 없어요.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!canWrite || isPending || updateSettings.isPending}
              className="inline-flex h-[44px] items-center justify-center rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              {updateSettings.isPending ? '저장 중...' : '저장'}
            </button>
          </form>
        </section>
      </div>

      <AdminToasts toasts={toasts} />
    </>
  );
}

/**
 * 키 입력칸 하단 출처 안내 + 삭제 액션. 삭제 예정 상태(빈 문자열 전송 예약)는 별도 문구 +
 * "취소"로 명시적으로 보여준다 — 입력칸을 그냥 비우는 것만으로는 삭제 의도인지 단순
 * 미입력인지 사용자도, 코드도 구분할 수 없기 때문.
 */
function KeyFieldFooter({
  canWrite,
  disabled,
  sourceText,
  canDelete,
  pendingDelete,
  onDelete,
  onCancelDelete,
}: {
  canWrite: boolean;
  disabled: boolean;
  sourceText: string;
  canDelete: boolean;
  pendingDelete: boolean;
  onDelete: () => void;
  onCancelDelete: () => void;
}) {
  if (pendingDelete) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-[var(--font-size-micro)] font-semibold text-red-600">
          삭제 예정 — 저장하면 이 키가 삭제되고 환경변수 값(또는 미설정)으로 되돌아가요.
        </span>
        <button
          type="button"
          onClick={onCancelDelete}
          disabled={disabled}
          className="shrink-0 text-[var(--font-size-micro)] font-semibold text-gray-500 underline hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          취소
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--font-size-micro)] text-gray-500">{sourceText}</span>
      {canWrite && canDelete ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1 text-[var(--font-size-micro)] font-semibold text-gray-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X size={12} aria-hidden="true" />이 키 삭제
        </button>
      ) : null}
    </div>
  );
}
