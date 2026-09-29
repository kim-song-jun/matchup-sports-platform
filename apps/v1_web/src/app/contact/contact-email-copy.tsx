'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import styles from './contact.module.css';

const TOAST_MS = 3000;

/** 거부(권한·포커스 없음)와 API 부재(http 출처)를 같은 실패로 본다 — 둘 다 선택 폴백으로 간다. */
async function writeClipboard(text: string): Promise<boolean> {
  if (!navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * 이메일 주소 + 복사 버튼. 클립보드를 못 쓰면(권한 거부·비보안 출처) 주소 글자를 선택해 두고 직접 복사하도록 알린다.
 * 복사 버튼은 JS 가 준비된 뒤에만 보인다 — JS 없이는 눌러도 아무 일이 없다.
 */
export function ContactEmailCopy({ email }: { email: string }) {
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setReady(true);
    return () => window.clearTimeout(timerRef.current);
  }, []);

  function show(message: string) {
    setToast(message);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }

  function selectAddress() {
    const link = linkRef.current;
    const selection = window.getSelection();
    if (!link || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(link);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function copy() {
    if (await writeClipboard(email)) {
      show('이메일 주소를 복사했어요.');
      return;
    }
    selectAddress();
    show('복사하지 못했어요. 주소를 선택해 두었으니 직접 복사해 주세요.');
  }

  return (
    <div className={styles.mailRow}>
      <a ref={linkRef} className={styles.mailLink} href={`mailto:${email}`}>{email}</a>
      {ready ? (
        <button type="button" className={styles.copyButton} onClick={copy}>
          <Copy size={16} aria-hidden="true" />
          주소 복사
        </button>
      ) : null}
      <p className={styles.toast} role="status" data-show={toast ? 'true' : undefined}>{toast}</p>
    </div>
  );
}
