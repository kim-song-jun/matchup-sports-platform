import type { AuthExceptionKind, AuthExceptionViewModel, EmailLoginViewModel, LoginViewModel, OnboardingStep, OnboardingViewModel, SignupCompleteViewModel, SignupFormViewModel, TermsViewModel } from './auth.types';

export function getLoginViewModel(): LoginViewModel {
  const kakaoHref = buildKakaoAuthUrl();

  return {
    heroTitle: '같이 뛸 사람을\n한 번에 찾아요',
    heroSub: 'teameet에 오신 걸 환영해요',
    emailHref: '/login/email',
    guestHref: '/home',
    signupHref: '/terms',
    providers: [
      { label: '카카오', background: '#FEE500', color: 'var(--static-black)', ...(kakaoHref ? { href: kakaoHref } : {}), disabled: !kakaoHref },
      { label: '네이버', background: 'var(--green500)', color: 'var(--static-white)', disabled: true },
      { label: 'Apple', background: 'var(--static-black)', color: 'var(--static-white)', disabled: true },
    ],
  };
}

function buildKakaoAuthUrl() {
  const clientId = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI;
  if (!clientId || !redirectUri) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
  });

  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
}

export function getEmailLoginViewModel(): EmailLoginViewModel {
  return {
    backHref: '/login',
    title: '이메일로\n로그인하세요',
    sub: '',
    fields: [
      { label: '이메일', placeholder: 'you@example.com', type: 'email' },
      { label: '비밀번호', placeholder: '비밀번호', type: 'password' },
    ],
    primary: { label: '로그인', tone: 'primary' },
    forgot: { label: '비밀번호 찾기', href: '/auth/password-reset', tone: 'neutral' },
    signupHref: '/terms',
    notice: undefined,
  };
}

export function getAuthExceptionViewModel(kind: AuthExceptionKind): AuthExceptionViewModel {
  const models: Record<AuthExceptionKind, AuthExceptionViewModel> = {
    'provider-denied': {
      backHref: '/login',
      badge: '소셜 권한 거부',
      title: '로그인을 완료하지 못했어요',
      body: '필수 정보 제공 동의가 취소됐어요. 계정은 만들어지지 않았으니 같은 방법 또는 다른 로그인으로 다시 시도해 보세요.',
      tone: 'orange',
      primary: { label: '다시 로그인하기', href: '/login' },
      secondary: { label: '다른 방법 선택', href: '/login', tone: 'neutral' },
    },
    'missing-email': {
      backHref: '/login',
      badge: '이메일 누락',
      title: '확인 가능한 이메일이 필요해요',
      body: '소셜 계정에서 이메일을 받을 수 없었어요. 이메일을 직접 입력하고 인증한 뒤 가입을 계속할 수 있어요.',
      tone: 'orange',
      primary: { label: '이메일 직접 인증', href: '/login/email' },
      secondary: { label: '소셜 계정 바꾸기', href: '/login', tone: 'neutral' },
    },
    blocked: {
      backHref: '/login',
      badge: '계정 제한',
      title: '현재 계정은 이용할 수 없어요',
      body: '현재 계정은 이용이 제한된 상태예요. 문의가 필요하시면 고객센터를 통해 확인해 주세요.',
      tone: 'red',
      primary: { label: '고객센터 문의', disabled: true, tone: 'danger' },
      secondary: { label: '로그인으로 돌아가기', href: '/login', tone: 'neutral' },
    },
    'account-conflict': {
      backHref: '/login',
      badge: '계정 충돌',
      title: '이미 가입된 정보가 있어요',
      body: '같은 이메일 또는 휴대폰 번호가 다른 로그인 방법과 연결되어 있어요. 기존 계정으로 먼저 로그인해 주세요.',
      tone: 'orange',
      primary: { label: '기존 계정 확인', href: '/login/email' },
      secondary: { label: '다른 방법 선택', href: '/login', tone: 'neutral' },
    },
    'location-denied': {
      backHref: '/onboarding/region',
      badge: '위치 권한',
      title: '현재 위치를 사용할 수 없어요',
      body: '위치 권한을 거부해도 종목과 실력은 그대로 유지돼요. 지역을 직접 선택해서 계속할 수 있어요.',
      tone: 'orange',
      primary: { label: '수동으로 지역 선택', href: '/onboarding/region' },
      secondary: { label: '설정에서 권한 열기', disabled: true, tone: 'neutral' },
    },
    'password-reset': {
      backHref: '/login/email',
      badge: '비밀번호 찾기',
      title: '이메일 로그인으로 다시 시도해 주세요',
      body: '비밀번호를 잊었다면 이메일 가입 정보를 확인한 뒤 다시 로그인해 주세요. 계정 접근이 어려우면 새 이메일 계정으로 가입할 수 있습니다.',
      tone: 'orange',
      primary: { label: '이메일 로그인으로 돌아가기', href: '/login/email' },
      secondary: { label: '간편 로그인으로 이동', href: '/login', tone: 'neutral' },
    },
  };

  return models[kind];
}

