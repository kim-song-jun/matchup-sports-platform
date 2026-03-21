'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      {/* Header */}
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button onClick={() => router.back()} className="rounded-lg p-1.5 -ml-1.5 hover:bg-gray-100">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900">개인정보 처리방침</h1>
      </header>
      <div className="hidden lg:flex items-center gap-2 mb-6 text-[13px] text-gray-400">
        <button onClick={() => router.push('/settings')} className="hover:text-gray-600">설정</button>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium">개인정보 처리방침</span>
      </div>

      <div className="px-5 lg:px-0 max-w-2xl py-6 space-y-8">
        <Section title="1. 수집하는 정보">
          <p>
            MatchUp(이하 &quot;회사&quot;)은 서비스 제공을 위해 다음과 같은 개인정보를 수집합니다. 회원가입 시 필수적으로 수집하는 정보는 이메일 주소, 닉네임이며, 소셜 로그인(카카오, 네이버, Apple)을 통해 가입하는 경우 해당 플랫폼에서 제공하는 프로필 정보(이름, 이메일, 프로필 사진)가 수집됩니다.
          </p>
          <p>
            서비스 이용 과정에서 자동으로 수집되는 정보에는 기기 정보(기기 종류, OS 버전, 앱 버전), 접속 로그(접속 일시, IP 주소), 서비스 이용 기록(매치 참여 기록, 채팅 기록, 결제 기록) 등이 포함됩니다. 위치 기반 서비스 이용 시 이용자의 동의 하에 위치 정보가 수집될 수 있습니다.
          </p>
          <p>
            선택적으로 수집하는 정보에는 전화번호, 생년월일, 성별, 선호 스포츠 종목, 실력 수준, 선호 지역 등이 있습니다. 이러한 선택 정보는 이용자의 동의가 있는 경우에만 수집되며, 동의하지 않더라도 서비스 이용에 제한이 없습니다. 다만, 일부 맞춤형 서비스(AI 매칭 추천 등)의 정확도가 낮아질 수 있습니다.
          </p>
        </Section>

        <Section title="2. 이용 목적">
          <p>
            수집된 개인정보는 서비스 제공 및 운영, 이용자 식별 및 본인 확인, 서비스 개선 및 신규 서비스 개발의 목적으로 이용됩니다. 구체적으로 매치 매칭 알고리즘 개선, 이용자 간 커뮤니케이션 지원, 결제 및 환불 처리, 고객 문의 응대 등에 활용됩니다.
          </p>
          <p>
            AI 기반 매칭 서비스를 위해 이용자의 매치 참여 기록, 실력 수준, 선호도 정보가 분석에 활용됩니다. 이 과정에서 개인을 식별할 수 없는 형태로 데이터가 가공되어 사용되며, 매칭 품질 향상을 위한 통계 자료로 활용됩니다. 이용자는 AI 매칭에 자신의 데이터가 활용되는 것을 거부할 수 있습니다.
          </p>
          <p>
            마케팅 목적의 개인정보 이용은 이용자의 별도 동의가 있는 경우에만 이루어집니다. 이벤트 안내, 프로모션 정보, 맞춤형 광고 등에 활용되며, 이용자는 언제든지 마케팅 수신을 거부할 수 있습니다. 수신 거부 시 마케팅 목적의 개인정보 이용은 즉시 중단됩니다.
          </p>
        </Section>

        <Section title="3. 보관 기간">
          <p>
            이용자의 개인정보는 서비스 이용 기간 동안 보관되며, 회원 탈퇴 시 지체 없이 파기합니다. 다만, 관련 법령에 의해 일정 기간 보관이 필요한 경우 해당 기간 동안 안전하게 보관한 후 파기합니다. 전자상거래법에 따른 계약 또는 청약 철회 기록은 5년, 대금결제 및 재화 공급 기록은 5년, 소비자 불만 또는 분쟁 처리 기록은 3년간 보관합니다.
          </p>
          <p>
            통신비밀보호법에 따른 통신사실확인자료(로그인 기록)는 3개월, 접속 로그는 3개월간 보관합니다. 보관 기간이 경과한 개인정보는 재생 불가능한 방법으로 즉시 파기하며, 전자적 파일 형태의 개인정보는 복구 불가능한 기술적 방법으로 영구 삭제합니다.
          </p>
          <p>
            장기 미이용 회원(1년 이상 서비스 미이용)의 경우, 개인정보 보호법에 따라 별도 분리 보관하거나 파기할 수 있습니다. 분리 보관 또는 파기 30일 전에 이메일 또는 앱 알림을 통해 사전 통지하며, 이용자가 서비스에 재접속하는 경우 보관 기간이 갱신됩니다.
          </p>
        </Section>

        <Section title="4. 제3자 제공">
          <p>
            회사는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만, 이용자가 사전에 동의한 경우, 법률에 특별한 규정이 있는 경우에 한하여 개인정보를 제3자에게 제공합니다. 결제 서비스를 위해 토스페이먼츠에 결제 관련 최소한의 정보(주문번호, 결제 금액)가 제공됩니다.
          </p>
          <p>
            매치 참여 시 같은 매치에 참여하는 다른 이용자에게 닉네임, 프로필 사진, 실력 수준 등 서비스 이용에 필요한 최소한의 정보가 공개될 수 있습니다. 이는 서비스의 본질적인 기능 제공을 위한 것으로, 이용자는 공개되는 정보의 범위를 프로필 설정에서 조정할 수 있습니다.
          </p>
          <p>
            회사는 서비스 운영을 위해 일부 업무를 외부 업체에 위탁하고 있으며, 위탁 업체에게 제공되는 개인정보는 해당 업무 수행에 필요한 최소한으로 제한됩니다. 위탁 업체 목록과 위탁 업무 내용은 개인정보 처리방침 변경 시 공지합니다. 위탁 업체는 개인정보 보호 관련 법령에 따라 안전하게 정보를 관리할 의무가 있습니다.
          </p>
        </Section>

        <Section title="5. 이용자 권리">
          <p>
            이용자는 언제든지 자신의 개인정보에 대해 열람, 수정, 삭제, 처리 정지를 요청할 수 있습니다. 개인정보 열람 및 수정은 서비스 내 &quot;설정 &gt; 개인정보 관리&quot; 메뉴에서 직접 처리할 수 있으며, 그 외 요청은 고객센터를 통해 접수할 수 있습니다. 요청 접수 후 영업일 기준 10일 이내에 처리 결과를 안내합니다.
          </p>
          <p>
            이용자는 회원 탈퇴를 통해 개인정보의 수집 및 이용에 대한 동의를 철회할 수 있습니다. 탈퇴 요청은 서비스 내 &quot;설정 &gt; 개인정보 관리 &gt; 회원 탈퇴&quot;에서 직접 처리할 수 있으며, 탈퇴 즉시 개인정보가 파기됩니다. 다만, 법령에 의해 보관이 필요한 정보는 해당 기간 동안 보관 후 파기됩니다.
          </p>
          <p>
            이용자는 개인정보 보호와 관련하여 불만이 있는 경우 개인정보 보호위원회(국번없이 182), 한국인터넷진흥원(국번없이 118) 등에 상담 또는 구제를 신청할 수 있습니다. 회사의 개인정보 보호책임자에게 직접 문의할 수도 있으며, 연락처는 support@matchup.kr입니다.
          </p>
        </Section>

        <div className="text-center py-4 border-t border-gray-100">
          <p className="text-[13px] text-gray-400">최종 수정일: 2026년 1월 1일</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 p-5">
      <h3 className="text-[16px] font-bold text-gray-900 mb-4">{title}</h3>
      <div className="space-y-3 text-[14px] leading-relaxed text-gray-600">
        {children}
      </div>
    </div>
  );
}
