'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Search, ShieldOff } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useUpdateVenue, useVenue, useVenueHub } from '@/hooks/use-api';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import type { Venue } from '@/types/api';
import { extractErrorMessage } from '@/lib/utils';

type VenueEditState = Pick<Venue, 'name' | 'address' | 'description' | 'phone' | 'city' | 'district' | 'pricePerHour'>;

function toInitialState(): VenueEditState {
  return {
    name: '',
    address: '',
    description: '',
    phone: '',
    city: '',
    district: '',
    pricePerHour: null,
  };
}

export default function VenueEditPage() {
  const params = useParams();
  const router = useRouter();
  const venueId = params.id as string;
  const { toast } = useToast();
  const { data: venue, isLoading } = useVenue(venueId);
  const { data: hubData } = useVenueHub(venueId);
  const updateVenue = useUpdateVenue();
  const [form, setForm] = useState<VenueEditState>(toInitialState);

  useEffect(() => {
    if (!venue) return;
    setForm({
      name: venue.name,
      address: venue.address,
      description: venue.description,
      phone: venue.phone,
      city: venue.city,
      district: venue.district,
      pricePerHour: venue.pricePerHour,
    });
  }, [venue]);

  const canEdit = hubData?.capabilities?.canEditProfile ?? false;

  function updateField<K extends keyof VenueEditState>(key: K, value: VenueEditState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    try {
      await updateVenue.mutateAsync({
        id: venueId,
        data: {
          ...form,
          description: form.description?.trim() || null,
          phone: form.phone?.trim() || null,
          city: form.city?.trim(),
          district: form.district?.trim(),
          pricePerHour: form.pricePerHour != null ? Number(form.pricePerHour) : null,
        },
      });
      toast('success', '시설 정보를 저장했어요.');
      router.push(`/venues/${venueId}`);
    } catch (error) {
      toast('error', extractErrorMessage(error, '시설 정보를 저장하지 못했어요.'));
    }
  }

  if (isLoading) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <div className="h-44 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={Search}
          title="시설 정보를 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 시설이에요"
          action={{ label: '시설 목록으로', href: '/venues' }}
        />
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={ShieldOff}
          title="시설 수정 권한이 없어요"
          description="시설 관리자만 수정할 수 있어요"
          action={{ label: '시설 상세로', href: `/venues/${venueId}` }}
        />
      </div>
    );
  }

  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <MobileGlassHeader title="시설 수정" showBack />

      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href={`/venues/${venueId}`} className="hover:text-gray-600 transition-colors">시설 상세</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">시설 수정</span>
      </div>

      <div className="px-5 @3xl:px-0 max-w-[760px] space-y-5 pb-8">
        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
          <div>
            <label htmlFor="venue-name" className={labelClass}>시설명</label>
            <Input id="venue-name" value={form.name} onChange={(event) => updateField('name', event.target.value)} />
          </div>
          <div>
            <label htmlFor="venue-address" className={labelClass}>주소</label>
            <Input id="venue-address" value={form.address} onChange={(event) => updateField('address', event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="venue-city" className={labelClass}>도시</label>
              <Input id="venue-city" value={form.city} onChange={(event) => updateField('city', event.target.value)} />
            </div>
            <div>
              <label htmlFor="venue-district" className={labelClass}>구/군</label>
              <Input id="venue-district" value={form.district} onChange={(event) => updateField('district', event.target.value)} />
            </div>
          </div>
          <div>
            <label htmlFor="venue-phone" className={labelClass}>전화번호</label>
            <Input id="venue-phone" value={form.phone ?? ''} onChange={(event) => updateField('phone', event.target.value)} />
          </div>
          <div>
            <label htmlFor="venue-price" className={labelClass}>시간당 이용요금</label>
            <Input id="venue-price" type="number" value={form.pricePerHour ?? ''} onChange={(event) => updateField('pricePerHour', event.target.value ? Number(event.target.value) : null)} />
          </div>
          <div>
            <label htmlFor="venue-description" className={labelClass}>시설 소개</label>
            <Textarea id="venue-description" value={form.description ?? ''} onChange={(event) => updateField('description', event.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="rounded-xl bg-gray-100 dark:bg-gray-700 px-5 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            취소
          </button>
          <button onClick={() => void handleSave()} disabled={updateVenue.isPending} className="rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
            {updateVenue.isPending ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
