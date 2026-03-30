'use client';

import { useEffect, useState, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      setExiting(false);
      document.body.style.overflow = 'hidden';
    } else if (visible) {
      setExiting(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setExiting(false);
      }, 200);
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, visible]);

  // Focus trap + Escape key
  useEffect(() => {
    if (!visible || exiting) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Auto-focus first focusable element
    setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }, 50);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, exiting, onClose]);

  if (!visible) return null;

  const sizeClass = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size];

  return (
    <div className="fixed inset-0 z-[90] flex items-end lg:items-center justify-center" role="dialog" aria-modal="true" aria-label={title || '대화상자'}>
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${exiting ? 'animate-fade-out' : 'animate-fade-in'}`} onClick={onClose} />
      <div ref={panelRef} className={`relative w-full ${sizeClass} mx-4 lg:mx-auto bg-white dark:bg-gray-800 rounded-t-2xl lg:rounded-2xl p-6 ${exiting ? 'animate-slide-up-out lg:animate-scale-out' : 'animate-slide-up lg:animate-scale-in'}`}>
        {title ? (
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
            <button onClick={onClose} aria-label="닫기" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
              <X size={20} />
            </button>
          </div>
        ) : (
          <button onClick={onClose} aria-label="닫기" className="absolute top-3 right-3 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
