'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { onlyDigits, formatWithComma } from '@/lib/number-format';
import { parsePrizeRows } from '@/lib/prize-breakdown';
import { useV1AdminTournament, useV1LineupSizeOptions, useV1MasterSports, useV1UpdateTournament, useV1UploadImages } from '@/hooks/use-v1-api';
import type { V1Tournament, V1UpdateTournamentPayload, V1TournamentGenderCategory } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { CoverImageUploader } from '@/components/admin/tournaments/cover-image-uploader';
import { resolveTournamentImage } from '@/lib/tournament-promo';
import { PrizeBreakdownEditor, createPrizeRowId, serializeTournamentPrizeRows, type TournamentPrizeRow } from '@/components/admin/tournaments/prize-breakdown-editor';
import { PromoCardFields, type TournamentPromoCardValue } from '@/components/admin/tournaments/promo-card-fields';
import { TournamentDatetimeField } from '@/components/admin/tournaments/tournament-datetime-field';
import { useTournamentAdmin } from './tournament-admin-context';
import { TOURNAMENT_STATUS_LABEL, formatDate, formatDateRange } from './tournament-admin-shared';
import {
  SimpleModal,
  datetimeLocalValueToIso,
  formatCurrency,
  inputCls,
  isoToDatetimeLocalValue,
  submitBtnCls,
  substitutionPolicyLabel,
  textareaCls,
} from './tournament-detail-shared';


// ── Main detail client ────────────────────────────────────────────────────

/**
 * 잠금 안내 끝에 붙는 해결 경로. 이 잠금은 영구 불가가 아니라 **이 폼에서만** 막히는
 * 것이다 — 소급 영향을 확인하는 전용 경로(대회 설정 변경)로는 바꿀 수 있다. 서버가 409
 * 로 돌려주는 문구(`tournaments-admin.service.ts` 의 LINEUP_LOCK_ESCAPE_HINT)와 같은
 * 말을 써서, 폼에서 미리 읽든 저장하다 막히든 같은 안내를 보게 한다.
 *
 * 이 안내가 없으면 운영자는 영구 불가로 읽고 엉뚱한 우회를 시도한다 — alpha 실측에서
 * 경기 결과를 void 해도 잠금이 풀리지 않는 것을 확인했다.
 */
const LINEUP_LOCK_ESCAPE_HINT = '꼭 바꿔야 하면 대회 설정 변경에서 소급 영향을 확인한 뒤 진행할 수 있어요.';

