'use client';

import { useEffect, useState, useCallback } from 'react';
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

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!visible) return null;

  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  }[size];

  return (
    <div className="fixed inset-0 z-[90] flex items-end lg:items-center justify-center">
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${exiting ? 'animate-fade-out' : 'animate-fade-in'}`} onClick={handleClose} />
      <div className={`relative w-full ${sizeClass} bg-white rounded-t-2xl lg:rounded-2xl p-6 ${exiting ? 'animate-slide-up-out lg:animate-scale-out' : 'animate-slide-up lg:animate-scale-in'}`}>
        {title && (
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[18px] font-bold text-gray-900">{title}</h2>
            <button onClick={handleClose} aria-label="닫기" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 active:bg-gray-200 transition-colors">
              <X size={20} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
