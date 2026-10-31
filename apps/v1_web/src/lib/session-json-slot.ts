/**
 * 탭 하나에만 남는 JSON 값 한 칸(sessionStorage). 화면 사이로 토큰을 넘기되 주소(URL)에 싣지 않으려고 쓴다.
 * 읽을 때 `parse` 가 null 을 주면(깨졌거나 모양이 다르면) 그 값은 지우고 없는 것으로 다룬다.
 */
export interface SessionJsonSlot<T> {
  /** 쓰지 못했으면 false — 그때 이전 값도 지워서, 저장하려던 값 대신 옛 값이 읽히는 일이 없다. */
  save(value: T): boolean;
  read(): T | null;
  /** 지웠으면 true. 스토리지가 막혀 있으면 값을 쓸 수도 없었으므로 false 여도 남은 값은 없다. */
  clear(): boolean;
}

export function createSessionJsonSlot<T>(key: string, parse: (value: unknown) => T | null): SessionJsonSlot<T> {
  const clear = () => {
    if (typeof window === 'undefined') return false;
    try {
      window.sessionStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  };

  return {
    save(value) {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        clear();
        return false;
      }
    },
    read() {
      if (typeof window === 'undefined') return null;
      let raw: string | null;
      try {
        raw = window.sessionStorage.getItem(key);
      } catch {
        return null;
      }
      if (raw === null) return null;
      const parsed = parseJson(raw);
      const value = parsed === undefined ? null : parse(parsed);
      if (value === null) clear();
      return value;
    },
    clear,
  };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
