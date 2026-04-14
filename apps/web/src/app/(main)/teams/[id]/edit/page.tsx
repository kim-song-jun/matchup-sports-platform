'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useDeleteTeam, useMyTeams, useTeam, useUpdateTeam } from '@/hooks/use-api';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useToast } from '@/components/ui/toast';
import { sportLabel } from '@/lib/constants';
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
    sportTypes: ['soccer'],
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
      sportTypes: team.sportTypes ?? [team.sportType],
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
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast('error', message || '팀 정보를 저장하지 못했어요.');
    }
  }

  async function handleDelete() {
    try {
      await deleteTeam.mutateAsync(teamId);
      toast('success', '팀을 삭제했어요.');
      router.push('/my/teams');
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast('error', message || '팀을 삭제하지 못했어요.');
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
        <p className="text-gray-500">팀 정보를 찾을 수 없어요.</p>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <p className="text-gray-500">팀 수정 권한이 없습니다.</p>
      </div>
    );
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-base text-gray-900 dark:text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-colors';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">팀 수정</h1>
      </header>

      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href={`/teams/${teamId}`} className="hover:text-gray-700 transition-colors">팀 상세</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">팀 수정</span>
      </div>

      <div className="px-5 @3xl:px-0 pb-8 max-w-[760px] space-y-5">
        <section className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">기본 정보</h2>
          <div>
            <label htmlFor="team-name" className={labelClass}>팀 이름</label>
            <input id="team-name" className={inputClass} value={form.name} onChange={(event) => updateField('name', event.target.value)} disabled={formDisabled} />
          </div>
          <div>
            <label className={labelClass}>종목 (복수 선택 가능)</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {sportOptions.map((st) => {
                const selected = form.sportTypes.includes(st);
                return (
                  <button
                    key={st}
                    type="button"
                    disabled={formDisabled}
                    onClick={() => {
                      const next = selected
                        ? form.sportTypes.filter(s => s !== st)
                        : [...form.sportTypes, st];
                      if (next.length > 0) updateField('sportTypes', next);
                    }}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                      selected
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    {sportLabel[st] || st}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label htmlFor="team-description" className={labelClass}>팀 소개</label>
            <textarea id="team-description" className={`${inputClass} min-h-[100px]`} value={form.description} onChange={(event) => updateField('description', event.target.value)} disabled={formDisabled} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="team-city" className={labelClass}>도시</label>
              <input id="team-city" className={inputClass} value={form.city} onChange={(event) => updateField('city', event.target.value)} disabled={formDisabled} />
            </div>
            <div>
              <label htmlFor="team-district" className={labelClass}>구/군</label>
              <input id="team-district" className={inputClass} value={form.district} onChange={(event) => updateField('district', event.target.value)} disabled={formDisabled} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="team-level" className={labelClass}>팀 레벨</label>
              <select id="team-level" className={inputClass} value={form.level} onChange={(event) => updateField('level', Number(event.target.value))} disabled={formDisabled}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden text-sm font-medium" role="group" aria-label="모집 상태">
                <button
                  type="button"
                  onClick={() => updateField('isRecruiting', true)}
                  aria-pressed={!!form.isRecruiting}
                  disabled={formDisabled}
                  className={`px-4 py-2 transition-colors ${form.isRecruiting ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  모집중
                </button>
                <button
                  type="button"
                  onClick={() => updateField('isRecruiting', false)}
                  aria-pressed={!form.isRecruiting}
                  disabled={formDisabled}
                  className={`px-4 py-2 transition-colors border-l border-gray-200 dark:border-gray-700 ${!form.isRecruiting ? 'bg-gray-700 text-white dark:bg-gray-600' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  모집마감
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">연락 및 링크</h2>
          <div>
            <label htmlFor="team-contact" className={labelClass}>연락처 / 오픈채팅</label>
            <input id="team-contact" className={inputClass} value={form.contactInfo} onChange={(event) => updateField('contactInfo', event.target.value)} disabled={formDisabled} />
          </div>
          <div>
            <label htmlFor="team-instagram" className={labelClass}>Instagram URL</label>
            <input id="team-instagram" className={inputClass} value={form.instagramUrl} onChange={(event) => updateField('instagramUrl', event.target.value)} disabled={formDisabled} />
          </div>
          <div>
            <label htmlFor="team-youtube" className={labelClass}>YouTube URL</label>
            <input id="team-youtube" className={inputClass} value={form.youtubeUrl} onChange={(event) => updateField('youtubeUrl', event.target.value)} disabled={formDisabled} />
          </div>
          <div>
            <label htmlFor="team-shorts" className={labelClass}>Shorts URL</label>
            <input id="team-shorts" className={inputClass} value={form.shortsUrl} onChange={(event) => updateField('shortsUrl', event.target.value)} disabled={formDisabled} />
          </div>
          <div>
            <label htmlFor="team-kakao" className={labelClass}>카카오 오픈채팅 URL</label>
            <input id="team-kakao" className={inputClass} value={form.kakaoOpenChat} onChange={(event) => updateField('kakaoOpenChat', event.target.value)} disabled={formDisabled} />
          </div>
          <div>
            <label htmlFor="team-website" className={labelClass}>웹사이트 URL</label>
            <input id="team-website" className={inputClass} value={form.websiteUrl} onChange={(event) => updateField('websiteUrl', event.target.value)} disabled={formDisabled} />
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">이미지</h2>
          <div>
            <label htmlFor="team-logo" className={labelClass}>로고 URL</label>
            <input id="team-logo" className={inputClass} value={form.logoUrl} onChange={(event) => updateField('logoUrl', event.target.value)} disabled={formDisabled} />
          </div>
          <div>
            <label htmlFor="team-cover" className={labelClass}>커버 URL</label>
            <input id="team-cover" className={inputClass} value={form.coverImageUrl} onChange={(event) => updateField('coverImageUrl', event.target.value)} disabled={formDisabled} />
          </div>
          <div>
            <label htmlFor="team-photos" className={labelClass}>갤러리 URL (줄바꿈 구분)</label>
            <textarea id="team-photos" className={`${inputClass} min-h-[120px]`} value={photosText} onChange={(event) => setPhotosText(event.target.value)} disabled={formDisabled} />
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="rounded-xl bg-gray-100 dark:bg-gray-700 px-5 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            취소
          </button>
          <button onClick={() => void handleSave()} disabled={formDisabled || invalidName} className="rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
            {updateTeam.isPending ? '저장 중...' : '저장'}
          </button>
          {canDelete && (
            <button onClick={() => setShowDeleteModal(true)} disabled={deleteDisabled} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 disabled:opacity-50">
              <Trash2 size={15} />
              팀 삭제
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
            <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">팀을 삭제할까요?</h3>
            <p className="mt-2 text-sm text-gray-500 text-center">삭제하면 되돌릴 수 없습니다.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                취소
              </button>
              <button onClick={() => void handleDelete()} disabled={deleteDisabled} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white disabled:opacity-50">
                {deleteTeam.isPending ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
