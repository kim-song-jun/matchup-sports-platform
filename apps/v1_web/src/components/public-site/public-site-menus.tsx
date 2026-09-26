'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import {
  PUBLIC_NAV_ABOUT,
  PUBLIC_NAV_AUDIENCE_LABEL,
  PUBLIC_NAV_AUDIENCES,
  PUBLIC_NAV_CONTACT,
  PUBLIC_NAV_HELP,
  isCurrentNav,
} from './public-site-nav';

/**
 * 비모달 디스클로저: ESC 는 닫고 버튼으로 포커스를 돌려준다. 바깥 클릭·포커스가 밖으로 나가면
 * 조용히 닫는다(포커스를 빼앗지 않는다). 포커스 트랩은 두지 않는다 — 모달이 아니다.
 */
function useDisclosure() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      close(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, close]);

  // relatedTarget 이 null 이면(패널 안 초점 불가 영역 클릭·창 이탈) 닫지 않는다 — 바깥 클릭은
  // pointerdown 이, ESC 는 keydown 이 맡는다. 초점이 실제로 밖의 요소로 옮겨 갈 때만 닫는다.
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (open && next instanceof Node && !event.currentTarget.contains(next)) setOpen(false);
  };

  return { open, setOpen, close, rootRef, buttonRef, onBlur };
}

function NavLink({ href, label, currentPath, onNavigate }: {
  href: string;
  label: string;
  currentPath?: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      className="tm-ps-menu-link"
      href={href}
      aria-current={isCurrentNav(href, currentPath) ? 'page' : undefined}
      onClick={onNavigate}
    >
      {label}
    </Link>
  );
}

/** 1024+ 헤더의 "이용 대상" 드롭다운. */
export function PublicSiteAudienceMenu({ currentPath }: { currentPath?: string }) {
  const { open, setOpen, close, rootRef, buttonRef, onBlur } = useDisclosure();
  const panelId = useId();
  const active = PUBLIC_NAV_AUDIENCES.some((link) => isCurrentNav(link.href, currentPath));

  return (
    <div className="tm-ps-dropdown" ref={rootRef} onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        className="tm-ps-nav-link tm-ps-dropdown-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        data-current={active ? 'true' : undefined}
        onClick={() => setOpen(!open)}
      >
        {PUBLIC_NAV_AUDIENCE_LABEL}
        <ChevronDown className="tm-ps-dropdown-chevron" size={16} aria-hidden="true" />
      </button>
      <ul id={panelId} className="tm-ps-dropdown-panel" hidden={!open}>
        {PUBLIC_NAV_AUDIENCES.map((link) => (
          <li key={link.href}>
            <NavLink {...link} currentPath={currentPath} onNavigate={() => close(false)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 1024 미만 전체 메뉴. 열면 첫 링크로 포커스를 옮기고, ESC·닫기 버튼은 메뉴 버튼으로 되돌린다. */
export function PublicSiteMobileMenu({ currentPath }: { currentPath?: string }) {
  const { open, setOpen, close, rootRef, buttonRef, onBlur } = useDisclosure();
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('a[href]')?.focus();
  }, [open]);

  const navigate = () => close(false);

  return (
    <div className="tm-ps-mobile-menu" ref={rootRef} onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        className="tm-landing-icon-btn tm-ps-menu-button"
        aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close(true) : setOpen(true))}
      >
        {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>
      <div id={panelId} ref={panelRef} className="tm-ps-mobile-panel" hidden={!open}>
        <nav aria-label="전체 메뉴">
          <ul className="tm-ps-menu-list">
            <li><NavLink {...PUBLIC_NAV_ABOUT} currentPath={currentPath} onNavigate={navigate} /></li>
            <li>
              <p className="tm-ps-menu-group-label" id={`${panelId}-audience`}>{PUBLIC_NAV_AUDIENCE_LABEL}</p>
              <ul className="tm-ps-menu-sublist" aria-labelledby={`${panelId}-audience`}>
                {PUBLIC_NAV_AUDIENCES.map((link) => (
                  <li key={link.href}>
                    <NavLink {...link} currentPath={currentPath} onNavigate={navigate} />
                  </li>
                ))}
              </ul>
            </li>
            <li><NavLink {...PUBLIC_NAV_HELP} currentPath={currentPath} onNavigate={navigate} /></li>
            <li><NavLink {...PUBLIC_NAV_CONTACT} currentPath={currentPath} onNavigate={navigate} /></li>
            <li className="tm-ps-menu-login">
              <NavLink href="/login" label="로그인" onNavigate={navigate} />
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
