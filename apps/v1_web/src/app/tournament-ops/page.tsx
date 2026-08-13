import type { Metadata } from 'next';
import { MyStaffAssignmentsClient } from './my-assignments-client';

export const metadata: Metadata = {
  title: '내 대회 운영',
};

/** 스태프 진입점 — 배정받은 대회/경기로 들어가는 출발점. */
export default function TournamentOpsHomePage() {
  return <MyStaffAssignmentsClient />;
}
