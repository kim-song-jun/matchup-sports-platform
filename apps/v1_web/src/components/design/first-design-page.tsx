import { DesignFrame } from '@/components/design/design-frame';
import type { ReactNode } from 'react';
import {
  SMRevisionAdminMobile,
  SMRevisionApplicantTeamProfileSM1,
  SMRevisionApplicantUserProfileSM1,
  SMRevisionAuthFinalWelcome,
  SMRevisionAuthSM3Login,
  SMRevisionAuthSM3TermsStep,
  SMRevisionAuthSM4Confirm,
  SMRevisionAuthSM4Resume,
  SMRevisionAuthSM5LevelStep,
  SMRevisionAuthSM5RegionStep,
  SMRevisionAuthSM5SignupCompleteGuide,
  SMRevisionAuthSM5SportStep,
  SMRevisionAuthSM5TermsBeforeSignup,
  SMRevisionChatListMobileSM2,
  SMRevisionChatRoomMobileSM2,
  SMRevisionHomeMobileV2,
  SMRevisionHomeNoticeDetailFinal,
  SMRevisionHomeNoticeListFinal,
  SMRevisionHomeSearchFinalMobile,
  SMRevisionHomeSearchFinalNoInputMobile,
  SMRevisionHomeSearchFinalStateMobile,
  SMRevisionLandingMobile,
  SMRevisionMatchCreateConfirmStepSMFinal,
  SMRevisionMatchCreateInfoStepSMFinal,
  SMRevisionMatchCreateListEntrySMFinal,
  SMRevisionMatchCreatePlaceTimeStepSMFinal,
  SMRevisionMatchCreateShareCompleteSMFinal,
  SMRevisionMatchCreateSportStepSMFinal,
  SMRevisionMatchDetailMobileSM3,
  SMRevisionMatchEditSMFinal,
  SMRevisionMatchListMobileSM7,
  SMRevisionMatchParticipantsMobileSM5,
  SMRevisionMatchSM7EmptyTextState,
  SMRevisionMatchSM7FilterSheetOption,
  SMRevisionMatchSM7SearchErrorToastState,
  SMRevisionMyCreatedMatchManageSM1,
  SMRevisionMyMatchesCreatedSM1,
  SMRevisionMyMatchesJoinedSM1,
  SMRevisionMyPageSM1,
  SMRevisionMyTeamDetailSM1,
  SMRevisionMyTeamMembersSM1,
  SMRevisionMyTeamMatchEditSM1,
  SMRevisionMyTeamMatchesSM1,
  SMRevisionMyTeamsSM1,
  SMRevisionNotificationsMobileSM2,
  SMRevisionPaymentMobile,
  SMRevisionProfileReviewMobileSM2,
  SMRevisionProfileStateMobileSM2,
  SMRevisionTeamBrowseDetailSM5,
  SMRevisionTeamBrowseFilterSheetSM5,
  SMRevisionTeamBrowseMobileSM5,
  SMRevisionTeamBrowseSearchMobileSM5,
  SMRevisionTeamMatchCreateConditionStepSMFinal,
  SMRevisionTeamMatchCreateConfirmStepSMFinal,
  SMRevisionTeamMatchCreateInfoStepSMFinal,
  SMRevisionTeamMatchCreateListEntrySMFinal,
  SMRevisionTeamMatchCreatePlaceTimeStepSMFinal,
  SMRevisionTeamMatchCreateShareCompleteSMFinal,
  SMRevisionTeamMatchCreateSportStepSMFinal,
  SMRevisionTeamMatchCreateTeamStepSMFinal,
  SMRevisionTeamMatchDetailMobileSM2,
  SMRevisionTeamMatchEditSMFinal,
  SMRevisionTeamMatchListMobileSM4,
  SMRevisionTeamMatchSM4EmptyTextState,
  SMRevisionTeamMatchSM4FilterSheetOption,
  SMRevisionTeamMatchSM4SearchErrorToastState,
} from '@/design-source/sm-first-design';

