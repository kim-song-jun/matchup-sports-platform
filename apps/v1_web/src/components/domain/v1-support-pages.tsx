import Link from 'next/link';
import type { ReactNode } from 'react';
import { Bell, Check, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Section } from '@/components/ui/section';

type AuthMode = 'login' | 'signup' | 'terms';
type OnboardingStep = 'resume' | 'sport' | 'level' | 'region' | 'confirm';
type SettingsMode = 'settings' | 'notifications' | 'legal' | 'withdrawal' | 'profile-edit';
type AdminMode = 'dashboard' | 'audit';

export function AuthProductPage({ mode }: { mode: AuthMode }) {
  const title = mode === 'login' ? '로그인' : mode === 'signup' ? '가입 시작' : '약관 확인';

  return (
    <SimpleFrame>
      <main className="v1-public-main">
        <section className="v1-card v1-card-pad">
          <Badge tone="blue">SM New v1</Badge>
          <h1 className="v1-title" style={{ marginTop: 12 }}>{title}</h1>
          <p className="v1-body" style={{ marginTop: 8 }}>
            v1은 기존 앱을 대체하지 않는 별도 런타임입니다. 실제 소셜 인증 UI는 API contract layer 이후 연결합니다.
          </p>
        </section>

        <Section title="지원 상태">
          <div className="v1-list">
            <StatusRow label="현재 사용자 조회" value="auth/me 연결 예정" done />
            <StatusRow label="온보딩 저장" value="v1 onboarding API 연결 예정" done />
            <StatusRow label="소셜 제공자 실패" value="오류 상태 copy 필요" />
            <StatusRow label="중복 계정/차단 계정" value="API 에러 코드 바인딩 필요" />
          </div>
        </Section>

        <div className="v1-floating-cta">
          <Link className="v1-button" href="/onboarding/resume">온보딩 이어가기</Link>
        </div>
      </main>
    </SimpleFrame>
  );
}

