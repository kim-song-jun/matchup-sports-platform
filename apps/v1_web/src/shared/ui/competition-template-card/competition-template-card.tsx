'use client';

import Link from 'next/link';
import { useId, type MouseEventHandler, type ReactNode } from 'react';

export type CompetitionTemplateGraphic = 'groups' | 'knockout' | 'knockout-4' | 'knockout-8' | 'knockout-12' | 'knockout-16' | 'league' | 'league-single' | 'league-double';

type CardContentProps = {
  graphic: CompetitionTemplateGraphic;
  title: string;
  description: string;
  meta?: string;
  recommended?: boolean;
  children?: ReactNode;
};

type RadioCardProps = CardContentProps & {
  mode: 'radio';
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
};

type LinkCardProps = CardContentProps & {
  mode: 'link';
  href: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  linkLabel?: string;
};

export type CompetitionTemplateCardProps = RadioCardProps | LinkCardProps;

export function CompetitionTemplateGraphicView({ type }: { type: CompetitionTemplateGraphic }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (type === 'groups') {
    return (
      <svg viewBox="0 0 240 76" className="h-[76px] w-full text-[var(--text-muted)]" aria-hidden="true">
        <g {...common}>
          <rect x="4" y="8" width="66" height="24" rx="7" /><rect x="4" y="44" width="66" height="24" rx="7" />
          <path d="M70 20h28M70 56h28M98 20v36M98 38h22" />
          <rect x="120" y="24" width="56" height="28" rx="7" className="fill-[var(--blue50)] stroke-[var(--blue500)]" />
          <path d="M176 38h22" className="stroke-[var(--blue500)]" />
          <rect x="198" y="24" width="38" height="28" rx="7" />
        </g>
        <g className="fill-[var(--text-strong)]" fontSize="8" fontWeight="600" textAnchor="middle">
          <text x="37" y="23">A조</text><text x="37" y="59">B조</text><text x="148" y="41">순위</text><text x="217" y="41">결선</text>
        </g>
      </svg>
    );
  }
  if (type.startsWith('knockout')) {
    const knockoutSize = type === 'knockout' ? null : Number(type.slice('knockout-'.length));
    if (knockoutSize === 12) {
      return (
        <svg viewBox="0 0 240 76" className="h-[76px] w-full text-[var(--text-muted)]" aria-hidden="true">
          <g {...common}>
            <rect x="4" y="6" width="82" height="25" rx="6" className="fill-[var(--blue50)] stroke-[var(--blue500)]" />
            <rect x="4" y="45" width="82" height="25" rx="6" />
            <path d="M86 18h24v19h14M86 57h24V37M166 37h8M208 37h4" className="stroke-[var(--blue500)]" />
            <rect x="124" y="25" width="42" height="24" rx="6" className="fill-[var(--blue50)] stroke-[var(--blue500)]" />
            <rect x="174" y="25" width="34" height="24" rx="6" />
            <rect x="212" y="25" width="24" height="24" rx="6" />
          </g>
          <g className="fill-[var(--text-strong)]" fontSize="7" fontWeight="600" textAnchor="middle">
            <text x="45" y="17">12강 · 4경기</text><text x="45" y="57">부전승 4팀</text><text x="145" y="39">8강</text><text x="191" y="39">4강</text><text x="224" y="39" fontSize="6">결승</text>
          </g>
        </svg>
      );
    }
    if (knockoutSize !== null) {
      const rounds = knockoutSize === 4
        ? ['준결승', '결승']
        : knockoutSize === 8
          ? ['8강', '4강', '결승']
          : ['16강', '8강', '4강', '결승'];
      const stageWidth = rounds.length === 4 ? 43 : 54;
      const gap = rounds.length === 2 ? 64 : 22;
      const totalWidth = rounds.length * stageWidth + (rounds.length - 1) * gap;
      const startX = (240 - totalWidth) / 2;
      return (
        <svg viewBox="0 0 240 76" className="h-[76px] w-full text-[var(--text-muted)]" aria-hidden="true">
          <g {...common}>
            {rounds.map((round, index) => {
              const x = startX + index * (stageWidth + gap);
              return <g key={round}>
                <rect x={x} y="25" width={stageWidth} height="26" rx="6" className={index === 0 ? 'fill-[var(--blue50)] stroke-[var(--blue500)]' : ''} />
                {index < rounds.length - 1 ? <path d={`M${x + stageWidth} 38h${gap}`} /> : null}
                <text x={x + stageWidth / 2} y="41" className="fill-[var(--text-strong)]" stroke="none" fontSize="7" fontWeight="600" textAnchor="middle">{round}</text>
              </g>;
            })}
          </g>
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 240 76" className="h-[76px] w-full text-[var(--text-muted)]" aria-hidden="true">
        <g {...common}>
          <rect x="4" y="6" width="70" height="22" rx="5" /><rect x="4" y="48" width="70" height="22" rx="5" />
          <path d="M74 17h38v21h20" /><path d="M74 59h38V38" />
          <rect x="132" y="27" width="48" height="22" rx="6" className="fill-[var(--blue50)] stroke-[var(--blue500)]" />
          <path d="M180 38h16" className="stroke-[var(--blue500)]" /><rect x="196" y="27" width="40" height="22" rx="6" />
        </g>
        <g className="fill-[var(--text-strong)]" fontSize="8" fontWeight="600" textAnchor="middle"><text x="39" y="20">라운드 1</text><text x="39" y="62">라운드 1</text><text x="156" y="41">승자</text><text x="216" y="41">결승</text></g>
      </svg>
    );
  }
  if (type === 'league') {
    return (
      <svg viewBox="0 0 240 76" className="h-[76px] w-full text-[var(--text-muted)]" aria-hidden="true">
        <g {...common}>
          <circle cx="28" cy="20" r="10" /><circle cx="28" cy="56" r="10" /><circle cx="88" cy="20" r="10" /><circle cx="88" cy="56" r="10" />
          <path d="M38 20 78 56M38 56 78 20M28 30v16M88 30v16" />
          <path d="M110 38h20" className="stroke-[var(--blue500)]" />
          <rect x="130" y="17" width="106" height="42" rx="7" className="fill-[var(--blue50)] stroke-[var(--blue500)]" />
          <path d="M143 29h80M143 38h80M143 47h80" />
        </g>
        <g className="fill-[var(--text-strong)]" fontSize="8" fontWeight="600" textAnchor="middle">
          <text x="28" y="23" stroke="none">A</text><text x="28" y="59" stroke="none">B</text><text x="88" y="23" stroke="none">C</text><text x="88" y="59" stroke="none">D</text>
          <text x="183" y="14" stroke="none">리그 순위</text>
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 240 76" className="h-[76px] w-full text-[var(--text-muted)]" aria-hidden="true">
      <g {...common}>
        <circle cx="28" cy="20" r="10" /><circle cx="28" cy="56" r="10" /><circle cx="88" cy="20" r="10" /><circle cx="88" cy="56" r="10" />
        {type === 'league-single' ? <path d="M38 20 78 56M38 56 78 20M28 30v16M88 30v16" /> : <><path d="M38 20 78 56M38 56 78 20" /><path d="M78 14 40 14M40 62 78 62" className="stroke-[var(--blue500)]" /></>}
        <path d="M110 38h24" className="stroke-[var(--blue500)]" /><rect x="134" y="25" width="102" height="26" rx="7" className="fill-[var(--blue50)] stroke-[var(--blue500)]" />
      </g>
      <g className="fill-[var(--text-strong)]" fontSize="8" fontWeight="600" textAnchor="middle">
        <text x="28" y="23">A</text><text x="28" y="59">B</text><text x="88" y="23">C</text><text x="88" y="59">D</text>
        <text x="185" y="41">{type === 'league-single' ? '서로 1회' : '홈·어웨이'}</text>
      </g>
    </svg>
  );
}

function CardBody({ graphic, title, description, meta, recommended, children, titleId, descriptionId }: CardContentProps & { titleId: string; descriptionId: string }) {
  return (
    <>
      <CompetitionTemplateGraphicView type={graphic} />
      <span id={titleId} className="block tm-text-card-title">
        {title}{recommended ? <span className="ml-2 rounded-full bg-[var(--blue50)] px-2 py-1 text-[length:var(--font-size-caption)] font-semibold text-[var(--blue700)]">추천</span> : null}
      </span>
      <span id={descriptionId} className="block text-[length:var(--font-size-caption)] leading-5 text-[var(--text-muted)]">{description}</span>
      {meta ? <span className="block text-[length:var(--font-size-caption)] font-semibold text-[var(--text-body)]">{meta}</span> : null}
      {children}
    </>
  );
}

export function CompetitionTemplateCard(props: CompetitionTemplateCardProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const cardClass = 'flex min-h-[196px] flex-col items-stretch gap-2 rounded-[var(--radius-container)] border bg-[var(--card-surface)] p-4 text-left transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--blue500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue500)]';
  if (props.mode === 'link') {
    return (
      <Link href={props.href} onClick={props.onClick} aria-labelledby={titleId} aria-describedby={descriptionId}
        className={`${cardClass} border-[var(--border)] hover:border-[var(--border-strong)]`}>
        <CardBody {...props} titleId={titleId} descriptionId={descriptionId} />
        <span className="mt-auto inline-flex min-h-[44px] items-center font-semibold text-[var(--blue600)]">{props.linkLabel ?? '별도 화면에서 만들기'} →</span>
      </Link>
    );
  }
  return (
    <label className={`${cardClass} cursor-pointer ${props.checked ? 'border-[var(--blue500)] bg-[var(--blue50)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'} ${props.disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
      <input type="radio" name={props.name} value={props.value} checked={props.checked} disabled={props.disabled}
        aria-labelledby={titleId} aria-describedby={descriptionId} onChange={() => props.onChange(props.value)}
        className="sr-only" />
      <CardBody {...props} titleId={titleId} descriptionId={descriptionId} />
    </label>
  );
}
