import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

// R11(C-6): 몰수패·부전승 결과 입력. 새 컬럼·enum 값 없이(스키마 변경 금지) 기존
// 결과 확정 파이프라인(V1GameResultRevision -> 공식화)을 재사용한다 — 자세한 설계는
// league-match-forfeit.service.ts 상단 docblock 참고.
export class RecordLeagueForfeitDto {
  /** 불참(몰수)한 팀 ID — 대진의 hostTeamId 또는 approvedApplicantTeamId 중 하나여야 한다. */
  @IsUUID()
  noShowTeamId!: string;

  /** 감사 로그·결과 리비전에 남기는 처리 사유. 몰수 처리는 되돌리기 어려워 필수로 요구한다. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
