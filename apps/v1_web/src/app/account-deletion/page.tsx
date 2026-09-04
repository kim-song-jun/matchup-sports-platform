import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthFrame } from '@/components/auth/auth-page';
import { Card } from '@/components/v1-ui/primitives';

const ACCOUNT_DELETION_EMAIL = 'teameetsports@naver.com';
const ACCOUNT_DELETION_MAILTO = `mailto:${ACCOUNT_DELETION_EMAIL}?subject=${encodeURIComponent(
  '[Teameet] 계정 삭제 요청',
)}`;

export const metadata: Metadata = {
  title: '계정 삭제 요청',
  description: 'Teameet 계정과 연결된 개인정보의 삭제 요청 방법을 안내합니다.',
  alternates: { canonical: '/account-deletion' },
};

export default function AccountDeletionPage() {
  return (
    <AuthFrame topTitle="계정 삭제 안내" backHref="/landing">
      <div className="tm-auth-body">
        <h1 className="tm-text-heading tm-auth-heading">Teameet 계정 삭제를 요청할 수 있어요</h1>
        <p className="tm-text-body tm-auth-sub">
          앱을 설치하지 않은 상태에서도 아래 이메일로 계정과 연결된 개인정보 삭제를 요청할 수 있어요.
        </p>

        <div className="tm-auth-stack">
          <Card pad={16}>
            <h2 className="tm-text-body-lg" style={{ margin: 0 }}>앱에서 요청하기</h2>
            <p className="tm-text-caption" style={{ margin: '8px 0 16px', lineHeight: 1.6 }}>
              로그인할 수 있다면 설정의 회원 탈퇴 화면에서 본인 계정으로 바로 요청해 주세요.
            </p>
            <Link className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block" href="/my/settings/withdrawal">
              앱에서 탈퇴 요청하기
            </Link>
          </Card>

          <Card pad={16}>
            <h2 className="tm-text-body-lg" style={{ margin: 0 }}>웹에서 요청하기</h2>
            <p className="tm-text-caption" style={{ margin: '8px 0 16px', lineHeight: 1.6 }}>
              가입 이메일 또는 닉네임과 함께 삭제 요청을 보내 주세요. 계정 보호를 위해 운영팀이 본인 확인을 추가로 요청할 수 있어요.
            </p>
            <a className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={ACCOUNT_DELETION_MAILTO}>
              이메일로 삭제 요청하기
            </a>
            <p className="tm-text-caption" style={{ margin: '10px 0 0', textAlign: 'center' }}>
              {ACCOUNT_DELETION_EMAIL}
            </p>
          </Card>

          <Card pad={16}>
            <h2 className="tm-text-body-lg" style={{ margin: 0 }}>처리 범위</h2>
            <ul className="tm-text-caption" style={{ margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.7 }}>
              <li>앱에서 탈퇴 요청이 접수되면 로그인과 푸시 알림 등록을 즉시 중지해요.</li>
              <li>본인 확인 후 연락처, 로그인 연결 정보, 프로필 기본 정보, 활동 지역과 검색 기록을 삭제하거나 식별할 수 없게 처리해요.</li>
              <li>진행 중인 매치나 팀 운영 권한이 있으면 먼저 정리가 필요할 수 있어요.</li>
              <li>완료된 경기 기록, 결제·환불, 분쟁·부정 이용 대응 기록은 개인정보처리방침에 적힌 목적과 기간에 한해 제한적으로 보관될 수 있어요.</li>
            </ul>
            <Link
              className="tm-btn tm-btn-md tm-btn-ghost tm-btn-block"
              href="/terms?document=privacy"
              style={{ marginTop: 12 }}
            >
              개인정보처리방침 확인하기
            </Link>
          </Card>
        </div>
      </div>
    </AuthFrame>
  );
}
