import type { AuthExceptionKind, AuthExceptionViewModel, EmailLoginViewModel, LoginViewModel, OnboardingStep, OnboardingViewModel, SignupCompleteViewModel, SignupFormViewModel, TermsViewModel } from './auth.types';

export function getLoginViewModel(): LoginViewModel {
  return {
    heroTitle: '같이 뛸 사람을\n한 번에 찾아요',
    heroSub: 'Teameet에 오신 걸 환영합니다',
    emailHref: '/login/email',
    guestHref: '/home',
    signupHref: '/terms',
    providers: [
      { label: '카카오', background: '#FEE500', color: 'var(--static-black)', href: '/auth/provider-denied' },
      { label: '네이버', background: 'var(--green500)', color: 'var(--static-white)', href: '/auth/missing-email' },
      { label: 'Apple', background: 'var(--static-black)', color: 'var(--static-white)', href: '/auth/account-conflict' },
    ],
  };
}

export function getEmailLoginViewModel(): EmailLoginViewModel {
  return {
    backHref: '/login',
    title: '이메일로\n로그인하세요',
    sub: '가입한 이메일과 비밀번호로 로그인합니다. 실패해도 입력값은 유지하고 같은 화면에서 복구합니다.',
    fields: [
      { label: '이메일', placeholder: 'you@example.com', type: 'email' },
      { label: '비밀번호', placeholder: '비밀번호', type: 'password' },
    ],
    primary: { label: '로그인', tone: 'primary' },
    forgot: { label: '비밀번호 찾기', href: '/auth/password-reset', tone: 'neutral' },
    signupHref: '/terms',
    notice: {
      title: 'Mock login 유지',
      body: 'seeded preview 계정은 이전 화면의 Mock login으로 계속 사용할 수 있습니다. 이메일 로그인은 실제 가입 계정에 연결됩니다.',
    },
  };
}

export function getAuthExceptionViewModel(kind: AuthExceptionKind): AuthExceptionViewModel {
  const models: Record<AuthExceptionKind, AuthExceptionViewModel> = {
    'provider-denied': {
      backHref: '/login',
      badge: '소셜 권한 거부',
      title: '로그인을 완료하지 못했어요',
      body: '필수 정보 제공 동의가 취소되었습니다. 계정은 생성되지 않았고, 같은 제공자 또는 다른 로그인 방법으로 다시 시도할 수 있습니다.',
      tone: 'orange',
      primary: { label: '다시 로그인하기', href: '/login' },
      secondary: { label: '다른 방법 선택', href: '/login', tone: 'neutral' },
    },
    'missing-email': {
      backHref: '/login',
      badge: '이메일 누락',
      title: '확인 가능한 이메일이 필요해요',
      body: '소셜 계정에서 검증된 이메일을 받을 수 없습니다. 이메일을 직접 입력하고 인증한 뒤 같은 온보딩 흐름을 이어갑니다.',
      tone: 'orange',
      primary: { label: '이메일 직접 인증', href: '/login/email' },
      secondary: { label: '소셜 계정 바꾸기', href: '/login', tone: 'neutral' },
    },
    blocked: {
      backHref: '/login',
      badge: '계정 제한',
      title: '현재 계정은 이용할 수 없어요',
      body: '정지, 탈퇴 대기, 운영 제한 상태에서는 계속하기와 홈 이동을 모두 막고 고객센터 요청 경로만 제공합니다.',
      tone: 'red',
      primary: { label: '고객센터 문의', disabled: true, tone: 'danger' },
      secondary: { label: '로그인으로 돌아가기', href: '/login', tone: 'neutral' },
    },
    'account-conflict': {
      backHref: '/login',
      badge: '계정 충돌',
      title: '이미 가입된 정보가 있어요',
      body: '같은 이메일 또는 휴대폰이 다른 인증 수단과 연결되어 있습니다. 기존 계정을 확인한 뒤 연결 또는 병합을 진행합니다.',
      tone: 'orange',
      primary: { label: '기존 계정 확인', href: '/login/email' },
      secondary: { label: '다른 방법 선택', href: '/login', tone: 'neutral' },
    },
    'location-denied': {
      backHref: '/onboarding/region',
      badge: '위치 권한',
      title: '현재 위치를 사용할 수 없어요',
      body: '위치 권한을 거부해도 종목과 실력 입력값은 유지됩니다. 수동 지역 선택으로 온보딩을 마칠 수 있습니다.',
      tone: 'orange',
      primary: { label: '수동으로 지역 선택', href: '/onboarding/region' },
      secondary: { label: '설정에서 권한 열기', disabled: true, tone: 'neutral' },
    },
    'password-reset': {
      backHref: '/login/email',
      badge: '비밀번호 찾기',
      title: '비밀번호 재설정은 준비 중이에요',
      body: '이메일/SMS 발송 인프라가 연결되기 전까지는 재설정 링크를 보낸 것처럼 처리하지 않습니다. 현재는 Mock login 또는 새 이메일 회원가입으로 복구할 수 있습니다.',
      tone: 'orange',
      primary: { label: '이메일 로그인으로 돌아가기', href: '/login/email' },
      secondary: { label: 'Mock login 사용하기', href: '/login', tone: 'neutral' },
    },
  };

  return models[kind];
}

