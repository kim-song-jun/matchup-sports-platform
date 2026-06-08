import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  v1AdminMeFixture,
  v1OpsOverviewFixture,
  v1OpsReportsFixture,
  v1OpsSettlementsFixture,
} from '@/test/msw/fixtures';
import {
  OpsAccessState,
  OpsOverviewPage,
  OpsReportsPage,
  OpsSettlementsPage,
} from '@/components/community/ops-pages';
import { opsMutationState } from '@/components/community/ops-api-clients';

const idleState = { isPending: false, isSuccess: false };

describe('ops internal console contract', () => {
  it('shows an explicit forbidden state instead of pretending non-admin access works', () => {
    render(<OpsAccessState state="forbidden" message="Active admin access is required" />);

    expect(screen.getByTestId('ops-overview-open-design')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Teameet 내부 운영 콘솔' })).toHaveAttribute('href', '/ops');
    expect(screen.getByText('접근 권한 없음')).toBeInTheDocument();
    expect(screen.getByText('Active admin access is required')).toBeInTheDocument();
  });

  it('renders overview queues from ops API data', () => {
    render(
      <OpsOverviewPage
        admin={v1AdminMeFixture}
        overview={v1OpsOverviewFixture}
        isLoading={false}
        onRetry={() => undefined}
      />,
    );

    const page = screen.getByTestId('ops-overview-open-design');
    expect(page).toHaveClass('tm-operations-template');
    expect(page).toHaveClass('tm-ops-open-design');
    expect(page).not.toHaveClass('tm-ops-console-dark');
    expect(within(page).getByText('상황판')).toBeInTheDocument();
    expect(within(page).getByText(/내부 운영|Internal Ops/)).toBeInTheDocument();
    expect(within(page).getByText('신고')).toBeInTheDocument();
    expect(within(page).getByText('지급 실패')).toBeInTheDocument();
    expect(within(page).getByText('payout_status_changed')).toBeInTheDocument();
  });

  it('requires a reason before report action submission', () => {
    const onAction = vi.fn();
    render(
      <OpsReportsPage
        page={v1OpsReportsFixture}
        isLoading={false}
        actionState={idleState}
        onAction={onAction}
        onRetry={() => undefined}
      />,
    );

    const resolveButton = screen.getByRole('button', { name: '해결' });
    expect(resolveButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('신고 처리 사유'), { target: { value: '위치 정보 확인 완료' } });
    fireEvent.click(resolveButton);
    expect(onAction).toHaveBeenCalledWith(v1OpsReportsFixture.items[0], 'resolve', '위치 정보 확인 완료');
  });

  it('keeps support admins read-only for protected queue mutations', () => {
    const onAction = vi.fn();
    render(
      <OpsReportsPage
        page={v1OpsReportsFixture}
        isLoading={false}
        actionState={idleState}
        mutationDisabledReason="support 관리자는 큐와 감사 이력을 읽을 수 있지만 보호된 운영 액션은 owner 또는 ops 관리자만 처리할 수 있습니다."
        onAction={onAction}
        onRetry={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText('신고 처리 사유'), { target: { value: '검토 완료' } });
    expect(screen.getByRole('button', { name: '해결' })).toBeDisabled();
    expect(screen.getByText('support 관리자는 큐와 감사 이력을 읽을 수 있지만 보호된 운영 액션은 owner 또는 ops 관리자만 처리할 수 있습니다.')).toHaveAttribute('data-tone', 'warning');
    expect(onAction).not.toHaveBeenCalled();
  });

  it('shows payout failure as a visible provider state', () => {
    render(
      <OpsSettlementsPage
        page={v1OpsSettlementsFixture}
        isLoading={false}
        actionState={idleState}
        payoutState={{
          isPending: false,
          isSuccess: false,
          errorMessage: '지급대행 계약 및 JWE 보안 키 준비 전에는 지급 성공을 표시하지 않습니다.',
        }}
        onAction={() => undefined}
        onPayout={() => undefined}
        onRetry={() => undefined}
      />,
    );

    expect(screen.getByText('TOSS_PAYOUT_CONTRACT_REQUIRED')).toBeInTheDocument();
    expect(screen.getByText('지급대행 계약 및 JWE 보안 키 준비 전에는 지급 성공을 표시하지 않습니다.')).toBeInTheDocument();
    expect(screen.getByText('지급대행 계약 및 JWE 보안 키 준비 전에는 지급 성공을 표시하지 않습니다.')).toHaveAttribute('data-tone', 'danger');
  });

  it('maps provider failures to danger feedback instead of success feedback', () => {
    expect(opsMutationState(
      { isPending: false, isSuccess: true, error: null },
      '지급 요청 결과가 반영되었습니다.',
      '지급대행 계약 및 JWE 보안 키 준비 전에는 지급 성공을 표시하지 않습니다.',
    )).toEqual({
      isPending: false,
      isSuccess: false,
      errorMessage: '지급대행 계약 및 JWE 보안 키 준비 전에는 지급 성공을 표시하지 않습니다.',
      successMessage: '지급 요청 결과가 반영되었습니다.',
    });
  });
});