export type FirstDesignScreen =
  | 'admin'
  | 'adminAudit'
  | 'applicantTeamProfile'
  | 'applicantUserProfile'
  | 'authConfirm'
  | 'authLevel'
  | 'authLogin'
  | 'authRegion'
  | 'authResume'
  | 'authSignup'
  | 'authSport'
  | 'authTerms'
  | 'authWelcome'
  | 'chatList'
  | 'chatRoom'
  | 'home'
  | 'landing'
  | 'matchCreateComplete'
  | 'matchCreateConfirm'
  | 'matchCreateInfo'
  | 'matchCreatePlaceTime'
  | 'matchCreateSport'
  | 'matchDetail'
  | 'matchEdit'
  | 'matchEmpty'
  | 'matchError'
  | 'matchFilter'
  | 'matchList'
  | 'matchParticipants'
  | 'my'
  | 'myCreatedMatchManage'
  | 'myMatchesCreated'
  | 'myMatchesJoined'
  | 'myTeamDetail'
  | 'myTeamMatchEdit'
  | 'myTeamMatches'
  | 'myTeamMembers'
  | 'myTeams'
  | 'noticeDetail'
  | 'noticeList'
  | 'notifications'
  | 'notificationsRead'
  | 'payment'
  | 'profile'
  | 'profilePrivate'
  | 'search'
  | 'searchEmpty'
  | 'searchError'
  | 'searchNew'
  | 'teamBrowse'
  | 'teamBrowseDetail'
  | 'teamBrowseEmpty'
  | 'teamBrowseError'
  | 'teamBrowseFilter'
  | 'teamMatchCreateComplete'
  | 'teamMatchCreateConfirm'
  | 'teamMatchCreateCondition'
  | 'teamMatchCreateInfo'
  | 'teamMatchCreatePlaceTime'
  | 'teamMatchCreateSport'
  | 'teamMatchCreateTeam'
  | 'teamMatchDetail'
  | 'teamMatchEdit'
  | 'teamMatchEmpty'
  | 'teamMatchError'
  | 'teamMatchFilter'
  | 'teamMatchList';