export function getTermsViewModel(): TermsViewModel {
  return {
    backHref: '/login',
    title: '가입 전에 약관을 먼저 확인합니다',
    sub: '필수 약관을 모두 동의해야 회원가입 입력 화면으로 이동할 수 있습니다.',
    agreements: [
      { title: '서비스 이용약관', meta: '필수 · 보기', required: true, checked: true },
      { title: '개인정보 처리방침', meta: '필수 · 보기', required: true, checked: true },
      { title: '위치 기반 서비스', meta: '선택 · 나중에 설정 가능', required: false, checked: false },
      { title: '마케팅 알림', meta: '선택 · 설정에서 변경 가능', required: false, checked: false },
    ],
    primary: { label: '동의하고 회원가입하기', href: '/signup' },
  };
}

export function getSignupFormViewModel(): SignupFormViewModel {
  return {
    backHref: '/terms',
    title: '계정을 만들고\n운동 설정을 이어가요',
    sub: '회원가입 후 원본 01의 종목, 레벨, 지역 선택 화면으로 이어진다.',
    fields: [
      { label: '닉네임', placeholder: '사용할 닉네임', type: 'text', helper: '2자 이상 입력해 주세요.', action: { label: '중복체크', disabled: true, tone: 'neutral' } },
      { label: '이메일', placeholder: 'you@example.com', type: 'email' },
      { label: '비밀번호', placeholder: '8자 이상', type: 'password' },
      { label: '비밀번호 확인', placeholder: '비밀번호 다시 입력', type: 'password', helper: '일치하지 않으면 가입 CTA는 비활성화합니다.' },
    ],
    notice: {
      title: '가입 후 행동',
      body: '가입 성공 시 로그인 상태로 종목 선택 step에 진입한다. 닉네임 중복 실패와 비밀번호 불일치는 현재 화면에 남겨 복구한다.',
    },
    primary: { label: '회원가입하고 계속', tone: 'primary' },
  };
}

export function getSignupCompleteViewModel(): SignupCompleteViewModel {
  return {
    title: '회원가입이 완료됐어요',
    sub: '이제 운동 설정을 하면 더 정확한 매치 추천을 받을 수 있습니다.',
    steps: [
      { title: '약관 동의 완료', body: '필수 약관 동의가 저장되었습니다.', done: true },
      { title: '회원가입 완료', body: '계정 생성이 완료되었습니다. 뒤로가도 계정은 유지됩니다.', done: true },
    ],
    primary: { label: '운동 설정 시작하기', href: '/onboarding/sport' },
    secondary: { label: '나중에 설정하기', href: '/home', tone: 'neutral' },
  };
}