export function getTermsViewModel(): TermsViewModel {
  return {
    backHref: '/login',
    title: '가입 전에 약관을 먼저 확인해 주세요',
    sub: '필수 약관에 모두 동의해야 다음 단계로 넘어갈 수 있어요.',
    agreements: [
      {
        title: '서비스 이용약관',
        meta: '필수',
        required: true,
        checked: true,
        detail: 'Teameet의 매치, 팀매치, 팀 탐색, 채팅, 알림 기능을 이용하기 위한 기본 약관이에요. 부정 이용, 허위 신청, 운영 정책 위반 시 이용이 제한될 수 있어요.',
      },
      {
        title: '개인정보 처리방침',
        meta: '필수',
        required: true,
        checked: true,
        detail: '회원 식별, 로그인, 매치 신청, 알림 발송 등 서비스 운영을 위해 이메일, 프로필, 활동 기록 등 필요한 개인정보를 처리해요.',
      },
      {
        title: '위치 기반 서비스',
        meta: '선택 · 주변 매치 추천에 사용',
        required: false,
        checked: false,
        locationBased: true,
        detail: '동의하면 가까운 매치와 팀 추천에 위치 정보를 활용해요. 위치 권한을 거부해도 지역을 직접 선택해서 계속 이용할 수 있어요.',
      },
    ],
    primary: { label: '동의하고 회원가입하기', href: '/signup' },
  };
}

export function getSignupFormViewModel(): SignupFormViewModel {
  return {
    backHref: '/terms',
    title: '계정을 만들고\n운동 설정을 이어가요',
    sub: '가입 후 종목, 실력, 지역을 설정하면 딱 맞는 매치를 추천받을 수 있어요.',
    fields: [
      { label: '닉네임', placeholder: '사용할 닉네임', type: 'text', helper: '2자 이상 입력해 주세요.', action: { label: '중복체크', disabled: true, tone: 'neutral' } },
      { label: '이메일', placeholder: 'you@example.com', type: 'email' },
      { label: '비밀번호', placeholder: '8자 이상', type: 'password' },
      { label: '비밀번호 확인', placeholder: '비밀번호 다시 입력', type: 'password', helper: '비밀번호가 일치하지 않으면 가입 버튼이 비활성화돼요.' },
    ],
    notice: {
      title: '안내',
      body: '가입이 완료되면 바로 종목 설정 화면으로 이동해요. 닉네임 중복이나 비밀번호 불일치는 이 화면에서 수정할 수 있어요.',
    },
    primary: { label: '회원가입하고 계속', tone: 'primary' },
  };
}

export function getSignupCompleteViewModel(): SignupCompleteViewModel {
  return {
    title: '회원가입이 완료됐어요',
    sub: '이제 운동 설정을 하면 더 정확한 매치 추천을 받을 수 있어요.',
    steps: [
      { title: '약관 동의 완료', body: '필수 약관 동의가 저장됐어요.', done: true },
      { title: '회원가입 완료', body: '계정 만들기가 완료됐어요. 뒤로 가도 계정은 유지돼요.', done: true },
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
