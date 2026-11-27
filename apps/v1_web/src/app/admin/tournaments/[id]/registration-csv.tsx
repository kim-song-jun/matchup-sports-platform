'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { useV1ExportRosterCsv, useV1ExportTournamentRosterCsv } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { ShowToast } from './registrations-model';

/** 명단 CSV 한 번 내려받기 — 팀별(⋯ 메뉴)과 전체(확정 팀 머리)가 같은 저장 경로를 쓴다. */
export function runCsvExport(
  exportCsv: ReturnType<typeof useV1ExportRosterCsv>,
  fallbackFilename: string,
  showToast: ShowToast,
): void {
  exportCsv.mutate(undefined, {
    onSuccess: (res) => {
      // BOM 이 없으면 Windows 엑셀이 UTF-8 을 CP949 로 읽어 한글(팀명·실명)이 깨진다.
      const blob = new Blob(['﻿', res.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename || fallbackFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('CSV를 다운로드했어요.', 'success');
    },
    onError: (err) => showToast(extractErrorMessage(err, 'CSV 다운로드에 실패했어요.'), 'error'),
  });
}

/** 대회(리그) 전체 명단 — 팀별 CSV 를 팀 수만큼 누르지 않게. 임시저장·취소 신청은 서버가 뺀다. */
export function ExportAllCsvButton({ tournamentId, showToast }: { tournamentId: string; showToast: ShowToast }) {
  const exportCsv = useV1ExportTournamentRosterCsv(tournamentId);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={exportCsv.isPending}
      onClick={() => runCsvExport(exportCsv, `roster_${tournamentId}_all.csv`, showToast)}
    >
      <Download size={16} aria-hidden="true" />
      {exportCsv.isPending ? '…' : '전체 명단 CSV'}
    </Button>
  );
}
