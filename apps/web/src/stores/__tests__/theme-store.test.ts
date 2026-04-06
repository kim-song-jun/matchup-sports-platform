import { describe, it, expect, beforeEach, vi } from 'vitest';

// jsdom does not implement matchMedia — provide a minimal stub BEFORE any import
// that triggers theme-store module evaluation.
const matchMediaMock = vi.fn((query: string) => ({
  matches: query === '(prefers-color-scheme: dark)' ? false : false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

vi.stubGlobal('matchMedia', matchMediaMock);

// Now safe to import theme-store
const { useThemeStore } = await import('../theme-store');

describe('ThemeStore', () => {
  beforeEach(() => {
    // Reset store to light/default before each test
    useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' });
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('starts with light theme by default', () => {
    const { theme, resolvedTheme } = useThemeStore.getState();
    expect(theme).toBe('light');
    expect(resolvedTheme).toBe('light');
  });

  it('setTheme to dark updates theme and resolvedTheme', () => {
    useThemeStore.getState().setTheme('dark');
    const { theme, resolvedTheme } = useThemeStore.getState();
    expect(theme).toBe('dark');
    expect(resolvedTheme).toBe('dark');
  });

  it('setTheme to light updates theme and resolvedTheme', () => {
    useThemeStore.getState().setTheme('dark');
    useThemeStore.getState().setTheme('light');
    const { theme, resolvedTheme } = useThemeStore.getState();
    expect(theme).toBe('light');
    expect(resolvedTheme).toBe('light');
  });

  it('setTheme to system resolves via matchMedia', () => {
    // matchMedia stub returns matches: false → resolves to light
    useThemeStore.getState().setTheme('system');
    const { theme, resolvedTheme } = useThemeStore.getState();
    expect(theme).toBe('system');
    expect(resolvedTheme).toBe('light');
  });

  it('setTheme persists to localStorage', () => {
    useThemeStore.getState().setTheme('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('setTheme to dark adds dark class to documentElement', () => {
    useThemeStore.getState().setTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('setTheme to light removes dark class from documentElement', () => {
    document.documentElement.classList.add('dark');
    useThemeStore.getState().setTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
