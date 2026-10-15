'use client';

import { createContext, useContext, useEffect, type MutableRefObject } from 'react';

export type RosterEditor = {
  dirty: boolean;
  busy: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
};
export const RosterManagerNavigation = createContext<{
  editor: MutableRefObject<RosterEditor | null>;
  showPlayers: () => void;
} | null>(null);

/** 탭과 경기 선택이 같은 저장·이탈 절차를 거친다. 기존 딥링크는 계속 사용할 수 있다. */
export function useRosterEditorNavigation(editor: RosterEditor) {
  const navigation = useContext(RosterManagerNavigation);
  useEffect(() => {
    if (navigation) navigation.editor.current = editor;
  });
  useEffect(() => () => {
    if (navigation) navigation.editor.current = null;
  }, [navigation]);
  return navigation;
}