export function TournamentInfoSection() {
  const { tournamentId: id, canWrite, showToast } = useTournamentAdmin();
  const { data: tournament } = useV1AdminTournament(id);
  const updateTournament = useV1UpdateTournament(id);
  const { data: masterSports } = useV1MasterSports();
  const uploadImages = useV1UploadImages();

  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSportId, setEditSportId] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [editScheduledEndAt, setEditScheduledEndAt] = useState('');
  const [editDeadlineAt, setEditDeadlineAt] = useState('');
  const [editRosterDeadlineAt, setEditRosterDeadlineAt] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editParkingInfo, setEditParkingInfo] = useState('');
  const [editEntryFee, setEditEntryFee] = useState('');
  const [editTeamCount, setEditTeamCount] = useState('');
  const [editMinPlayers, setEditMinPlayers] = useState('');
  const [editMaxPlayers, setEditMaxPlayers] = useState('');
  /** "출전 인원"(라인업 상한) — 위 editMinPlayers/editMaxPlayers(등록 명단 크기)와 다른 값.
   * 빈 문자열이면 변경하지 않는다는 뜻(payload에서 제외). */
  const [editLineupMaxPlayers, setEditLineupMaxPlayers] = useState('');
  /** "교체 방식/횟수" — 위 editLineupMaxPlayers와 같은 V1CompetitionConfigVersion.lineup에
   * 함께 pin되지만 다른 관심사다. 빈 문자열이면 변경하지 않는다는 뜻(payload에서 제외). */
  const [editSubstitutionMode, setEditSubstitutionMode] = useState<'' | 'limited' | 'rolling'>('');
  const [editMaxSubstitutions, setEditMaxSubstitutions] = useState('');
  // "출전 인원" 선택지 — 종목 변경과 동시에는 못 바꾸므로(서버가
  // TOURNAMENT_LINEUP_SIZE_SPORT_CHANGE_CONFLICT로 막음) 편집 폼에서 종목이 바뀌지
  // 않았을 때만(editSportId가 비었거나 tournament.sportId와 같을 때) 조회한다.
  const lineupSizeSportId =
    editSportId && editSportId !== tournament?.sportId ? null : (tournament?.sportId ?? null);
  const {
    data: lineupSizeOptions,
    isPending: lineupSizeOptionsPending,
    isError: lineupSizeOptionsFailed,
  } = useV1LineupSizeOptions(lineupSizeSportId);
  const [editGenderCategory, setEditGenderCategory] =
    useState<V1TournamentGenderCategory | ''>('');
  const [editGenderMinMale, setEditGenderMinMale] = useState('');
  const [editGenderMaxMale, setEditGenderMaxMale] = useState('');
  const [editGenderMinFemale, setEditGenderMinFemale] = useState('');
  const [editGenderMaxFemale, setEditGenderMaxFemale] = useState('');
  const [editBankName, setEditBankName] = useState('');
  const [editBankAccount, setEditBankAccount] = useState('');
  const [editBankHolder, setEditBankHolder] = useState('');
  const [editRulesText, setEditRulesText] = useState('');
  // 카드 정지 규정 — 빈 문자열 = 미적용. 생성 폼과 같은 표현을 쓴다.
  const [editYellowLimit, setEditYellowLimit] = useState('');
  const [editRedSuspension, setEditRedSuspension] = useState('');
  const [editRefundPolicyText, setEditRefundPolicyText] = useState('');
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoHomeEnabled, setPromoHomeEnabled] = useState(false);
  const [promoHomeTitle, setPromoHomeTitle] = useState('');
  const [promoHomeSubtitle, setPromoHomeSubtitle] = useState('');
  const [promoHomeImageUrl, setPromoHomeImageUrl] = useState('');
  const [promoHomeBadgeText, setPromoHomeBadgeText] = useState('');
  const [promoHomeDateText, setPromoHomeDateText] = useState('');
  const [promoHomeTeamsText, setPromoHomeTeamsText] = useState('');
  const [promoHomeLocationText, setPromoHomeLocationText] = useState('');
  const [promoHomePrizeText, setPromoHomePrizeText] = useState('');
  const [promoHomePriority, setPromoHomePriority] = useState('0');
  const [promoListEnabled, setPromoListEnabled] = useState(false);
  const [promoListTitle, setPromoListTitle] = useState('');
  const [promoListSubtitle, setPromoListSubtitle] = useState('');
  const [promoListImageUrl, setPromoListImageUrl] = useState('');
  const [promoListBadgeText, setPromoListBadgeText] = useState('');
  const [promoListDateText, setPromoListDateText] = useState('');
  const [promoListTeamsText, setPromoListTeamsText] = useState('');
  const [promoListLocationText, setPromoListLocationText] = useState('');
  const [promoListPrizeText, setPromoListPrizeText] = useState('');
  const [promoListPriority, setPromoListPriority] = useState('0');
  const [promoUploadingSlot, setPromoUploadingSlot] = useState<'home' | 'list' | null>(null);
  // 홈 히어로 미리보기 폴백 3순위(`${sportName} 대회`)용 — 프로덕션(tournament-hero-card.tsx)과
  // 동일 계산이지만 어드민 상세 응답에는 sport 객체가 없어 마스터 종목 목록에서 조회한다.
  const promoFallbackSportName = masterSports?.find((s) => s.id === tournament?.sportId)?.name ?? null;

  /** Open edit modal prefilled with current tournament values */
  const openEdit = () => {
    if (!tournament) return;
    setEditTitle(tournament.title);
    setEditSportId(tournament.sportId);
    setEditScheduledAt(isoToDatetimeLocalValue(tournament.scheduledAt));
    setEditScheduledEndAt(isoToDatetimeLocalValue(tournament.scheduledEndAt));
    setEditDeadlineAt(isoToDatetimeLocalValue(tournament.registrationDeadlineAt));
    setEditRosterDeadlineAt(isoToDatetimeLocalValue(tournament.rosterDeadlineAt));
    setEditVenue(tournament.venue ?? '');
    setEditParkingInfo(tournament.parkingInfo ?? '');
    setEditEntryFee(String(tournament.entryFee));
    setEditTeamCount(String(tournament.teamCount));
    setEditMinPlayers(String(tournament.minPlayers));
    setEditMaxPlayers(String(tournament.maxPlayers));
    // 빈 문자열로 시작 — "아직 안 바꿈"을 뜻하며, 선택지 그룹은 tournament.lineupMaxPlayers를
    // 선택된 값으로 보여준다(아래 JSX). 사용자가 명시적으로 다른 값을 고를 때만 payload에
    // lineupMaxPlayers가 실린다.
    setEditLineupMaxPlayers('');
    // 교체 방식/횟수도 같은 원칙 — 빈 값으로 시작하고, 선택지 그룹은
    // tournament.substitutionMode/maxSubstitutions를 선택된 값으로 보여준다(아래 JSX).
    setEditSubstitutionMode('');
    setEditMaxSubstitutions('');
    setEditGenderCategory(tournament.genderCategory ?? '');
    setEditGenderMinMale(
      tournament.genderMinMale === null ? '' : String(tournament.genderMinMale),
    );
    setEditGenderMaxMale(
      tournament.genderMaxMale === null ? '' : String(tournament.genderMaxMale),
    );
    setEditGenderMinFemale(
      tournament.genderMinFemale === null ? '' : String(tournament.genderMinFemale),
    );
    setEditGenderMaxFemale(
      tournament.genderMaxFemale === null ? '' : String(tournament.genderMaxFemale),
    );
    setEditBankName(tournament.bankName ?? '');
    setEditBankAccount(tournament.bankAccount ?? '');
    setEditBankHolder(tournament.bankHolder ?? '');
    setEditRulesText(tournament.rulesText ?? '');
    setEditYellowLimit(
      tournament.yellowAccumulationLimit === null || tournament.yellowAccumulationLimit === undefined
        ? ''
        : String(tournament.yellowAccumulationLimit),
    );
    setEditRedSuspension(
      tournament.redCardSuspensionMatches === null || tournament.redCardSuspensionMatches === undefined
        ? ''
        : String(tournament.redCardSuspensionMatches),
    );
    setEditRefundPolicyText(tournament.refundPolicyText ?? '');
    setEditOpen(true);
  };

  const openPromoEdit = () => {
    if (!tournament) return;
    setPromoHomeEnabled(tournament.promoHomeEnabled ?? false);
    setPromoHomeTitle(tournament.promoHomeTitle ?? '');
    setPromoHomeSubtitle(tournament.promoHomeSubtitle ?? '');
    setPromoHomeImageUrl(tournament.promoHomeImageUrl ?? '');
    setPromoHomeBadgeText(tournament.promoHomeBadgeText ?? '');
    setPromoHomeDateText(tournament.promoHomeDateText ?? '');
    setPromoHomeTeamsText(tournament.promoHomeTeamsText ?? '');
    setPromoHomeLocationText(tournament.promoHomeLocationText ?? '');
    setPromoHomePrizeText(tournament.promoHomePrizeText ?? '');
    setPromoHomePriority(String(tournament.promoHomePriority ?? 0));
    setPromoListEnabled(tournament.promoListEnabled ?? false);
    setPromoListTitle(tournament.promoListTitle ?? '');
    setPromoListSubtitle(tournament.promoListSubtitle ?? '');
    setPromoListImageUrl(tournament.promoListImageUrl ?? '');
    setPromoListBadgeText(tournament.promoListBadgeText ?? '');
    setPromoListDateText(tournament.promoListDateText ?? '');
    setPromoListTeamsText(tournament.promoListTeamsText ?? '');
    setPromoListLocationText(tournament.promoListLocationText ?? '');
    setPromoListPrizeText(tournament.promoListPrizeText ?? '');
    setPromoListPriority(String(tournament.promoListPriority ?? 0));
    setPromoOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tournament) return;
    const normalizedTitle = editTitle.trim();
    if (!normalizedTitle) {
      showToast('대회명을 입력해 주세요.', 'error');
      return;
    }
    // 날짜 역전 가드 — datetime-local 값은 ISO 형태라 사전순 비교로 충분하다
    if (editScheduledAt && editScheduledEndAt && editScheduledEndAt < editScheduledAt) {
      showToast('대회 종료가 시작보다 빠를 수 없어요.', 'error');
      return;
    }
    const teamCount = Number(editTeamCount);
    const minPlayers = Number(editMinPlayers);
    const maxPlayers = Number(editMaxPlayers);
    if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > 64) {
      showToast('참가 팀 수는 2~64 사이의 정수여야 해요.', 'error');
      return;
    }
    if (
      !Number.isInteger(minPlayers) ||
      !Number.isInteger(maxPlayers) ||
      minPlayers < 1 ||
      maxPlayers > 50 ||
      minPlayers > maxPlayers
    ) {
      showToast('선수 수는 1~50명이며 최소 인원이 최대 인원보다 클 수 없어요.', 'error');
      return;
    }
    const entryFee = Number(editEntryFee);
    if (!Number.isInteger(entryFee) || entryFee < 0 || entryFee > 100_000_000) {
      showToast('참가비는 0원~1억 원 사이의 정수여야 해요.', 'error');
      return;
    }
    const genderMinMale = editGenderMinMale === '' ? null : Number(editGenderMinMale);
    const genderMaxMale = editGenderMaxMale === '' ? null : Number(editGenderMaxMale);
    const genderMinFemale = editGenderMinFemale === '' ? null : Number(editGenderMinFemale);
    const genderMaxFemale = editGenderMaxFemale === '' ? null : Number(editGenderMaxFemale);
    const genderQuotaValues = [
      genderMinMale,
      genderMaxMale,
      genderMinFemale,
      genderMaxFemale,
    ];
    if (
      editGenderCategory === 'mixed' &&
      (genderQuotaValues.some(
        (value) => value !== null && (!Number.isInteger(value) || value < 0 || value > 50),
      ) ||
        (genderMinMale !== null &&
          genderMaxMale !== null &&
          genderMinMale > genderMaxMale) ||
        (genderMinFemale !== null &&
          genderMaxFemale !== null &&
          genderMinFemale > genderMaxFemale) ||
        (genderMinMale ?? 0) + (genderMinFemale ?? 0) > maxPlayers ||
        (genderMaxMale !== null && genderMaxMale > maxPlayers) ||
        (genderMaxFemale !== null && genderMaxFemale > maxPlayers))
    ) {
      showToast('혼성 명단의 최소·최대 인원 조건을 다시 확인해 주세요.', 'error');
      return;
    }
    const payload: V1UpdateTournamentPayload = {};
    if (normalizedTitle !== tournament.title) payload.title = normalizedTitle;
    if (editSportId && editSportId !== tournament.sportId) payload.sportId = editSportId;
    if (editScheduledAt !== isoToDatetimeLocalValue(tournament.scheduledAt)) {
      payload.scheduledAt = datetimeLocalValueToIso(editScheduledAt);
    }
    if (editScheduledEndAt !== isoToDatetimeLocalValue(tournament.scheduledEndAt)) {
      payload.scheduledEndAt = datetimeLocalValueToIso(editScheduledEndAt);
    }
    if (editDeadlineAt !== isoToDatetimeLocalValue(tournament.registrationDeadlineAt)) {
      payload.registrationDeadlineAt = datetimeLocalValueToIso(editDeadlineAt);
    }
    if (editRosterDeadlineAt !== isoToDatetimeLocalValue(tournament.rosterDeadlineAt)) {
      payload.rosterDeadlineAt = datetimeLocalValueToIso(editRosterDeadlineAt);
    }
    const normalizedVenue = editVenue.trim() || null;
    if (normalizedVenue !== tournament.venue) payload.venue = normalizedVenue;
    const normalizedParkingInfo = editParkingInfo.trim() || null;
    if (normalizedParkingInfo !== (tournament.parkingInfo ?? null)) {
      payload.parkingInfo = normalizedParkingInfo;
    }
    if (entryFee !== tournament.entryFee) payload.entryFee = entryFee;
    if (teamCount !== tournament.teamCount) payload.teamCount = teamCount;
    if (minPlayers !== tournament.minPlayers) payload.minPlayers = minPlayers;
    if (maxPlayers !== tournament.maxPlayers) payload.maxPlayers = maxPlayers;
    // "출전 인원" — editLineupMaxPlayers가 빈 문자열이면(아직 안 고름) payload에서 아예
    // 뺀다. 서버는 이 필드가 없으면 기존 값을 그대로 둔다(update()는 partial PATCH).
    if (editLineupMaxPlayers !== '' && Number(editLineupMaxPlayers) !== tournament.lineupMaxPlayers) {
      payload.lineupMaxPlayers = Number(editLineupMaxPlayers);
    }
    // "교체 방식/횟수" — editSubstitutionMode가 빈 문자열이면(아직 안 고름) payload에서
    // 아예 뺀다. 'rolling'을 고르면 횟수는 함께 보내지 않는다(서버가 400으로 거절한다).
    if (editSubstitutionMode !== '' && editSubstitutionMode !== tournament.substitutionMode) {
      payload.substitutionMode = editSubstitutionMode;
    }
    if (
      editSubstitutionMode === 'limited' &&
      editMaxSubstitutions !== '' &&
      Number(editMaxSubstitutions) !== tournament.maxSubstitutions
    ) {
      payload.maxSubstitutions = Number(editMaxSubstitutions);
    }
    if (editGenderCategory && editGenderCategory !== (tournament.genderCategory ?? '')) {
      payload.genderCategory = editGenderCategory;
    }
    if (editGenderCategory === 'mixed') {
      if (genderMinMale !== tournament.genderMinMale) payload.genderMinMale = genderMinMale;
      if (genderMaxMale !== tournament.genderMaxMale) payload.genderMaxMale = genderMaxMale;
      if (genderMinFemale !== tournament.genderMinFemale) {
        payload.genderMinFemale = genderMinFemale;
      }
      if (genderMaxFemale !== tournament.genderMaxFemale) {
        payload.genderMaxFemale = genderMaxFemale;
      }
    }
    const normalizedBankName = editBankName.trim() || null;
    const normalizedBankAccount = editBankAccount.trim() || null;
    const normalizedBankHolder = editBankHolder.trim() || null;
    const normalizedRulesText = editRulesText.trim() || null;
    const normalizedRefundPolicyText = editRefundPolicyText.trim() || null;
    if (normalizedBankName !== tournament.bankName) payload.bankName = normalizedBankName;
    if (normalizedBankAccount !== tournament.bankAccount) {
      payload.bankAccount = normalizedBankAccount;
    }
    if (normalizedBankHolder !== tournament.bankHolder) payload.bankHolder = normalizedBankHolder;
    if (normalizedRulesText !== tournament.rulesText) payload.rulesText = normalizedRulesText;
    /**
     * 비우면 null 을 **명시적으로** 보낸다 — 그래야 한 번 켠 규정을 끌 수 있다
     * (undefined 면 서버가 "안 건드림"으로 읽어 영영 못 끈다).
     *
     * 비정상 입력은 **저장 자체를 막는다**(Copilot 리뷰 지적, real 2건):
     *  ① `Number('abc')` 는 NaN 이고 JSON 직렬화에서 null 로 바뀐다 — 오타 한 번이
     *     조용히 "규정 끔"으로 전달된다.
     *  ② `NaN !== x` 는 항상 true 라 변경이 없어도 payload 에 끼어든다.
     * 조용히 null 로 흘려보내는 것보다 멈추고 알리는 쪽이 안전하다.
     */
    const parseRule = (raw: string): number | null | 'invalid' => {
      if (!raw.trim()) return null;
      const parsed = Number(raw);
      // 서버 DTO 가 1~20 으로 검증한다(admin-tournament.dto.ts) — 클라이언트가 > 0 만
      // 보면 21 이 통과한 뒤 서버에서 400 으로 깨진다(Copilot 리뷰 지적). input 의
      // max={20} 은 브라우저에 따라 강제되지 않으므로 여기서 같은 범위를 검사한다.
      return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : 'invalid';
    };
    const normalizedYellowLimit = parseRule(editYellowLimit);
    const normalizedRedSuspension = parseRule(editRedSuspension);
    if (normalizedYellowLimit === 'invalid' || normalizedRedSuspension === 'invalid') {
      showToast('출전정지 기준은 1~20 사이의 정수로 적어 주세요.', 'error');
      return;
    }
    if (normalizedYellowLimit !== (tournament.yellowAccumulationLimit ?? null)) {
      payload.yellowAccumulationLimit = normalizedYellowLimit;
    }
    if (normalizedRedSuspension !== (tournament.redCardSuspensionMatches ?? null)) {
      payload.redCardSuspensionMatches = normalizedRedSuspension;
    }
    if (normalizedRefundPolicyText !== tournament.refundPolicyText) {
      payload.refundPolicyText = normalizedRefundPolicyText;
    }

    if (Object.keys(payload).length === 0) {
      setEditOpen(false);
      showToast('변경된 내용이 없어요.', 'success');
      return;
    }

    updateTournament.mutate(payload, {
      onSuccess: () => {
        setEditOpen(false);
        showToast('대회 정보를 수정했어요.', 'success');
      },
      onError: (err) =>
        showToast(extractErrorMessage(err, '대회 정보 수정에 실패했어요.'), 'error'),
    });
  };

  const handlePromoImageChange = async (slot: 'home' | 'list', file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('이미지 파일만 첨부할 수 있어요.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('이미지는 5MB 이하로 첨부해 주세요.', 'error');
      return;
    }

    setPromoUploadingSlot(slot);
    try {
      const result = await uploadImages.mutateAsync(file);
      const url = result.urls[0];
      if (!url) {
        showToast('업로드된 이미지 URL을 받지 못했어요.', 'error');
        return;
      }
      if (slot === 'home') {
        setPromoHomeImageUrl(url);
      } else {
        setPromoListImageUrl(url);
      }
      showToast('이미지를 첨부했어요. 저장을 눌러 반영해 주세요.', 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, '이미지 업로드에 실패했어요.'), 'error');
    } finally {
      setPromoUploadingSlot(null);
    }
  };

  const handlePromoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const homePriority = Number(promoHomePriority);
    const listPriority = Number(promoListPriority);
    const payload: V1UpdateTournamentPayload = {
      promoHomeEnabled,
      promoHomeTitle: promoHomeTitle.trim(),
      promoHomeSubtitle: promoHomeSubtitle.trim(),
      promoHomeImageUrl: promoHomeImageUrl.trim(),
      promoHomeBadgeText: promoHomeBadgeText.trim(),
      promoHomeDateText: promoHomeDateText.trim(),
      promoHomeTeamsText: promoHomeTeamsText.trim(),
      promoHomeLocationText: promoHomeLocationText.trim(),
      promoHomePrizeText: promoHomePrizeText.trim(),
      promoHomePriority: Number.isNaN(homePriority) ? 0 : homePriority,
      promoListEnabled,
      promoListTitle: promoListTitle.trim(),
      promoListSubtitle: promoListSubtitle.trim(),
      promoListImageUrl: promoListImageUrl.trim(),
      promoListBadgeText: promoListBadgeText.trim(),
      promoListDateText: promoListDateText.trim(),
      promoListTeamsText: promoListTeamsText.trim(),
      promoListLocationText: promoListLocationText.trim(),
      promoListPrizeText: promoListPrizeText.trim(),
      promoListPriority: Number.isNaN(listPriority) ? 0 : listPriority,
    };

    updateTournament.mutate(payload, {
      onSuccess: () => {
        setPromoOpen(false);
        showToast('홍보 카드 설정을 저장했어요.', 'success');
      },
      onError: (err) =>
        showToast(extractErrorMessage(err, '홍보 카드 설정 저장에 실패했어요.'), 'error'),
    });
  };

  // 로딩·에러는 셸(layout)이 이미 처리한다 — 여기서는 데이터가 없으면 조용히 비운다.
  if (!tournament) return null;

  const scheduleLabel = formatDateRange(tournament.scheduledAt, tournament.scheduledEndAt);

  return (
    <>
      {/* 대회 정보 — 읽기 요약 하나 + 편집 진입점 하나.
          예전에는 같은 값(마감·참가비·팀 수·출전 인원·교체 방식·계좌…)을 이 카드와 아래
          요약표가 각각 그렸고, '대회 정보 수정' 버튼도 두 곳에 있었다. */}
      <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] px-5 py-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] font-bold text-[var(--text-strong)]">대회 정보</span>
          {canWrite && (
            <button
              type="button"
              onClick={openEdit}
              className="inline-flex items-center gap-2 h-[44px] px-3 rounded-lg text-xs font-medium text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              <Pencil size={13} aria-hidden="true" />
              대회 정보 수정
            </button>
          )}
        </div>
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3">
          {[
            { label: '상태', value: TOURNAMENT_STATUS_LABEL[tournament.status] ?? tournament.status },
            { label: '형식', value: TOURNAMENT_FORMAT_LABEL[tournament.format] ?? tournament.format },
            { label: '대회 일정', value: scheduleLabel },
            { label: '장소', value: tournament.venue ?? '미정' },
            { label: '신청 마감', value: formatDate(tournament.registrationDeadlineAt) },
            { label: '명단 마감', value: formatDate(tournament.rosterDeadlineAt) },
            { label: '참가비', value: formatCurrency(tournament.entryFee) },
            { label: '팀 수', value: `${tournament.teamCount}팀` },
            { label: '신청 수', value: `${tournament.registrationCount}팀` },
            { label: '선수 구성 (등록 명단)', value: `${tournament.minPlayers}~${tournament.maxPlayers}명` },
            {
              label: '출전 인원',
              value: tournament.lineupMaxPlayers !== null ? `${tournament.lineupMaxPlayers}명` : '미지정',
            },
            {
              label: '교체 방식',
              value: substitutionPolicyLabel(tournament.substitutionMode, tournament.maxSubstitutions),
            },
            {
              label: '입금 계좌',
              value: tournament.bankName
                ? `${tournament.bankName} ${tournament.bankAccount ?? ''}${tournament.bankHolder ? ` (${tournament.bankHolder})` : ''}`
                : '미등록',
            },
          ].map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs text-[var(--text-muted)] font-medium mb-0.5">{label}</dt>
              <dd className="text-[13px] text-[var(--text-strong)]">{value}</dd>
            </div>
          ))}
        </dl>
        {/* 규정·환불은 긴 글이라 표가 아니라 아래에 펼친다. 상금은 바로 아래 전용 카드에서
            읽고 고치므로 여기서 또 보여주지 않는다. */}
        {(tournament.rulesText || tournament.refundPolicyText) ? (
          <div className="mt-4 flex flex-col gap-3 border-t border-[var(--border)] pt-4">
            {tournament.rulesText && (
              <div>
                <p className="text-xs text-[var(--text-muted)] font-medium mb-0.5">대회 규정</p>
                <p className="text-[13px] text-[var(--text-strong)] whitespace-pre-wrap leading-relaxed">{tournament.rulesText}</p>
              </div>
            )}
            {tournament.refundPolicyText && (
              <div>
                <p className="text-xs text-[var(--text-muted)] font-medium mb-0.5">환불 정책</p>
                <p className="text-[13px] text-[var(--text-strong)] whitespace-pre-wrap leading-relaxed">{tournament.refundPolicyText}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-xs text-[var(--text-muted)]">대회 규정과 환불 정책을 아직 입력하지 않았어요.</p>
        )}
      </div>

      <CoverImageCard tournament={tournament} canWrite={canWrite} showToast={showToast} />

      <PrizeCard tournament={tournament} canWrite={canWrite} showToast={showToast} />

      <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] px-5 py-4 mb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="text-[13px] font-bold text-[var(--text-strong)]">홍보 카드</span>
          {canWrite && (
            <button
              type="button"
              onClick={openPromoEdit}
              className="inline-flex items-center gap-2 h-[44px] px-3 rounded-lg text-xs font-medium text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              <Pencil size={13} aria-hidden="true" />
              홍보 카드 수정
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[
            {
              key: 'home',
              title: '홈 오늘의 추천',
              enabled: tournament.promoHomeEnabled,
              priority: tournament.promoHomePriority,
              badge: tournament.promoHomeBadgeText,
              cardTitle: tournament.promoHomeTitle,
              subtitle: tournament.promoHomeSubtitle,
              imageUrl: resolveTournamentImage(tournament, 'home'),
              dateText: tournament.promoHomeDateText,
              teamsText: tournament.promoHomeTeamsText,
              locationText: tournament.promoHomeLocationText,
              prizeText: tournament.promoHomePrizeText,
            },
            {
              key: 'list',
              title: '대회 목록 상단',
              enabled: tournament.promoListEnabled,
              priority: tournament.promoListPriority,
              badge: tournament.promoListBadgeText,
              cardTitle: tournament.promoListTitle,
              subtitle: tournament.promoListSubtitle,
              imageUrl: resolveTournamentImage(tournament, 'list'),
              dateText: tournament.promoListDateText,
              teamsText: tournament.promoListTeamsText,
              locationText: tournament.promoListLocationText,
              prizeText: tournament.promoListPrizeText,
            },
          ].map((promo) => (
            <div key={promo.key} className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-[var(--text-strong)]">{promo.title}</p>
                <span className={`rounded-full px-3 py-1 text-[length:var(--font-size-caption)] font-semibold ${promo.enabled ? 'bg-[var(--blue50)] text-[var(--blue700)]' : 'bg-[var(--card-surface)] text-[var(--text-muted)] border border-[var(--border)]'}`}>
                  {promo.enabled ? '노출' : '숨김'}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">우선순위</dt>
                  <dd className="text-[var(--text-strong)]">{promo.priority}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">배지</dt>
                  <dd className="text-[var(--text-strong)] truncate">{promo.badge || '-'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-[var(--text-muted)]">제목</dt>
                  <dd className="text-[var(--text-strong)] truncate">{promo.cardTitle || '대회명 사용'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-[var(--text-muted)]">내용</dt>
                  <dd className="text-[var(--text-strong)] whitespace-pre-wrap break-words">{promo.subtitle || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">하단 날짜</dt>
                  <dd className="text-[var(--text-strong)] truncate">{promo.dateText || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">하단 팀확정</dt>
                  <dd className="text-[var(--text-strong)] truncate">{promo.teamsText || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">하단 위치</dt>
                  <dd className="text-[var(--text-strong)] truncate">{promo.locationText || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">상품 및 상금</dt>
                  <dd className="text-[var(--text-strong)] truncate">{promo.prizeText || '-'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-[var(--text-muted)]">이미지</dt>
                  <dd className="text-[var(--text-strong)] break-all">{promo.imageUrl || '-'}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </div>

      {/* ── D1: 대회 정보 수정 모달 ──────────────────────────────────── */}
      <SimpleModal
        open={editOpen}
        title="대회 정보 수정"
        onClose={() => setEditOpen(false)}
        pending={updateTournament.isPending}
      >
        <form onSubmit={handleEditSubmit} noValidate className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="flex flex-col gap-2">
            <label htmlFor="edit-sport-id" className="text-[13px] text-[var(--text-strong)]">종목</label>
            <select
              id="edit-sport-id"
              value={editSportId}
              onChange={(e) => setEditSportId(e.target.value)}
              disabled={updateTournament.isPending}
              className={inputCls}
            >
              {(masterSports ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">종목을 바꾸면 목록·상세의 종목 뱃지와 필터에 바로 반영돼요.</p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="edit-title" className="text-[13px] text-[var(--text-strong)]">
              대회명 <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="edit-title"
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              disabled={updateTournament.isPending}
              maxLength={100}
              required
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TournamentDatetimeField
              id="edit-scheduled-at"
              label="대회 시작"
              value={editScheduledAt}
              onChange={setEditScheduledAt}
              disabled={updateTournament.isPending}
            />
            <TournamentDatetimeField
              id="edit-scheduled-end-at"
              label="대회 종료"
              value={editScheduledEndAt}
              onChange={setEditScheduledEndAt}
              disabled={updateTournament.isPending}
              min={editScheduledAt || undefined}
            />
            <TournamentDatetimeField
              id="edit-deadline-at"
              label="신청 마감"
              value={editDeadlineAt}
              onChange={setEditDeadlineAt}
              disabled={updateTournament.isPending}
            />
            <TournamentDatetimeField
              id="edit-roster-deadline-at"
              label="명단 제출 마감일"
              value={editRosterDeadlineAt}
              onChange={setEditRosterDeadlineAt}
              disabled={updateTournament.isPending}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="edit-venue" className="text-[13px] text-[var(--text-strong)]">장소</label>
            <input
              id="edit-venue"
              type="text"
              value={editVenue}
              onChange={(e) => setEditVenue(e.target.value)}
              disabled={updateTournament.isPending}
              maxLength={100}
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="edit-parking-info" className="text-[13px] text-[var(--text-strong)]">주차 안내</label>
            <textarea
              id="edit-parking-info"
              value={editParkingInfo}
              onChange={(e) => setEditParkingInfo(e.target.value)}
              disabled={updateTournament.isPending}
              maxLength={500}
              rows={3}
              placeholder="예: 건물 지하 주차장 2시간 무료, 만차 시 인근 공영주차장을 이용해 주세요."
              className={inputCls}
            />
            <span className="text-[12px] text-[var(--text-muted)]">
              대회 상세의 현장 안내에서 장소 아래에 표시돼요. 비우면 안내 문구를 숨겨요.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="edit-entry-fee" className="text-[13px] text-[var(--text-strong)]">참가비 (원)</label>
              <input
                id="edit-entry-fee"
                type="text"
                inputMode="numeric"
                value={formatWithComma(editEntryFee)}
                onChange={(e) => setEditEntryFee(onlyDigits(e.target.value))}
                disabled={updateTournament.isPending}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="edit-team-count" className="text-[13px] text-[var(--text-strong)]">팀 수</label>
              <input
                id="edit-team-count"
                type="number"
                inputMode="numeric"
                min={2}
                value={editTeamCount}
                onChange={(e) => setEditTeamCount(e.target.value)}
                disabled={updateTournament.isPending}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="edit-min-players" className="text-[13px] text-[var(--text-strong)]">최소 선수 (등록 명단)</label>
              <input
                id="edit-min-players"
                type="number"
                inputMode="numeric"
                min={1}
                value={editMinPlayers}
                onChange={(e) => setEditMinPlayers(e.target.value)}
                disabled={updateTournament.isPending}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="edit-max-players" className="text-[13px] text-[var(--text-strong)]">최대 선수 (등록 명단)</label>
              <input
                id="edit-max-players"
                type="number"
                inputMode="numeric"
                min={1}
                value={editMaxPlayers}
                onChange={(e) => setEditMaxPlayers(e.target.value)}
                disabled={updateTournament.isPending}
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-[var(--text-strong)]">출전 인원</span>
            <p className="text-[12px] text-[var(--text-muted)]">
              경기장에 실제로 서는 라인업 인원(골키퍼 포함)이에요. 위 등록 명단 인원과는 달라요.
            </p>
            {tournament.status === 'in_progress' || tournament.status === 'completed' ? (
              <p className="text-[12px] text-[var(--orange700)]">
                대회가 시작된 이후에는 출전 인원을 바꿀 수 없어요.
                {tournament.lineupMaxPlayers !== null ? ` 현재 ${tournament.lineupMaxPlayers}명이에요.` : ''}
                {' '}
                {LINEUP_LOCK_ESCAPE_HINT}
              </p>
            ) : editSportId && editSportId !== tournament.sportId ? (
              <p className="text-[12px] text-[var(--text-muted)]">
                종목을 바꾸는 중에는 출전 인원을 함께 바꿀 수 없어요. 종목을 먼저 저장한 뒤 다시 편집해 주세요.
              </p>
            ) : lineupSizeOptionsPending ? (
              <p className="text-[12px] text-[var(--text-muted)]">선택지를 불러오는 중이에요…</p>
            ) : lineupSizeOptionsFailed || !lineupSizeOptions ? (
              // 조회 실패를 "미지원 종목"과 같은 문구로 뭉뚱그리면 실제 오류가 숨겨진다
              // (Copilot 리뷰 지적). 현재 pin된 값은 아래 안내로 그대로 보여준다.
              <p className="text-[12px] text-[var(--red700)]">
                출전 인원 선택지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
                {tournament.lineupMaxPlayers !== null ? ` 현재 설정은 ${tournament.lineupMaxPlayers}명이에요.` : ''}
              </p>
            ) : !lineupSizeOptions.supported ? (
              <p className="text-[12px] text-[var(--text-muted)]">이 종목은 아직 출전 인원을 선택할 수 없어요.</p>
            ) : (
              <div className="flex flex-wrap gap-2" role="group" aria-label="출전 인원 선택">
                {lineupSizeOptions.options.map((option) => {
                  const currentValue =
                    editLineupMaxPlayers !== '' ? editLineupMaxPlayers : String(tournament.lineupMaxPlayers ?? '');
                  const selected = currentValue === String(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={updateTournament.isPending}
                      onClick={() => setEditLineupMaxPlayers(String(option))}
                      aria-pressed={selected}
                      className={`inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 ${
                        selected
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-[var(--border)] bg-white text-[var(--text-strong)] hover:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white'
                      }`}
                    >
                      {option}명
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-[var(--text-strong)]">교체 방식</span>
            <p className="text-[12px] text-[var(--text-muted)]">
              경기 중 후보 선수를 주전과 몇 번까지 바꿀 수 있는지예요. 무제한(롤링)은 이미 나갔던 선수도 다시 투입할 수 있어요.
            </p>
            {tournament.status === 'in_progress' || tournament.status === 'completed' ? (
              <p className="text-[12px] text-[var(--orange700)]">
                대회가 시작된 이후에는 교체 방식을 바꿀 수 없어요.
                {tournament.substitutionMode !== null
                  ? ` 현재 ${substitutionPolicyLabel(tournament.substitutionMode, tournament.maxSubstitutions)}이에요.`
                  : ''}
                {' '}
                {LINEUP_LOCK_ESCAPE_HINT}
              </p>
            ) : editSportId && editSportId !== tournament.sportId ? (
              <p className="text-[12px] text-[var(--text-muted)]">
                종목을 바꾸는 중에는 교체 방식을 함께 바꿀 수 없어요. 종목을 먼저 저장한 뒤 다시 편집해 주세요.
              </p>
            ) : lineupSizeOptionsPending ? (
              <p className="text-[12px] text-[var(--text-muted)]">선택지를 불러오는 중이에요…</p>
            ) : lineupSizeOptionsFailed || !lineupSizeOptions ? (
              <p className="text-[12px] text-[var(--red700)]">
                교체 방식 선택지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
                {tournament.substitutionMode !== null
                  ? ` 현재 설정은 ${substitutionPolicyLabel(tournament.substitutionMode, tournament.maxSubstitutions)}이에요.`
                  : ''}
              </p>
            ) : !lineupSizeOptions.supported ? (
              <p className="text-[12px] text-[var(--text-muted)]">이 종목은 아직 교체 방식을 선택할 수 없어요.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2" role="group" aria-label="교체 방식 선택">
                  {lineupSizeOptions.substitutionModes.map((mode) => {
                    const currentValue =
                      editSubstitutionMode !== '' ? editSubstitutionMode : (tournament.substitutionMode ?? '');
                    const selected = currentValue === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        disabled={updateTournament.isPending}
                        onClick={() => setEditSubstitutionMode(mode)}
                        aria-pressed={selected}
                        className={`inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 ${
                          selected
                            ? 'border-blue-500 bg-blue-500 text-white'
                            : 'border-[var(--border)] bg-white text-[var(--text-strong)] hover:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white'
                        }`}
                      >
                        {mode === 'limited' ? '제한' : '무제한(롤링)'}
                      </button>
                    );
                  })}
                </div>
                {(editSubstitutionMode || tournament.substitutionMode) === 'limited' ? (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="edit-max-substitutions" className="text-[13px] text-[var(--text-strong)]">
                      허용 교체 횟수
                    </label>
                    <input
                      id="edit-max-substitutions"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={50}
                      value={
                        editMaxSubstitutions !== ''
                          ? editMaxSubstitutions
                          : String(tournament.maxSubstitutions ?? '')
                      }
                      onChange={(e) => setEditMaxSubstitutions(e.target.value)}
                      disabled={updateTournament.isPending}
                      className={inputCls}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="edit-gender-category" className="text-[13px] text-[var(--text-strong)]">
              성별 카테고리
            </label>
            <select
              id="edit-gender-category"
              value={editGenderCategory}
              onChange={(event) =>
                setEditGenderCategory(event.target.value as V1TournamentGenderCategory | '')
              }
              disabled={updateTournament.isPending}
              className={inputCls}
            >
              <option value="" disabled>성별 구분 없음 (기존)</option>
              <option value="mixed">혼성</option>
              <option value="male">남성부</option>
              <option value="female">여성부</option>
            </select>
          </div>

          {editGenderCategory === 'mixed' ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <GenderQuotaInput
                id="edit-gender-min-male"
                label="남성 최소"
                value={editGenderMinMale}
                onChange={setEditGenderMinMale}
                disabled={updateTournament.isPending}
              />
              <GenderQuotaInput
                id="edit-gender-max-male"
                label="남성 최대"
                value={editGenderMaxMale}
                onChange={setEditGenderMaxMale}
                disabled={updateTournament.isPending}
              />
              <GenderQuotaInput
                id="edit-gender-min-female"
                label="여성 최소"
                value={editGenderMinFemale}
                onChange={setEditGenderMinFemale}
                disabled={updateTournament.isPending}
              />
              <GenderQuotaInput
                id="edit-gender-max-female"
                label="여성 최대"
                value={editGenderMaxFemale}
                onChange={setEditGenderMaxFemale}
                disabled={updateTournament.isPending}
              />
            </div>
          ) : null}

          <p className="text-[12px] text-[var(--text-muted)] -mb-2">상금·시상 정보는 &quot;대회 정보&quot; 탭에서 수정할 수 있어요.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="edit-bank-name" className="text-[13px] text-[var(--text-strong)]">은행명</label>
              <input
                id="edit-bank-name"
                type="text"
                value={editBankName}
                onChange={(e) => setEditBankName(e.target.value)}
                disabled={updateTournament.isPending}
                maxLength={20}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="edit-bank-account" className="text-[13px] text-[var(--text-strong)]">계좌번호</label>
              <input
                id="edit-bank-account"
                type="text"
                value={editBankAccount}
                onChange={(e) => setEditBankAccount(e.target.value)}
                disabled={updateTournament.isPending}
                maxLength={30}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="edit-bank-holder" className="text-[13px] text-[var(--text-strong)]">예금주</label>
              <input
                id="edit-bank-holder"
                type="text"
                value={editBankHolder}
                onChange={(e) => setEditBankHolder(e.target.value)}
                disabled={updateTournament.isPending}
                maxLength={20}
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="edit-rules-text" className="text-[13px] text-[var(--text-strong)]">대회 규정</label>
            <textarea
              id="edit-rules-text"
              value={editRulesText}
              onChange={(e) => setEditRulesText(e.target.value)}
              disabled={updateTournament.isPending}
              rows={16}
              placeholder="대회 규정을 입력해 주세요. 참가 자격, 경기 방식, 경기 진행, 순위 결정 기준 등 긴 문서도 그대로 붙여넣을 수 있어요."
              className={`${textareaCls} text-[12px] leading-relaxed`}
            />
          </div>

          {/* 카드 정지 규정. 비우면 이 대회에는 적용하지 않는다 — 이미 진행된 대회에
              소급 적용되는 것을 막으려고 기본값을 두지 않았다. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="edit-yellow-limit" className="text-[13px] text-[var(--text-strong)]">
                경고 누적 출전정지 (장)
              </label>
              <input
                id="edit-yellow-limit"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                value={editYellowLimit}
                onChange={(e) => setEditYellowLimit(e.target.value)}
                disabled={updateTournament.isPending}
                placeholder="비우면 적용 안 함"
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="edit-red-suspension" className="text-[13px] text-[var(--text-strong)]">
                퇴장 시 출전정지 (경기)
              </label>
              <input
                id="edit-red-suspension"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                value={editRedSuspension}
                onChange={(e) => setEditRedSuspension(e.target.value)}
                disabled={updateTournament.isPending}
                placeholder="비우면 적용 안 함"
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="edit-refund-policy" className="text-[13px] text-[var(--text-strong)]">환불 정책</label>
            <textarea
              id="edit-refund-policy"
              value={editRefundPolicyText}
              onChange={(e) => setEditRefundPolicyText(e.target.value)}
              disabled={updateTournament.isPending}
              rows={12}
              placeholder="환불 정책을 입력해 주세요. 신청·입금 안내, 환불 기준, 예외 사항 등 긴 문서도 그대로 붙여넣을 수 있어요."
              className={`${textareaCls} text-[12px] leading-relaxed`}
            />
          </div>

          <div className="flex gap-2 pt-1 sticky bottom-0 bg-[var(--card-surface)] pb-1">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              disabled={updateTournament.isPending}
              className="flex-1 h-[44px] rounded-xl text-[13px] text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!editTitle.trim() || updateTournament.isPending}
              className={'flex-1 ' + submitBtnCls}
            >
              {updateTournament.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal
        open={promoOpen}
        title="홍보 카드 수정"
        onClose={() => setPromoOpen(false)}
        pending={updateTournament.isPending || promoUploadingSlot !== null}
      >
        <form onSubmit={handlePromoSubmit} noValidate className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
          <PromoCardFields
            variant="home"
            value={{
              enabled: promoHomeEnabled,
              title: promoHomeTitle,
              subtitle: promoHomeSubtitle,
              imageUrl: promoHomeImageUrl,
              badgeText: promoHomeBadgeText,
              dateText: promoHomeDateText,
              teamsText: promoHomeTeamsText,
              locationText: promoHomeLocationText,
              prizeText: promoHomePrizeText,
              priority: promoHomePriority,
            }}
            onChange={(value: TournamentPromoCardValue) => {
              setPromoHomeEnabled(value.enabled);
              setPromoHomeTitle(value.title);
              setPromoHomeSubtitle(value.subtitle);
              setPromoHomeImageUrl(value.imageUrl);
              setPromoHomeBadgeText(value.badgeText);
              setPromoHomeDateText(value.dateText);
              setPromoHomeTeamsText(value.teamsText);
              setPromoHomeLocationText(value.locationText);
              setPromoHomePrizeText(value.prizeText);
              setPromoHomePriority(value.priority);
            }}
            fallback={{
              title: tournament?.title ?? '',
              venue: tournament?.venue ?? null,
              sportName: promoFallbackSportName,
            }}
            onSelectImage={(file) => void handlePromoImageChange('home', file)}
            uploading={promoUploadingSlot === 'home'}
            disabled={updateTournament.isPending || promoUploadingSlot !== null}
            // 이 자리를 비웠을 때 실제로 노출될 이미지 — 자기 자리를 뺀 폴백 결과를 그대로
            // 넘겨 미리보기가 공개 화면과 어긋나지 않게 한다.
            defaultImageUrl={resolveTournamentImage(
              {
                coverImageUrl: tournament?.coverImageUrl,
                promoHomeImageUrl: null,
                promoListImageUrl: promoListImageUrl,
              },
              'home',
            )}
          />
          <PromoCardFields
            variant="list"
            value={{
              enabled: promoListEnabled,
              title: promoListTitle,
              subtitle: promoListSubtitle,
              imageUrl: promoListImageUrl,
              badgeText: promoListBadgeText,
              dateText: promoListDateText,
              teamsText: promoListTeamsText,
              locationText: promoListLocationText,
              prizeText: promoListPrizeText,
              priority: promoListPriority,
            }}
            onChange={(value: TournamentPromoCardValue) => {
              setPromoListEnabled(value.enabled);
              setPromoListTitle(value.title);
              setPromoListSubtitle(value.subtitle);
              setPromoListImageUrl(value.imageUrl);
              setPromoListBadgeText(value.badgeText);
              setPromoListDateText(value.dateText);
              setPromoListTeamsText(value.teamsText);
              setPromoListLocationText(value.locationText);
              setPromoListPrizeText(value.prizeText);
              setPromoListPriority(value.priority);
            }}
            fallback={{
              title: tournament?.title ?? '',
              venue: tournament?.venue ?? null,
              sportName: promoFallbackSportName,
            }}
            onSelectImage={(file) => void handlePromoImageChange('list', file)}
            uploading={promoUploadingSlot === 'list'}
            disabled={updateTournament.isPending || promoUploadingSlot !== null}
            defaultImageUrl={resolveTournamentImage(
              {
                coverImageUrl: tournament?.coverImageUrl,
                promoHomeImageUrl: promoHomeImageUrl,
                promoListImageUrl: null,
              },
              'list',
            )}
          />

          <div className="flex gap-2 pt-1 sticky bottom-0 bg-[var(--card-surface)] pb-1">
            <button type="button" onClick={() => setPromoOpen(false)} disabled={updateTournament.isPending || promoUploadingSlot !== null} className="flex-1 h-[44px] rounded-xl text-[13px] text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50">
              취소
            </button>
            <button type="submit" disabled={updateTournament.isPending || promoUploadingSlot !== null} className={'flex-1 ' + submitBtnCls}>
              {updateTournament.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      </SimpleModal>
    </>
  );
}

// ── Tab: Tournament Info ──────────────────────────────────────────────────

const TOURNAMENT_FORMAT_LABEL: Record<string, string> = {
  league: '리그 방식 (순위전)',
  knockout: '토너먼트 (녹아웃)',
  group_knockout: '조별리그 + 토너먼트',
};

function GenderQuotaInput({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] text-[var(--text-strong)]">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={50}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder="제한 없음"
        className={inputCls}
      />
    </div>
  );
}

/** 커버 이미지 — 목록 카드 썸네일. 읽기 전용 관리자에게는 업로더를 잠근다. */
function CoverImageCard({
  tournament,
  canWrite,
  showToast,
}: {
  tournament: V1Tournament;
  canWrite: boolean;
  showToast: (msg: string, v?: 'success' | 'error') => void;
}) {
  const updateTournament = useV1UpdateTournament(tournament.id);
  const uploadImages = useV1UploadImages();

  const handleUpload = async (file: File) => {
    try {
      const { urls } = await uploadImages.mutateAsync(file);
      if (!urls[0]) {
        showToast('업로드된 이미지 URL을 받지 못했어요.', 'error');
        return;
      }
      updateTournament.mutate({ coverImageUrl: urls[0] }, {
        onSuccess: () => showToast('커버 이미지를 저장했어요.', 'success'),
        onError: (err) => showToast(extractErrorMessage(err, '커버 이미지 저장에 실패했어요.'), 'error'),
      });
    } catch (err) {
      showToast(extractErrorMessage(err, '이미지 업로드에 실패했어요.'), 'error');
    }
  };

  const handleRemove = () => {
    updateTournament.mutate({ coverImageUrl: null }, {
      onSuccess: () => showToast('커버 이미지를 제거했어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '커버 이미지 제거에 실패했어요.'), 'error'),
    });
  };

  return (
    <section
      aria-label="커버 이미지"
      className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] px-5 py-4 mb-6"
    >
      {/* 제목은 CoverImageUploader가 자체 label로 그린다 — 여기서 또 그리면 같은 글자가 두 번 뜬다. */}
      <CoverImageUploader
        value={tournament.coverImageUrl}
        onSelectFile={(file) => void handleUpload(file)}
        onClear={handleRemove}
        uploading={uploadImages.isPending}
        disabled={!canWrite || updateTournament.isPending}
        eager
      />
    </section>
  );
}

/**
 * 상금·시상 — 이 대회의 상금을 **읽고 고치는 단 한 곳**. 예전에는 위 요약표가
 * prizeSummary 를, 그 아래 긴 글 영역이 prizeBreakdown 을 각각 또 보여줬다.
 */
function PrizeCard({
  tournament,
  canWrite,
  showToast,
}: {
  tournament: V1Tournament;
  canWrite: boolean;
  showToast: (msg: string, v?: 'success' | 'error') => void;
}) {
  const updateTournament = useV1UpdateTournament(tournament.id);

  // 대회 데이터를 prop 으로 받으므로 초기값을 한 번만 계산한다 — 예전에는 렌더 도중
  // setState 로 채우고 `loaded` 플래그로 재진입을 막았다.
  const [prizePool, setPrizePool] = useState(() =>
    tournament.prizePool !== null && tournament.prizePool !== undefined ? String(tournament.prizePool) : '',
  );
  const [prizeSummary, setPrizeSummary] = useState(() => tournament.prizeSummary ?? '');
  // 배분은 구조화 행으로 편집하고 저장 시 기존 텍스트 포맷으로 직렬화한다 (공개 파서 호환).
  // 각 행 값(value)은 자유 텍스트 — 금액("600,000원")이든 물품("우승 트로피")이든 그대로 보관한다.
  const [prizeRows, setPrizeRows] = useState<TournamentPrizeRow[]>(() =>
    parsePrizeRows(tournament.prizeBreakdown ?? '').map((row) => ({
      id: createPrizeRowId(),
      label: row.label,
      value: row.amount,
    })),
  );

  const handleSave = () => {
    const payload: V1UpdateTournamentPayload = {};
    const pool = prizePool.trim();
    if (pool !== '') {
      const n = Number(pool);
      if (Number.isNaN(n) || n < 0) {
        showToast('총상금은 0 이상의 숫자로 입력해주세요.', 'error');
        return;
      }
      payload.prizePool = Math.floor(n);
    }
    if (prizeSummary.trim()) payload.prizeSummary = prizeSummary.trim();
    // 금액 행은 "1,234,567원" 형태로 정규화, 물품 행은 입력한 자유 텍스트 그대로 저장한다.
    const breakdownText = serializeTournamentPrizeRows(prizeRows);
    if (breakdownText) payload.prizeBreakdown = breakdownText;
    if (Object.keys(payload).length === 0) {
      showToast('변경할 상금 정보를 입력해주세요.', 'error');
      return;
    }
    updateTournament.mutate(payload, {
      onSuccess: () => showToast('상금 정보를 저장했어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '상금 정보 저장에 실패했어요.'), 'error'),
    });
  };

  const inputBoxCls = 'w-full text-[13px] border border-[var(--border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-[var(--surface-soft)]';

  return (
    <section
      aria-label="상금·시상 정보"
      className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] px-5 py-4 mb-6 flex flex-col gap-3"
    >
      <div>
        <p className="text-[13px] font-bold text-[var(--text-strong)] m-0">상금·시상 정보</p>
        <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] mt-0.5 mb-0">공개 페이지 &quot;시상·리뷰&quot;의 상금 카드에 그대로 표시돼요.</p>
      </div>
      <PrizeBreakdownEditor
        rows={prizeRows}
        onChange={setPrizeRows}
        prizePool={prizePool}
        onPrizePoolChange={setPrizePool}
        disabled={!canWrite || updateTournament.isPending}
      />

      <div className="flex flex-col gap-2">
        <label htmlFor="info-prize-summary" className="text-[12px] text-[var(--text-body)]">상품 및 상금</label>
        <textarea
          id="info-prize-summary"
          value={prizeSummary}
          onChange={(e) => setPrizeSummary(e.target.value)}
          disabled={!canWrite || updateTournament.isPending}
          rows={2}
          maxLength={500}
          placeholder="예: 우승팀 현금 100만원 + 트로피"
          className={inputBoxCls}
        />
      </div>

      {canWrite && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={updateTournament.isPending}
            className="inline-flex items-center justify-center text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 h-[44px] rounded-xl"
          >
            {updateTournament.isPending ? '저장 중…' : '상금 정보 저장'}
          </button>
        </div>
      )}
    </section>
  );
}
