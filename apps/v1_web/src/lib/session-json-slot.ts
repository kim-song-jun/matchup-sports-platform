/**
 * 탭 하나에만 남는 JSON 값 한 칸(sessionStorage). 화면 사이로 토큰을 넘기되 주소(URL)에 싣지 않으려고 쓴다.
 * 읽을 때 `parse` 가 null 을 주면(깨졌거나 모양이 다르면) 그 값은 지우고 없는 것으로 다룬다.
 */
export interface SessionJsonSlot<T> {
  /** 쓰지 못했으면 false — 그때 이전 값도 지워서, 저장하려던 값 대신 옛 값이 읽히는 일이 없다. */
  save(value: T): boolean;
  /** 읽기만 한다. 알아볼 수 없는 값도 지우지 않고 null 로 본다 — 여러 화면이 같은 칸을 보아도 서로의 읽기에 영향받지 않는다. */
  peek(): T | null;
  /** `peek` 와 같되, 알아볼 수 없는 값은 그 자리에서 지운다. */
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

  const load = (): { value: T | null; invalid: boolean } => {
    if (typeof window === 'undefined') return { value: null, invalid: false };
    let raw: string | null;
    try {
      raw = window.sessionStorage.getItem(key);
    } catch {
      return { value: null, invalid: false };
    }
    if (raw === null) return { value: null, invalid: false };
    const parsed = parseJson(raw);
    const value = parsed === undefined ? null : parse(parsed);
    return { value, invalid: value === null };
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
    peek() {
      return load().value;
    },
    read() {
      const loaded = load();
      if (loaded.invalid) clear();
      return loaded.value;
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
