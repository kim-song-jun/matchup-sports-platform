import { useState, type ComponentProps } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { V1AuthMe, V1CreateInquiryPayload, V1Inquiry } from '@/types/api';
import { TournamentInquiryModal } from './tournament-inquiry-modal';

type ModalProps = ComponentProps<typeof TournamentInquiryModal>;
export type InquiryOverrides = Partial<Omit<ModalProps, 'onClose' | 'onSubmitted' | 'onRetrySession'>>;

export const MEMBER = {
  user: { id: 'inquiry-member-148', email: 'member148@example.com', onboardingStatus: 'completed' },
  profile: { displayName: '문의 테스트 회원', nickname: '문의회원' },
  termsCompliance: { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null },
  verification: { emailVerified: true, phoneVerified: true },
} satisfies V1AuthMe;

export const RECEIVED_INQUIRY = {
  inquiryId: 'inquiry-148', category: 'tournament', title: '[참가·신청] 참가 확인',
  body: '신청 상태를 확인해 주세요.', contact: null, relatedType: 'tournament',
  relatedId: 'tournament-148', reportReason: null, status: 'received',
  createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z',
  closedAt: null,
} satisfies V1Inquiry;

export const receivedRequests: unknown[] = [];
const inquiryClients = new Set<QueryClient>();
export const server = setupServer(
  http.post('*/api/v1/inquiries', async ({ request }) => {
    const payload: unknown = await request.json();
    receivedRequests.push(payload);
    return inquirySuccess(parseInquiryRequest(payload));
  }),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);

const MEMBER_CATEGORIES = ['account', 'match', 'team', 'tournament', 'payment_refund', 'report', 'other'] as const satisfies readonly V1CreateInquiryPayload['category'][];
const RELATED_TYPES = ['match', 'team', 'team_match', 'tournament', 'registration', 'payment', 'user', 'team_contact'] as const satisfies readonly NonNullable<V1CreateInquiryPayload['relatedType']>[];
const REPORT_REASONS = ['spam', 'harassment', 'impersonation', 'inappropriate', 'other'] as const satisfies readonly NonNullable<V1CreateInquiryPayload['reportReason']>[];

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return allowed.some((candidate) => candidate === value);
}

export function parseInquiryRequest(payload: unknown): V1CreateInquiryPayload {
  if (typeof payload !== 'object' || payload === null
    || !('category' in payload) || !isOneOf(payload.category, MEMBER_CATEGORIES)
    || !('title' in payload) || typeof payload.title !== 'string' || !payload.title.trim() || payload.title.length > 80
    || !('body' in payload) || typeof payload.body !== 'string' || !payload.body.trim() || payload.body.length > 2000) {
    throw new Error('문의 요청이 실제 회원 문의 category/title/body 계약과 달라요.');
  }
  const contact = 'contact' in payload ? payload.contact : undefined;
  const relatedType = 'relatedType' in payload ? payload.relatedType : undefined;
  const relatedId = 'relatedId' in payload ? payload.relatedId : undefined;
  const reportReason = 'reportReason' in payload ? payload.reportReason : undefined;
  if ((contact !== undefined && (typeof contact !== 'string' || contact.length > 120))
    || (relatedType !== undefined && !isOneOf(relatedType, RELATED_TYPES))
    || (relatedId !== undefined && (typeof relatedId !== 'string' || relatedId.length > 80))
    || (reportReason !== undefined && !isOneOf(reportReason, REPORT_REASONS))) {
    throw new Error('문의 요청의 선택 필드가 실제 회원 문의 DTO 계약과 달라요.');
  }
  if (Boolean(relatedType) !== Boolean(relatedId?.trim()) || (reportReason !== undefined && payload.category !== 'report')) {
    throw new Error('문의 요청의 대상 또는 신고 사유가 실제 서비스 계약과 달라요.');
  }
  return {
    category: payload.category, title: payload.title, body: payload.body,
    ...(contact !== undefined ? { contact } : {}),
    ...(relatedType !== undefined ? { relatedType } : {}),
    ...(relatedId !== undefined ? { relatedId } : {}),
    ...(reportReason !== undefined ? { reportReason } : {}),
  };
}

export function inquirySuccess(payload: V1CreateInquiryPayload) {
  const inquiry: V1Inquiry = {
    ...RECEIVED_INQUIRY,
    category: payload.category, title: payload.title.trim(), body: payload.body.trim(),
    contact: payload.contact?.trim() || null,
    relatedType: payload.relatedType ?? null, relatedId: payload.relatedId?.trim() || null,
    reportReason: payload.reportReason ?? null,
  };
  return HttpResponse.json({ status: 'success', data: inquiry, timestamp: inquiry.createdAt });
}

function InquiryHarness({ overrides }: { readonly overrides: InquiryOverrides }) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>문의하기</button>
      {submitted ? <p role="status">문의 접수 완료</p> : null}
      {retryCount > 0 ? <p role="status">계정 재확인 요청</p> : null}
      {open ? (
        <TournamentInquiryModal
          tournamentId="tournament-148"
          tournamentTitle="문의 유형 검증 대회"
          authUser={MEMBER}
          isSessionChecking={false}
          hasSessionError={false}
          {...overrides}
          onClose={() => setOpen(false)}
          onSubmitted={() => { setSubmitted(true); setOpen(false); }}
          onRetrySession={() => setRetryCount((count) => count + 1)}
        />
      ) : null}
    </>
  );
}

export function renderInquiry(overrides: InquiryOverrides = {}) {
  const client = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: Infinity },
    mutations: { retry: false, gcTime: Infinity },
  } });
  inquiryClients.add(client);
  const view = render(
    <QueryClientProvider client={client}>
      <InquiryHarness overrides={overrides} />
    </QueryClientProvider>,
  );
  return { ...view, client };
}

export function cleanupInquiryClients() {
  for (const client of inquiryClients) client.clear();
  inquiryClients.clear();
}