export function getOnboardingViewModel(step: OnboardingStep): OnboardingViewModel {
  const models: Record<OnboardingStep, OnboardingViewModel> = {
    resume: {
      step,
      stepNo: 0,
      totalSteps: 3,
      title: '운동 설정을 이어갈까요?',
      sub: '이전에 선택한 종목과 실력은 유지됩니다. 완료하지 않은 지역 선택부터 다시 시작할 수 있습니다.',
      options: [
        { label: '관심 종목', meta: '축구 · 풋살 · 러닝 · 수영', selected: true },
        { label: '실력 입력', meta: '축구 중수 · 풋살 초보 · 러닝 입문 · 수영 초보', selected: true },
        { label: '활동 지역', meta: '아직 선택 전', selected: false },
      ],
      notice: { title: '입력값 보존', body: '중단 복귀 시 완료된 단계는 체크하고, 진행 단계만 다시 요청합니다.', tone: 'blue' },
      primary: { label: '지역 선택부터 이어가기', href: '/onboarding/region' },
      secondary: { label: '처음부터 다시 선택', href: '/onboarding/sport', tone: 'neutral' },
    },
    sport: {
      step,
      stepNo: 1,
      totalSteps: 3,
      title: '관심 종목을 선택해 주세요',
      sub: '선택한 종목을 기준으로 다음 실력 입력 단계가 구성됩니다.',
      backHref: '/signup',
      skipHref: '/home',
      options: ['축구', '풋살', '러닝', '수영'].map((label) => ({
        label,
        meta: '선택됨',
        selected: true,
      })),
      primary: { label: '실력 입력하기', href: '/onboarding/level' },
    },
    level: {
      step,
      stepNo: 2,
      totalSteps: 3,
      title: '종목별 실력을 입력해 주세요',
      sub: '무리 없는 매칭을 위해 종목마다 현재 실력을 선택합니다.',
      backHref: '/onboarding/sport',
      options: [
        { label: '축구', meta: '중수 선택됨', selected: true },
        { label: '풋살', meta: '초보 선택됨', selected: true },
        { label: '러닝', meta: '입문 선택됨', selected: true },
        { label: '수영', meta: '초보 선택됨', selected: true },
      ],
      primary: { label: '지역 선택하기', href: '/onboarding/region' },
    },
    region: {
      step,
      stepNo: 3,
      totalSteps: 3,
      title: '주 활동 지역을 선택해 주세요',
      sub: '현재 위치는 선택 사항이며, 거부해도 수동 지역 선택으로 계속할 수 있습니다.',
      backHref: '/onboarding/level',
      options: ['마포구', '강남구', '성동구', '송파구', '서초구', '용산구'].map((label, index) => ({
        label,
        selected: index < 2,
      })),
      notice: { title: '위치 권한 예외', body: '권한 거부 시 선택한 종목과 실력은 유지하고 수동 지역 선택으로 복구합니다.', tone: 'orange' },
      primary: { label: '선택 확인하기', href: '/onboarding/confirm' },
    },
    confirm: {
      step,
      stepNo: 3,
      totalSteps: 3,
      title: '준비가 끝났어요',
      sub: '선택한 종목, 실력, 지역을 기준으로 홈 추천과 필터가 시작됩니다.',
      backHref: '/onboarding/region',
      options: [],
      summary: [
        { label: '관심 종목', value: '축구 · 풋살 · 러닝 · 수영' },
        { label: '실력', value: '축구 중수 · 풋살 초보 · 러닝 입문 · 수영 초보' },
        { label: '활동 지역', value: '마포구 · 강남구' },
      ],
      notice: { title: '완료 상태', body: '홈 진입 후에도 설정에서 종목, 실력, 지역을 수정할 수 있습니다.', tone: 'green' },
      primary: { label: '홈으로 시작하기', href: '/home' },
    },
  };

  return models[step];
}
