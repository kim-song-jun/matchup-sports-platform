'use client';

import { useMemo } from 'react';
import {
  useV1MyMatches,
  useV1MyTeams,
  useV1MyTeamMatches,
  useV1Notifications,
  useV1Profile,
  useV1Reviews,
  useV1TeamJoinApplications,
} from '@/hooks/use-v1-api';
import { AdminAuditPageView, AdminDashboardPageView } from './admin-page';
import { firstErrorMessage, myTeamItems, queryState } from './admin.client-utils';
import { toAdminActivityModel, toAdminDashboardModel } from './admin.view-model';

export function AdminDashboardPageClient() {
  const profile = useV1Profile();
  const teams = useV1MyTeams({ permission: 'manage_team' });
  const createdMatches = useV1MyMatches({ mode: 'created', limit: 8 });
  const teamMatches = useV1MyTeamMatches({ scope: 'all', limit: 8 });
  const notifications = useV1Notifications({ limit: 6 });
  const pendingReviews = useV1Reviews({ tab: 'pending', limit: 6 });
  const managedTeams = useMemo(() => myTeamItems(teams.data), [teams.data]);
  const primaryTeamId = managedTeams[0]?.teamId ?? '';
  const joinRequests = useV1TeamJoinApplications(primaryTeamId, { status: 'requested', limit: 6 }, { enabled: Boolean(primaryTeamId) });
  const model = useMemo(
    () =>
      toAdminDashboardModel({
        profile: profile.data,
        teams: managedTeams,
        createdMatches: createdMatches.data?.items ?? [],
        teamMatches: teamMatches.data?.items ?? [],
        joinRequests: joinRequests.data?.items ?? [],
        notifications: notifications.data?.items ?? [],
        unreadNotificationCount: notifications.data?.unreadCount ?? 0,
        pendingReviews: pendingReviews.data?.items ?? [],
        states: [
          queryState(profile.isPending, profile.isError),
          queryState(teams.isPending, teams.isError),
          queryState(createdMatches.isPending, createdMatches.isError),
          queryState(teamMatches.isPending, teamMatches.isError),
          queryState(notifications.isPending, notifications.isError),
          queryState(pendingReviews.isPending, pendingReviews.isError),
          primaryTeamId ? queryState(joinRequests.isPending, joinRequests.isError) : 'ready',
        ],
        errorMessage: firstErrorMessage([
          profile.error,
          teams.error,
          createdMatches.error,
          teamMatches.error,
          notifications.error,
          pendingReviews.error,
          joinRequests.error,
        ]),
      }),
    [
      createdMatches.data,
      createdMatches.error,
      createdMatches.isError,
      createdMatches.isPending,
      joinRequests.data,
      joinRequests.error,
      joinRequests.isError,
      joinRequests.isPending,
      managedTeams,
      notifications.data,
      notifications.error,
      notifications.isError,
      notifications.isPending,
      pendingReviews.data,
      pendingReviews.error,
      pendingReviews.isError,
      pendingReviews.isPending,
      primaryTeamId,
      profile.data,
      profile.error,
      profile.isError,
      profile.isPending,
      teamMatches.data,
      teamMatches.error,
      teamMatches.isError,
      teamMatches.isPending,
      teams.error,
      teams.isError,
      teams.isPending,
    ],
  );

  return <AdminDashboardPageView model={model} onRetry={() => {
    void profile.refetch();
    void teams.refetch();
    void createdMatches.refetch();
    void teamMatches.refetch();
    void notifications.refetch();
    void pendingReviews.refetch();
    void joinRequests.refetch();
  }} />;
}

export function AdminAuditPageClient() {
  const profile = useV1Profile();
  const createdMatches = useV1MyMatches({ mode: 'created', limit: 12 });
  const teamMatches = useV1MyTeamMatches({ scope: 'all', limit: 12 });
  const notifications = useV1Notifications({ limit: 12 });
  const pendingReviews = useV1Reviews({ tab: 'pending', limit: 12 });
  const model = useMemo(
    () =>
      toAdminActivityModel({
        profile: profile.data,
        createdMatches: createdMatches.data?.items ?? [],
        teamMatches: teamMatches.data?.items ?? [],
        notifications: notifications.data?.items ?? [],
        pendingReviews: pendingReviews.data?.items ?? [],
        states: [
          queryState(profile.isPending, profile.isError),
          queryState(createdMatches.isPending, createdMatches.isError),
          queryState(teamMatches.isPending, teamMatches.isError),
          queryState(notifications.isPending, notifications.isError),
          queryState(pendingReviews.isPending, pendingReviews.isError),
        ],
        errorMessage: firstErrorMessage([
          profile.error,
          createdMatches.error,
          teamMatches.error,
          notifications.error,
          pendingReviews.error,
        ]),
      }),
    [
      createdMatches.data,
      createdMatches.error,
      createdMatches.isError,
      createdMatches.isPending,
      notifications.data,
      notifications.error,
      notifications.isError,
      notifications.isPending,
      pendingReviews.data,
      pendingReviews.error,
      pendingReviews.isError,
      pendingReviews.isPending,
      profile.data,
      profile.error,
      profile.isError,
      profile.isPending,
      teamMatches.data,
      teamMatches.error,
      teamMatches.isError,
      teamMatches.isPending,
    ],
  );

  return <AdminAuditPageView model={model} onRetry={() => {
    void profile.refetch();
    void createdMatches.refetch();
    void teamMatches.refetch();
    void notifications.refetch();
    void pendingReviews.refetch();
  }} />;
}