const screenMap: Record<FirstDesignScreen, { title: string; node: ReactNode }> = {
  admin: { title: '16 admin ops · 1차 디자인 완료', node: <SMRevisionAdminMobile /> },
  adminAudit: { title: '16 admin audit · 1차 디자인 완료', node: <SMRevisionAdminMobile /> },
  applicantTeamProfile: { title: '11 신청 팀 프로필 · 1차 디자인 완료', node: <SMRevisionApplicantTeamProfileSM1 /> },
  applicantUserProfile: { title: '11 신청자 프로필 · 1차 디자인 완료', node: <SMRevisionApplicantUserProfileSM1 /> },
  authConfirm: { title: '02 온보딩 확인 · 1차 디자인 완료', node: <SMRevisionAuthSM4Confirm /> },
  authLevel: { title: '02 온보딩 실력 · 1차 디자인 완료', node: <SMRevisionAuthSM5LevelStep /> },
  authLogin: { title: '02 로그인 · 1차 디자인 완료', node: <SMRevisionAuthSM3Login /> },
  authRegion: { title: '02 온보딩 지역 · 1차 디자인 완료', node: <SMRevisionAuthSM5RegionStep /> },
  authResume: { title: '02 온보딩 이어하기 · 1차 디자인 완료', node: <SMRevisionAuthSM4Resume /> },
  authSignup: { title: '02 가입 · 1차 디자인 완료', node: <SMRevisionAuthSM5SignupCompleteGuide /> },
  authSport: { title: '02 온보딩 종목 · 1차 디자인 완료', node: <SMRevisionAuthSM5SportStep /> },
  authTerms: { title: '02 약관 · 1차 디자인 완료', node: <SMRevisionAuthSM5TermsBeforeSignup /> },
  authWelcome: { title: '02 온보딩 완료 · 1차 디자인 완료', node: <SMRevisionAuthFinalWelcome /> },
  chatList: { title: '10 채팅 목록 · 1차 디자인 완료', node: <SMRevisionChatListMobileSM2 /> },
  chatRoom: { title: '10 채팅방 · 1차 디자인 완료', node: <SMRevisionChatRoomMobileSM2 /> },
  home: { title: '03 홈 · 1차 디자인 완료', node: <SMRevisionHomeMobileV2 /> },
  landing: { title: '14 public marketing · 1차 디자인 완료', node: <SMRevisionLandingMobile /> },
  matchCreateComplete: { title: '06 매치 생성 완료 · 1차 디자인 완료', node: <SMRevisionMatchCreateShareCompleteSMFinal /> },
  matchCreateConfirm: { title: '06 매치 생성 확인 · 1차 디자인 완료', node: <SMRevisionMatchCreateConfirmStepSMFinal /> },
  matchCreateInfo: { title: '06 매치 생성 정보 · 1차 디자인 완료', node: <SMRevisionMatchCreateInfoStepSMFinal /> },
  matchCreatePlaceTime: { title: '06 매치 생성 장소/시간 · 1차 디자인 완료', node: <SMRevisionMatchCreatePlaceTimeStepSMFinal /> },
  matchCreateSport: { title: '06 매치 생성 종목 · 1차 디자인 완료', node: <SMRevisionMatchCreateSportStepSMFinal /> },
  matchDetail: { title: '05 매치 상세 · 1차 디자인 완료', node: <SMRevisionMatchDetailMobileSM3 noTop /> },
  matchEdit: { title: '06 매치 수정 · 1차 디자인 완료', node: <SMRevisionMatchEditSMFinal /> },
  matchEmpty: { title: '05 매치 empty · 1차 디자인 완료', node: <SMRevisionMatchSM7EmptyTextState /> },
  matchError: { title: '05 매치 error · 1차 디자인 완료', node: <SMRevisionMatchSM7SearchErrorToastState /> },
  matchFilter: { title: '05 매치 filter · 1차 디자인 완료', node: <SMRevisionMatchSM7FilterSheetOption /> },
  matchList: { title: '05 매치 목록 · 1차 디자인 완료', node: <SMRevisionMatchListMobileSM7 /> },
  matchParticipants: { title: '05 매치 참여자 · 1차 디자인 완료', node: <SMRevisionMatchParticipantsMobileSM5 noTop /> },
  my: { title: '11 마이 · 1차 디자인 완료', node: <SMRevisionMyPageSM1 /> },
  myCreatedMatchManage: { title: '11 만든 매치 관리 · 1차 디자인 완료', node: <SMRevisionMyCreatedMatchManageSM1 /> },
  myMatchesCreated: { title: '11 만든 매치 · 1차 디자인 완료', node: <SMRevisionMyMatchesCreatedSM1 /> },
  myMatchesJoined: { title: '11 참여한 매치 · 1차 디자인 완료', node: <SMRevisionMyMatchesJoinedSM1 /> },
  myTeamDetail: { title: '11 내 팀 상세 · 1차 디자인 완료', node: <SMRevisionMyTeamDetailSM1 /> },
  myTeamMatchEdit: { title: '11 내 팀매치 수정 · 1차 디자인 완료', node: <SMRevisionMyTeamMatchEditSM1 /> },
  myTeamMatches: { title: '11 내 팀매치 · 1차 디자인 완료', node: <SMRevisionMyTeamMatchesSM1 /> },
  myTeamMembers: { title: '11 내 팀 멤버 · 1차 디자인 완료', node: <SMRevisionMyTeamMembersSM1 /> },
  myTeams: { title: '11 내 팀 · 1차 디자인 완료', node: <SMRevisionMyTeamsSM1 /> },
  noticeDetail: { title: '04 공지 상세 · 1차 디자인 완료', node: <SMRevisionHomeNoticeDetailFinal /> },
  noticeList: { title: '04 공지 목록 · 1차 디자인 완료', node: <SMRevisionHomeNoticeListFinal /> },
  notifications: { title: '10 알림 · 1차 디자인 완료', node: <SMRevisionNotificationsMobileSM2 /> },
  notificationsRead: { title: '10 알림 읽음 · 1차 디자인 완료', node: <SMRevisionNotificationsMobileSM2 readAll /> },
  payment: { title: '12 payment/support deferred · 1차 디자인 완료', node: <SMRevisionPaymentMobile /> },
  profile: { title: '11 프로필 · 1차 디자인 완료', node: <SMRevisionProfileReviewMobileSM2 /> },
  profilePrivate: { title: '11 프로필 공개 상태 · 1차 디자인 완료', node: <SMRevisionProfileStateMobileSM2 /> },
  search: { title: '03 검색 · 1차 디자인 완료', node: <SMRevisionHomeSearchFinalMobile /> },
  searchEmpty: { title: '03 검색 empty · 1차 디자인 완료', node: <SMRevisionHomeSearchFinalStateMobile state="empty" /> },
  searchError: { title: '03 검색 error · 1차 디자인 완료', node: <SMRevisionHomeSearchFinalStateMobile state="error" /> },
  searchNew: { title: '03 검색 신규 · 1차 디자인 완료', node: <SMRevisionHomeSearchFinalNoInputMobile /> },
  teamBrowse: { title: '09 팀 둘러보기 · 1차 디자인 완료', node: <SMRevisionTeamBrowseMobileSM5 /> },
  teamBrowseDetail: { title: '09 팀 상세 · 1차 디자인 완료', node: <SMRevisionTeamBrowseDetailSM5 /> },
  teamBrowseEmpty: { title: '09 팀 empty · 1차 디자인 완료', node: <SMRevisionTeamBrowseSearchMobileSM5 state="empty" /> },
  teamBrowseError: { title: '09 팀 error · 1차 디자인 완료', node: <SMRevisionTeamBrowseSearchMobileSM5 state="error" /> },
  teamBrowseFilter: { title: '09 팀 filter · 1차 디자인 완료', node: <SMRevisionTeamBrowseFilterSheetSM5 /> },
  teamMatchCreateComplete: { title: '08 팀매치 생성 완료 · 1차 디자인 완료', node: <SMRevisionTeamMatchCreateShareCompleteSMFinal /> },
  teamMatchCreateConfirm: { title: '08 팀매치 생성 확인 · 1차 디자인 완료', node: <SMRevisionTeamMatchCreateConfirmStepSMFinal /> },
  teamMatchCreateCondition: { title: '08 팀매치 생성 조건 · 1차 디자인 완료', node: <SMRevisionTeamMatchCreateConditionStepSMFinal /> },
  teamMatchCreateInfo: { title: '08 팀매치 생성 정보 · 1차 디자인 완료', node: <SMRevisionTeamMatchCreateInfoStepSMFinal /> },
  teamMatchCreatePlaceTime: { title: '08 팀매치 생성 장소/시간 · 1차 디자인 완료', node: <SMRevisionTeamMatchCreatePlaceTimeStepSMFinal /> },
  teamMatchCreateSport: { title: '08 팀매치 생성 종목 · 1차 디자인 완료', node: <SMRevisionTeamMatchCreateSportStepSMFinal /> },
  teamMatchCreateTeam: { title: '08 팀매치 생성 팀 선택 · 1차 디자인 완료', node: <SMRevisionTeamMatchCreateTeamStepSMFinal /> },
  teamMatchDetail: { title: '07 팀매치 상세 · 1차 디자인 완료', node: <SMRevisionTeamMatchDetailMobileSM2 /> },
  teamMatchEdit: { title: '08 팀매치 수정 · 1차 디자인 완료', node: <SMRevisionTeamMatchEditSMFinal /> },
  teamMatchEmpty: { title: '07 팀매치 empty · 1차 디자인 완료', node: <SMRevisionTeamMatchSM4EmptyTextState /> },
  teamMatchError: { title: '07 팀매치 error · 1차 디자인 완료', node: <SMRevisionTeamMatchSM4SearchErrorToastState /> },
  teamMatchFilter: { title: '07 팀매치 filter · 1차 디자인 완료', node: <SMRevisionTeamMatchSM4FilterSheetOption /> },
  teamMatchList: { title: '07 팀매치 목록 · 1차 디자인 완료', node: <SMRevisionTeamMatchListMobileSM4 /> },
};

export function FirstDesignPage({ screen }: { screen: FirstDesignScreen }) {
  const item = screenMap[screen];
  return <DesignFrame title={item.title}>{item.node}</DesignFrame>;
}
