'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Globe, ImageIcon, Video } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { api } from '@/lib/api';
import { TEAM_CITIES, TEAM_SPORT_TYPES, levelLabel, sportLabel } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Card } from '@/components/ui/card';
import { ImageUpload, type ImageUploadState } from '@/components/ui/image-upload';
import { extractUploadUrls, firstUploadUrl, type UploadAsset } from '@/lib/uploads';
import type { CreateTeamInput } from '@/types/api';

export default function CreateTeamPage() {
  const router = useRouter();
  const { toast } = useToast();
  useRequireAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
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
    sportTypes: [],
    description: '',
    city: '',
    district: '',
    level: 3,
    isRecruiting: true,
    contactInfo: '',
    instagramUrl: '',
    youtubeUrl: '',
    kakaoOpenChat: '',
    shortsUrl: '',
    websiteUrl: '',
  });

  function updateField<K extends keyof CreateTeamInput>(key: K, value: CreateTeamInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSport(type: string) {
    setForm((prev) => ({
      ...prev,
      sportTypes: prev.sportTypes.includes(type)
        ? prev.sportTypes.filter((sportType) => sportType !== type)
        : [...prev.sportTypes, type],
    }));
  }

  function guardImageUpload(): boolean {
    const hasPendingUploads =
      logoUploadState.hasPendingUploads ||
      coverUploadState.hasPendingUploads ||
      photoUploadState.hasPendingUploads;
    if (hasPendingUploads) {
      toast('error', '이미지 업로드가 끝난 뒤 저장할 수 있어요');
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

  async function handleSubmit() {
    if (!form.name?.trim()) return toast('error', '팀명을 입력해주세요');
    if ((form.sportTypes?.length ?? 0) === 0) return toast('error', '종목을 1개 이상 선택해주세요');
    if (!form.city?.trim()) return toast('error', '활동 지역을 선택해주세요');
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
      kakaoOpenChat: form.kakaoOpenChat?.trim() || undefined,
      shortsUrl: form.shortsUrl?.trim() || undefined,
      websiteUrl: form.websiteUrl?.trim() || undefined,
      logoUrl: firstUploadUrl(logoAssets),
      coverImageUrl: firstUploadUrl(coverAssets),
      photos: extractUploadUrls(photoAssets),
    };

    setIsSubmitting(true);
    try {
      await api.post('/teams', payload);
      toast('success', '팀이 등록되었습니다.');
      router.push('/teams');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '팀 등록에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
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
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">팀 등록</h1>
      </header>

      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/teams" className="hover:text-gray-600 transition-colors">
          팀/클럽
        </Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-200">팀 등록</span>
      </div>

      <div className="px-5 @3xl:px-0 max-w-2xl pb-8">
        <FormField label="팀명" required htmlFor="team-name" className="mb-5">
          <Input
            id="team-name"
            value={form.name}
            onChange={(event) => updateField('name', event.target.value)}
            maxLength={50}
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
                  onClick={() => toggleSport(type)}
                  className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
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
            placeholder="팀 소개, 활동 시간, 분위기 등을 자유롭게 적어주세요"
            rows={4}
            className="min-h-[120px] resize-none"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <FormField label="시/도" required htmlFor="team-city">
            <Select id="team-city" value={form.city ?? ''} onChange={(event) => updateField('city', event.target.value)}>
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
                className={`flex-1 px-4 py-3 transition-colors ${
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
                className={`flex-1 border-l border-gray-200 dark:border-gray-700 px-4 py-3 transition-colors ${
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
            />
            <ImageUpload
              value={coverAssets}
              onChange={setCoverAssets}
              onStateChange={setCoverUploadState}
              max={1}
              accept="image/jpeg,image/png,image/webp,image/gif"
              maxSizeMB={10}
              label="커버 이미지"
            />
            <ImageUpload
              value={photoAssets}
              onChange={setPhotoAssets}
              onStateChange={setPhotoUploadState}
              max={10}
              accept="image/jpeg,image/png,image/webp,image/gif"
              maxSizeMB={10}
              label="추가 사진"
            />
            {(logoUploadState.hasPendingUploads || coverUploadState.hasPendingUploads || photoUploadState.hasPendingUploads) && (
              <p className="text-xs text-gray-500">이미지 업로드가 끝난 뒤 팀을 등록할 수 있어요.</p>
            )}
            {(logoUploadState.hasUploadErrors || coverUploadState.hasUploadErrors || photoUploadState.hasUploadErrors) && (
              <p className="text-xs text-red-500">실패한 이미지 업로드를 다시 시도하거나 제거해주세요.</p>
            )}
          </div>
        </Card>

        <Button onClick={handleSubmit} disabled={isSubmitting} fullWidth size="lg" className="mb-8">
          {isSubmitting ? '등록 중...' : '팀 등록하기'}
        </Button>
      </div>
    </div>
  );
}