export function OnboardingProductPage({ step }: { step: OnboardingStep }) {
  const steps = [
    { key: 'sport', label: '관심 종목' },
    { key: 'level', label: '실력 범위' },
    { key: 'region', label: '활동 지역' },
    { key: 'confirm', label: '확인' },
  ];
  const active = step === 'resume' ? 0 : Math.max(0, steps.findIndex((item) => item.key === step));

  return (
    <SimpleFrame>
      <main className="v1-public-main">
        <section className="v1-card v1-card-pad">
          <Badge tone="green">{step === 'resume' ? '이어하기' : '온보딩'}</Badge>
          <h1 className="v1-title" style={{ marginTop: 12 }}>맞는 매치를 찾기 위한 기본 설정</h1>
          <p className="v1-body" style={{ marginTop: 8 }}>
            선택값은 추천과 검색 기본값에만 사용합니다. 저장 실패, 누락값, 중단 후 재개 상태는 같은 흐름 안에서 처리합니다.
          </p>
        </section>

        <Section title="진행 단계">
          <div className="v1-list">
            {steps.map((item, index) => (
              <div key={item.key} className="v1-card v1-card-pad">
                <div className="v1-row">
                  <div>
                    <Badge tone={index <= active ? 'blue' : 'grey'}>{index + 1}</Badge>
                    <p className="v1-item-title" style={{ marginTop: 8 }}>{item.label}</p>
                    <p className="v1-caption" style={{ marginTop: 4 }}>{onboardingCopy(item.key)}</p>
                  </div>
                  {index < active ? <Check size={20} color="var(--green)" /> : null}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </main>
    </SimpleFrame>
  );
}

export function SettingsProductPage({ mode }: { mode: SettingsMode }) {
  const title =
    mode === 'profile-edit'
      ? '프로필 수정'
      : mode === 'notifications'
        ? '알림 설정'
        : mode === 'legal'
          ? '약관 및 정책'
          : mode === 'withdrawal'
            ? '탈퇴 요청'
            : '설정';

  return (
    <AppShell>
      <main className="v1-main">
        <section className="v1-card v1-card-pad">
          <Badge tone={mode === 'withdrawal' ? 'red' : 'blue'}>{title}</Badge>
          <h2 className="v1-item-title" style={{ marginTop: 10 }}>{title}</h2>
          <p className="v1-body" style={{ marginTop: 6 }}>
            이메일/비밀번호 변경은 v1 범위 밖입니다. 알림 선호, 프로필 표시값, 로그아웃 no-op, 탈퇴 요청만 v1 API에 맞춰 둡니다.
          </p>
        </section>

        <Section title="계정 항목">
          <div className="v1-list">
            <SettingsRow icon={<UserRound size={18} />} href="/my/profile/edit" label="프로필 표시 정보" value="닉네임, 지역, 소개" />
            <SettingsRow icon={<Bell size={18} />} href="/my/settings/notifications" label="알림 선호" value="매치, 팀, 채팅 알림" />
            <SettingsRow icon={<ShieldCheck size={18} />} href="/my/settings/legal" label="약관 및 정책" value="읽기 전용" />
            <SettingsRow icon={<LogOut size={18} />} href="/my/settings/withdrawal" label="탈퇴 요청" value="확정 전 경고 필요" danger />
          </div>
        </Section>
      </main>
    </AppShell>
  );
}

export function AdminProductPage({ mode }: { mode: AdminMode }) {
  return (
    <AppShell>
      <main className="v1-main">
        <section className="v1-card v1-card-pad">
          <Badge tone="orange">admin minimum</Badge>
          <h2 className="v1-item-title" style={{ marginTop: 10 }}>{mode === 'audit' ? '감사 로그' : '운영 상태'}</h2>
          <p className="v1-body" style={{ marginTop: 6 }}>
            v1 관리자는 상태 확인과 감사 로그 중심입니다. 제재, 정산, 분쟁 처리는 성공처럼 시뮬레이션하지 않습니다.
          </p>
        </section>

        <Section title={mode === 'audit' ? '최근 감사 이벤트' : '운영 체크'}>
          <div className="v1-list">
            <StatusRow label="API 상태" value="health/admin endpoint 바인딩 예정" done />
            <StatusRow label="감사 로그" value="사유, 주체, 결과를 표시" done />
            <StatusRow label="운영 mutation" value="부분 실패와 사유 입력 필요" />
          </div>
        </Section>
      </main>
    </AppShell>
  );
}

export function PublicMarketingProductPage() {
  return (
    <SimpleFrame>
      <main className="v1-public-main">
        <section className="v1-card v1-card-pad">
          <Badge tone="blue">teameet v1</Badge>
          <h1 className="v1-title" style={{ marginTop: 12 }}>같이 운동할 사람과 팀을 찾는 곳</h1>
          <p className="v1-body" style={{ marginTop: 8 }}>
            공개 소개 화면은 샘플 통계만 사용합니다. 실제 모집, 팀 신뢰도, 결제 가능 여부처럼 보이는 표현은 앱 데이터 연결 후에만 노출합니다.
          </p>
        </section>

        <Section title="바로 시작">
          <div className="v1-grid-2">
            <Link className="v1-quick v1-quick-primary" href="/home">앱으로 이동</Link>
            <Link className="v1-quick" href="/login">로그인</Link>
          </div>
        </Section>
      </main>
    </SimpleFrame>
  );
}

function SimpleFrame({ children }: { children: ReactNode }) {
  return (
    <div className="v1-root">
      <div className="v1-frame">{children}</div>
    </div>
  );
}

function StatusRow({ label, value, done }: { label: string; value: string; done?: boolean }) {
  return (
    <div className="v1-card v1-card-pad">
      <div className="v1-row">
        <div>
          <p className="v1-item-title">{label}</p>
          <p className="v1-caption" style={{ marginTop: 4 }}>{value}</p>
        </div>
        <Badge tone={done ? 'green' : 'orange'}>{done ? '지원' : '연결 필요'}</Badge>
      </div>
    </div>
  );
}

function SettingsRow({
  icon,
  href,
  label,
  value,
  danger,
}: {
  icon: ReactNode;
  href: string;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <Link className="v1-card v1-card-pad v1-card-link" href={href}>
      <div className="v1-row" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
        <span className="v1-icon-button" style={{ width: 34, height: 34, background: 'var(--surface-soft)' }}>{icon}</span>
        <div>
          <p className="v1-item-title">{label}</p>
          <p className="v1-caption" style={{ marginTop: 4 }}>{value}</p>
        </div>
        <Badge tone={danger ? 'red' : 'grey'}>{danger ? '주의' : '설정'}</Badge>
      </div>
    </Link>
  );
}

function onboardingCopy(key: string) {
  if (key === 'sport') return '선호 종목은 추천 필터의 기본값이 됩니다.';
  if (key === 'level') return '실력은 verified가 아닌 자기 선택값으로 표시합니다.';
  if (key === 'region') return '활동 지역은 검색 반경과 홈 추천에 사용합니다.';
  return '저장 전 누락값과 재개 상태를 확인합니다.';
}
