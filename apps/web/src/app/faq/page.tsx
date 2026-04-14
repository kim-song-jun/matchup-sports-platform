import { Mail, MessageCircle } from 'lucide-react';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingFooter } from '@/components/landing/landing-footer';
import { FaqContent } from './faq-content';

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 overflow-x-hidden">

      {/* ── Nav ── */}
      <LandingNav />

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-12 sm:pt-40 sm:pb-16">
        <div className="max-w-[1100px] mx-auto px-5">
          <div className="max-w-[680px] mx-auto text-center">
            <ScrollReveal delay={0}>
              <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-semibold px-4 py-2 rounded-full mb-6">
                <MessageCircle size={14} />
                도움이 필요하신가요?
              </div>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <h1 className="text-3xl sm:text-5xl lg:text-5xl font-black text-gray-900 dark:text-white leading-[1.15] tracking-tight mb-5">
                자주 묻는 질문
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <p className="text-lg lg:text-xl text-gray-500 dark:text-gray-400 leading-relaxed max-w-[440px] mx-auto">
                MatchUp 이용에 대해 궁금한 점을{' '}
                <br className="hidden sm:block" />
                빠르게 확인해보세요.
              </p>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── Interactive FAQ (category filter + accordion) ── */}
      <FaqContent />

      {/* ── Contact CTA ── */}
      <section className="py-16 sm:py-20">
        <div className="max-w-[600px] mx-auto px-5">
          <ScrollReveal>
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-8 sm:p-10 text-center border border-gray-100 dark:border-gray-700">
              <div className="h-14 w-14 rounded-2xl bg-blue-500 flex items-center justify-center mx-auto mb-5">
                <Mail size={24} className="text-white" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight leading-tight">
                더 궁금한 점이 있나요?
              </h2>
              <p className="text-base sm:text-md text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
                FAQ에서 답을 찾지 못하셨다면
                <br />
                언제든 문의해주세요. 빠르게 답변드릴게요.
              </p>
              <a
                href="mailto:support@teammeet.kr"
                className="inline-flex items-center justify-center gap-2.5 bg-blue-500 text-white font-bold px-7 py-3.5 rounded-xl text-md hover:bg-blue-600 active:scale-[0.97] transition-[colors,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
              >
                <Mail size={16} />
                이메일 문의하기
              </a>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
                support@teammeet.kr
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <LandingFooter />
    </div>
  );
}
