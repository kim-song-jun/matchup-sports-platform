'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ChevronRight, Globe, ImageIcon, Lock, Trash2, Video } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useDeleteTeam, useMyTeams, useTeam, useUpdateTeam } from '@/hooks/use-api';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useToast } from '@/components/ui/toast';
import { TEAM_CITIES, TEAM_SPORT_TYPES, levelLabel, sportLabel } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { ImageUpload, type ImageUploadState } from '@/components/ui/image-upload';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { extractUploadUrls, firstUploadUrl, toExistingUploadAsset, type UploadAsset } from '@/lib/uploads';
import type { CreateTeamInput } from '@/types/api';

export default function EditTeamPage() {
  useRequireAuth();
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const teamId = params.id as string;
  const { data: team, isLoading } = useTeam(teamId);
  const { data: myTeams, isLoading: isMyTeamsLoading } = useMyTeams();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();

  const myMembership = myTeams?.find((myTeam) => myTeam.id === teamId);
  const canEdit = myMembership?.role === 'owner' || myMembership?.role === 'manager';
  const canDelete = myMembership?.role === 'owner';

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [logoAssets, setLogoAssets] = useState<UploadAsset[]>([]);
  const [coverAssets, setCoverAssets] = useState<UploadAsset[]>([]);
  const [photoAssets, setPhotoAssets] = useState<UploadAsset[]>([]);
  const [logoUploadState, setLogoUploadState] = useState<ImageUploadState>({
    hasPendingUploads: false,
    hasUploadErrors: false,
    pendingCount: 0,
  });
  const [coverUploadState, setCoverUploadState] = useState<ImageUploadState>({
    hasPendingUploads: false,
    hasUploadErrors: false,
    pendingCount: 0,
  });
  const [photoUploadState, setPhotoUploadState] = useState<ImageUploadState>({
    hasPendingUploads: false,
    hasUploadErrors: false,
    pendingCount: 0,
  });
  const [form, setForm] = useState<CreateTeamInput>({
    name: '',
    sportTypes: ['soccer'],
    description: '',
    city: '',
    district: '',
    level: 3,
    isRecruiting: true,
    contactInfo: '',
    instagramUrl: '',
    youtubeUrl: '',
    shortsUrl: '',
    kakaoOpenChat: '',
    websiteUrl: '',
  });

  useEffect(() => {
    if (!team) return;
    setForm({
      name: team.name,
      sportTypes: team.sportTypes ?? [team.sportType],
      description: team.description ?? '',
      city: team.city ?? '',
      district: team.district ?? '',
      level: team.level ?? 3,
      isRecruiting: team.isRecruiting,
      contactInfo: team.contactInfo ?? '',
      instagramUrl: team.instagramUrl ?? '',
      youtubeUrl: team.youtubeUrl ?? '',
      shortsUrl: team.shortsUrl ?? '',
      kakaoOpenChat: team.kakaoOpenChat ?? '',
      websiteUrl: team.websiteUrl ?? '',
    });
    setLogoAssets(team.logoUrl ? [toExistingUploadAsset(team.logoUrl)] : []);
    setCoverAssets(team.coverImageUrl ? [toExistingUploadAsset(team.coverImageUrl)] : []);
    setPhotoAssets((team.photos ?? []).map((url) => toExistingUploadAsset(url)));
  }, [team]);

  const formDisabled = isMyTeamsLoading || !canEdit || updateTeam.isPending;
  const deleteDisabled = deleteTeam.isPending || !canDelete;
  const pageReady = !isLoading && !isMyTeamsLoading;
  const invalidName = useMemo(() => form.name.trim().length === 0, [form.name]);

  function updateField<K extends keyof CreateTeamInput>(key: K, value: CreateTeamInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSport(type: string) {
    if (formDisabled) return;

    const selected = form.sportTypes.includes(type);
    const next = selected
      ? form.sportTypes.filter((sportType) => sportType !== type)
      : [...form.sportTypes, type];

    if (next.length > 0) {
      updateField('sportTypes', next);
    }
  }

  function guardImageUpload(): boolean {
    const hasPendingUploads =
      logoUploadState.hasPendingUploads ||
      coverUploadState.hasPendingUploads ||
      photoUploadState.hasPendingUploads;
    if (hasPendingUploads) {
      toast('error', '이미지 업로드가 끝난 뒤 저장할 수 있습니다.');
      return false;
    }

    const hasUploadErrors =
      logoUploadState.hasUploadErrors ||
      coverUploadState.hasUploadErrors ||
      photoUploadState.hasUploadErrors;
    if (hasUploadErrors) {
      toast('error', '실패한 이미지 업로드를 다시 시도하거나 제거해주세요');
      return false;
    }

    return true;
  }

  async function handleSave() {
    if (invalidName) {
      toast('error', '팀 이름은 필수입니다.');
      return;
    }
    if ((form.sportTypes?.length ?? 0) === 0) {
      toast('error', '종목을 1개 이상 선택해주세요');
      return;
    }
    if (!form.city?.trim()) {
      toast('error', '활동 지역을 선택해주세요');
      return;
    }
    if (!guardImageUpload()) return;

    const payload: CreateTeamInput = {
      ...form,
      name: form.name.trim(),
      description: form.description?.trim() || undefined,
      city: form.city?.trim() || undefined,
      district: form.district?.trim() || undefined,
      contactInfo: form.contactInfo?.trim() || undefined,
      instagramUrl: form.instagramUrl?.trim() || undefined,
      youtubeUrl: form.youtubeUrl?.trim() || undefined,
      shortsUrl: form.shortsUrl?.trim() || undefined,
      kakaoOpenChat: form.kakaoOpenChat?.trim() || undefined,
      websiteUrl: form.websiteUrl?.trim() || undefined,
      logoUrl: firstUploadUrl(logoAssets),
      coverImageUrl: firstUploadUrl(coverAssets),
      photos: extractUploadUrls(photoAssets),
    };

    try {
      await updateTeam.mutateAsync({ id: teamId, data: payload });
      toast('success', '팀 정보가 저장되었습니다.');
      router.push(`/teams/${teamId}`);
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast('error', message || '팀 정보를 저장하지 못했습니다.');
    }
  }

  async function handleDelete() {
    try {
      await deleteTeam.mutateAsync(teamId);
      toast('success', '팀이 비활성화되었습니다.');
      router.push('/my/teams');
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast('error', message || '팀을 비활성화하지 못했습니다.');
    }
  }

  if (!pageReady) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <div className="space-y-4 animate-pulse">
          <div className="h-7 w-24 rounded-lg bg-gray-100 dark:bg-gray-800" />
          <div className="h-48 rounded-xl bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <p className="text-gray-500">팀 정보를 찾을 수 없습니다.</p>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={Lock}
          title="수정 권한이 없습니다"
          description="팀 owner 또는 manager만 팀 정보를 수정할 수 있습니다."
          action={{ label: '팀 페이지로', href: `/teams/${params.id}` }}
        />
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button
          onClick={() => router.back()}
          aria-label="뒤로 가기"
          className="flex items-center justify-center min-h-11 min-w-11 rounded-xl -ml-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">팀 수정</h1>
      </header>

      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href={`/teams/${teamId}`} className="hover:text-gray-600 transition-colors">
          팀 상세
        </Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-200">팀 수정</span>
      </div>

      <div className="px-5 @3xl:px-0 max-w-2xl pb-8">
        <FormField label="팀명" required htmlFor="team-name" className="mb-5">
          <Input
            id="team-name"
            value={form.name}
            onChange={(event) => updateField('name', event.target.value)}
            maxLength={50}
            disabled={formDisabled}
            placeholder="팀/클럽 이름을 입력해주세요"
          />
        </FormField>

        <FormField label="종목 (복수 선택 가능)" required className="mb-5">
          <div className="flex flex-wrap gap-2">
            {TEAM_SPORT_TYPES.map((type) => {
              const selected = form.sportTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  disabled={formDisabled}
                  onClick={() => toggleSport(type)}
                  className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                    selected
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  {sportLabel[type] || type}
                </button>
              );
            })}
          </div>
          {form.sportTypes.length > 0 && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{form.sportTypes.length}개 종목 선택됨</p>
          )}
        </FormField>

        <FormField label="팀 소개" htmlFor="team-description" className="mb-5">
          <Textarea
            id="team-description"
            value={form.description ?? ''}
            onChange={(event) => updateField('description', event.target.value)}
            maxLength={1000}
            rows={4}
            disabled={formDisabled}
            className="min-h-[120px] resize-none"
            placeholder="팀 소개, 활동 시간, 분위기 등을 자유롭게 적어주세요"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <FormField label="시/도" required htmlFor="team-city">
            <Select id="team-city" value={form.city ?? ''} onChange={(event) => updateField('city', event.target.value)} disabled={formDisabled}>
              <option value="">선택</option>
              {TEAM_CITIES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="구/군" htmlFor="team-district">
            <Input
              id="team-district"
              value={form.district ?? ''}
              onChange={(event) => updateField('district', event.target.value)}
              disabled={formDisabled}
              placeholder="예: 강남구"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-5 mb-5 md:grid-cols-2">
          <FormField label="레벨" htmlFor="team-level">
            <Select
              id="team-level"
              value={String(form.level ?? 3)}
              onChange={(event) => updateField('level', Number(event.target.value))}
              disabled={formDisabled}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {levelLabel[value]}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="모집 여부">
            <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden text-sm font-medium" role="group" aria-label="모집 여부">
              <button
                type="button"
                onClick={() => updateField('isRecruiting', true)}
                aria-pressed={!!form.isRecruiting}
                disabled={formDisabled}
                className={`flex-1 px-4 py-3 transition-colors disabled:opacity-50 ${
                  form.isRecruiting
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                모집중
              </button>
              <button
                type="button"
                onClick={() => updateField('isRecruiting', false)}
                aria-pressed={!form.isRecruiting}
                disabled={formDisabled}
                className={`flex-1 border-l border-gray-200 dark:border-gray-700 px-4 py-3 transition-colors disabled:opacity-50 ${
                  !form.isRecruiting
                    ? 'bg-gray-700 text-white dark:bg-gray-600'
                    : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                모집마감
              </button>
            </div>
          </FormField>
        </div>

        <FormField label="연락처" htmlFor="team-contactInfo" className="mb-5">
          <Input
            id="team-contactInfo"
            value={form.contactInfo ?? ''}
            onChange={(event) => updateField('contactInfo', event.target.value)}
            disabled={formDisabled}
            placeholder="카카오톡 ID 또는 연락 가능한 연락처"
          />
        </FormField>

        <Card className="mb-5" padding="sm">
          <div className="flex items-center gap-2 mb-3">
            <Globe size={16} className="text-gray-500" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">SNS 및 링크</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label htmlFor="team-instagram" className="block text-xs text-gray-500 mb-1">
                Instagram
              </label>
              <Input
                id="team-instagram"
                value={form.instagramUrl ?? ''}
                onChange={(event) => updateField('instagramUrl', event.target.value)}
                disabled={formDisabled}
                placeholder="https://instagram.com/..."
              />
            </div>
            <div>
              <label htmlFor="team-youtube" className="block text-xs text-gray-500 mb-1">
                YouTube
              </label>
              <Input
                id="team-youtube"
                value={form.youtubeUrl ?? ''}
                onChange={(event) => updateField('youtubeUrl', event.target.value)}
                disabled={formDisabled}
                placeholder="https://youtube.com/..."
              />
            </div>
            <div>
              <label htmlFor="team-kakao" className="block text-xs text-gray-500 mb-1">
                Kakao OpenChat
              </label>
              <Input
                id="team-kakao"
                value={form.kakaoOpenChat ?? ''}
                onChange={(event) => updateField('kakaoOpenChat', event.target.value)}
                disabled={formDisabled}
                placeholder="https://open.kakao.com/..."
              />
            </div>
            <div>
              <label htmlFor="team-website" className="block text-xs text-gray-500 mb-1">
                Website URL
              </label>
              <Input
                id="team-website"
                value={form.websiteUrl ?? ''}
                onChange={(event) => updateField('websiteUrl', event.target.value)}
                disabled={formDisabled}
                placeholder="https://example.com"
              />
            </div>
          </div>
        </Card>

        <Card className="mb-5" padding="sm">
          <div className="flex items-center gap-2 mb-3">
            <Video size={16} className="text-gray-500" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Shorts</h3>
          </div>
          <label htmlFor="team-shortsUrl" className="sr-only">
            Shorts URL
          </label>
          <Input
            id="team-shortsUrl"
            value={form.shortsUrl ?? ''}
            onChange={(event) => updateField('shortsUrl', event.target.value)}
            disabled={formDisabled}
            placeholder="YouTube Shorts 또는 Instagram Reels URL"
          />
          <p className="text-xs text-gray-500 mt-1.5">팀의 분위기를 보여주는 짧은 영상을 연결할 수 있습니다.</p>
        </Card>

        <Card className="mb-6" padding="sm">
          <div className="flex items-center gap-2 mb-3">
            <ImageIcon size={16} className="text-gray-500" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">이미지</h3>
          </div>
          <div className="space-y-3">
            <ImageUpload
              value={logoAssets}
              onChange={setLogoAssets}
              onStateChange={setLogoUploadState}
              max={1}
              accept="image/jpeg,image/png,image/webp,image/gif"
              maxSizeMB={10}
              label="로고 이미지"
              disabled={formDisabled}
            />
            <ImageUpload
              value={coverAssets}
              onChange={setCoverAssets}
              onStateChange={setCoverUploadState}
              max={1}
              accept="image/jpeg,image/png,image/webp,image/gif"
              maxSizeMB={10}
              label="커버 이미지"
              disabled={formDisabled}
            />
            <ImageUpload
              value={photoAssets}
              onChange={setPhotoAssets}
              onStateChange={setPhotoUploadState}
              max={10}
              accept="image/jpeg,image/png,image/webp,image/gif"
              maxSizeMB={10}
              label="추가 사진"
              disabled={formDisabled}
            />
            {(logoUploadState.hasPendingUploads || coverUploadState.hasPendingUploads || photoUploadState.hasPendingUploads) && (
              <p className="text-xs text-gray-500">이미지 업로드가 끝난 뒤 저장할 수 있습니다.</p>
            )}
            {(logoUploadState.hasUploadErrors || coverUploadState.hasUploadErrors || photoUploadState.hasUploadErrors) && (
              <p className="text-xs text-red-500">실패한 이미지 업로드를 다시 시도하거나 제거해주세요.</p>
            )}
          </div>
        </Card>

        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.back()}
            className="rounded-xl bg-gray-100 dark:bg-gray-700 px-5 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200"
          >
            취소
          </button>
          <Button onClick={() => void handleSave()} disabled={formDisabled || invalidName} size="lg">
            {updateTeam.isPending ? '저장 중...' : '저장'}
          </Button>
          {canDelete && (
            <button
              onClick={() => setShowDeleteModal(true)}
              disabled={deleteDisabled}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 disabled:opacity-50"
            >
              <Trash2 size={15} />
              팀 비활성화
            </button>
          )}
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
              <AlertTriangle size={20} className="text-red-500" aria-hidden="true" />
            </div>
            <h3 className="text-center text-lg font-bold text-gray-900 dark:text-white">팀을 비활성화할까요?</h3>
            <p className="mt-2 text-center text-sm text-gray-500">
              비활성화된 팀은 활성 목록에서 숨겨지고 수정이나 신청에 사용할 수 없지만, 기존 매칭 이력은 유지됩니다.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200"
              >
                취소
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={deleteDisabled}
                className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {deleteTeam.isPending ? '비활성화 중...' : '비활성화'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
