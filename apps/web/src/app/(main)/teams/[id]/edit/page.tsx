'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, Search, ShieldOff, Trash2 } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { useDeleteTeam, useMyTeams, useTeam, useUpdateTeam } from '@/hooks/use-api';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useToast } from '@/components/ui/toast';
import { sportLabel } from '@/lib/constants';
import { extractErrorMessage } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import type { CreateTeamInput } from '@/types/api';

const sportOptions = ['soccer', 'futsal', 'basketball', 'badminton', 'ice_hockey', 'swimming', 'tennis'];

function toMultilineValue(values?: string[]) {
  return (values ?? []).join('\n');
}

function parseMultilineValue(text: string): string[] {
  return text
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
}

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
  const [photosText, setPhotosText] = useState('');
  const [form, setForm] = useState<CreateTeamInput>({
    name: '',
    sportType: 'soccer',
    description: '',
    logoUrl: '',
    coverImageUrl: '',
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
    photos: [],
  });

  useEffect(() => {
    if (!team) return;
    setForm({
      name: team.name,
      sportType: team.sportType,
      description: team.description ?? '',
      logoUrl: team.logoUrl ?? '',
      coverImageUrl: team.coverImageUrl ?? '',
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
      photos: team.photos ?? [],
    });
    setPhotosText(toMultilineValue(team.photos));
  }, [team]);

  const formDisabled = isMyTeamsLoading || !canEdit || updateTeam.isPending;
  const deleteDisabled = deleteTeam.isPending || !canDelete;
  const pageReady = !isLoading && !isMyTeamsLoading;

  const invalidName = useMemo(() => form.name.trim().length === 0, [form.name]);

  function updateField<K extends keyof CreateTeamInput>(key: K, value: CreateTeamInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (invalidName) {
      toast('error', '팀 이름은 필수입니다.');
      return;
    }

    const payload: CreateTeamInput = {
      ...form,
      photos: parseMultilineValue(photosText),
      name: form.name.trim(),
      description: form.description?.trim() || undefined,
      logoUrl: form.logoUrl?.trim() || undefined,
      coverImageUrl: form.coverImageUrl?.trim() || undefined,
      city: form.city?.trim() || undefined,
      district: form.district?.trim() || undefined,
      contactInfo: form.contactInfo?.trim() || undefined,
      instagramUrl: form.instagramUrl?.trim() || undefined,
      youtubeUrl: form.youtubeUrl?.trim() || undefined,
      shortsUrl: form.shortsUrl?.trim() || undefined,
      kakaoOpenChat: form.kakaoOpenChat?.trim() || undefined,
      websiteUrl: form.websiteUrl?.trim() || undefined,
    };

    try {
      await updateTeam.mutateAsync({ id: teamId, data: payload });
      toast('success', '팀 정보가 저장되었어요.');
      router.push(`/teams/${teamId}`);
    } catch (error) {
      toast('error', extractErrorMessage(error, '팀 정보를 저장하지 못했어요.'));
    }
  }

  async function handleDelete() {
    try {
      await deleteTeam.mutateAsync(teamId);
      toast('success', '팀을 삭제했어요.');
      router.push('/my/teams');
    } catch (error) {
      toast('error', extractErrorMessage(error, '팀을 삭제하지 못했어요.'));
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
        <EmptyState
          icon={Search}
          title="팀 정보를 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 팀이에요"
          action={{ label: '팀 목록으로', href: '/teams' }}
        />
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={ShieldOff}
          title="팀 수정 권한이 없어요"
          description="manager 이상 권한이 있는 팀만 수정할 수 있어요"
          action={{ label: '팀 상세로', href: `/teams/${teamId}` }}
        />
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <MobileGlassHeader title="팀 수정" showBack />

      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href={`/teams/${teamId}`} className="hover:text-gray-700 transition-colors">팀 상세</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">팀 수정</span>
      </div>

      <div className="px-5 @3xl:px-0 pb-8 max-w-[760px] space-y-5">
        <section className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
          <h2 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">기본 정보</h2>
          <FormField label="팀 이름" htmlFor="team-name">
            <Input id="team-name" value={form.name} onChange={(event) => updateField('name', event.target.value)} disabled={formDisabled} />
          </FormField>
          <FormField label="종목" htmlFor="team-sport">
            <Select id="team-sport" value={form.sportType} onChange={(event) => updateField('sportType', event.target.value)} disabled={formDisabled}>
              {sportOptions.map((sportType) => (
                <option key={sportType} value={sportType}>{sportLabel[sportType] || sportType}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="팀 소개" htmlFor="team-description">
            <Textarea id="team-description" value={form.description} onChange={(event) => updateField('description', event.target.value)} disabled={formDisabled} className="resize-none" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="도시" htmlFor="team-city">
              <Input id="team-city" value={form.city} onChange={(event) => updateField('city', event.target.value)} disabled={formDisabled} />
            </FormField>
            <FormField label="구/군" htmlFor="team-district">
              <Input id="team-district" value={form.district} onChange={(event) => updateField('district', event.target.value)} disabled={formDisabled} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="팀 레벨" htmlFor="team-level">
              <Select id="team-level" value={form.level} onChange={(event) => updateField('level', Number(event.target.value))} disabled={formDisabled}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </Select>
            </FormField>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={!!form.isRecruiting} onChange={(event) => updateField('isRecruiting', event.target.checked)} disabled={formDisabled} />
                모집중으로 표시
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
          <h2 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">연락 및 링크</h2>
          <FormField label="연락처 / 오픈채팅" htmlFor="team-contact">
            <Input id="team-contact" value={form.contactInfo} onChange={(event) => updateField('contactInfo', event.target.value)} disabled={formDisabled} />
          </FormField>
          <FormField label="Instagram URL" htmlFor="team-instagram">
            <Input id="team-instagram" value={form.instagramUrl} onChange={(event) => updateField('instagramUrl', event.target.value)} disabled={formDisabled} />
          </FormField>
          <FormField label="YouTube URL" htmlFor="team-youtube">
            <Input id="team-youtube" value={form.youtubeUrl} onChange={(event) => updateField('youtubeUrl', event.target.value)} disabled={formDisabled} />
          </FormField>
          <FormField label="Shorts URL" htmlFor="team-shorts">
            <Input id="team-shorts" value={form.shortsUrl} onChange={(event) => updateField('shortsUrl', event.target.value)} disabled={formDisabled} />
          </FormField>
          <FormField label="카카오 오픈채팅 URL" htmlFor="team-kakao">
            <Input id="team-kakao" value={form.kakaoOpenChat} onChange={(event) => updateField('kakaoOpenChat', event.target.value)} disabled={formDisabled} />
          </FormField>
          <FormField label="웹사이트 URL" htmlFor="team-website">
            <Input id="team-website" value={form.websiteUrl} onChange={(event) => updateField('websiteUrl', event.target.value)} disabled={formDisabled} />
          </FormField>
        </section>

        <section className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
          <h2 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">이미지</h2>
          <FormField label="로고 URL" htmlFor="team-logo">
            <Input id="team-logo" value={form.logoUrl} onChange={(event) => updateField('logoUrl', event.target.value)} disabled={formDisabled} />
          </FormField>
          <FormField label="커버 URL" htmlFor="team-cover">
            <Input id="team-cover" value={form.coverImageUrl} onChange={(event) => updateField('coverImageUrl', event.target.value)} disabled={formDisabled} />
          </FormField>
          <FormField label="갤러리 URL (줄바꿈 구분)" htmlFor="team-photos">
            <Textarea id="team-photos" value={photosText} onChange={(event) => setPhotosText(event.target.value)} disabled={formDisabled} className="resize-none min-h-[120px]" />
          </FormField>
        </section>

        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-700 px-5 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            취소
          </button>
          <button onClick={() => void handleSave()} disabled={formDisabled || invalidName} className="min-h-[44px] rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
            {updateTeam.isPending ? '저장 중...' : '저장'}
          </button>
          {canDelete && (
            <button onClick={() => setShowDeleteModal(true)} disabled={deleteDisabled} className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 disabled:opacity-50">
              <Trash2 size={15} />
              팀 삭제
            </button>
          )}
        </div>
      </div>

      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} size="sm">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">팀을 삭제할까요?</h3>
          <p className="mt-2 text-sm text-gray-500">삭제하면 되돌릴 수 없습니다.</p>
          <div className="mt-5 flex w-full gap-3">
            <button onClick={() => setShowDeleteModal(false)} className="flex-1 min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
              취소
            </button>
            <button onClick={() => void handleDelete()} disabled={deleteDisabled} className="flex-1 min-h-[44px] rounded-xl bg-red-500 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {deleteTeam.isPending ? '삭제 중...' : '삭제'}
            </button>
          </div>
        </div>
      </Modal>
      <div className="h-24" />
    </div>
  );
}
