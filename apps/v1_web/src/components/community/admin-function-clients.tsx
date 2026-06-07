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
import {
  AdminMatchesPageView,
  AdminNotificationsPageView,
  AdminReviewsPageView,
  AdminTeamMatchesPageView,
  AdminTeamsPageView,
} from './admin-function-pages';
import { firstErrorMessage, myTeamItems, queryState } from './admin.client-utils';
import {
  toAdminMatchesPageModel,
  toAdminNotificationsPageModel,
  toAdminReviewsPageModel,
  toAdminTeamMatchesPageModel,
  toAdminTeamsPageModel,
} from './admin.function-view-model';

export function AdminMatchesPageClient() {
  const profile = useV1Profile();
  const matches = useV1MyMatches({ mode: 'created', limit: 24 });
  const model = useMemo(() => toAdminMatchesPageModel({
    profile: profile.data,
    matches: matches.data?.items ?? [],
    states: [queryState(profile.isPending, profile.isError), queryState(matches.isPending, matches.isError)],
    errorMessage: firstErrorMessage([profile.error, matches.error]),
  }), [matches.data, matches.error, matches.isError, matches.isPending, profile.data, profile.error, profile.isError, profile.isPending]);
  return <AdminMatchesPageView model={model} onRetry={() => { void profile.refetch(); void matches.refetch(); }} />;
}

export function AdminTeamMatchesPageClient() {
  const profile = useV1Profile();
  const teamMatches = useV1MyTeamMatches({ scope: 'all', limit: 24 });
  const model = useMemo(() => toAdminTeamMatchesPageModel({
    profile: profile.data,
    teamMatches: teamMatches.data?.items ?? [],
    states: [queryState(profile.isPending, profile.isError), queryState(teamMatches.isPending, teamMatches.isError)],
    errorMessage: firstErrorMessage([profile.error, teamMatches.error]),
  }), [profile.data, profile.error, profile.isError, profile.isPending, teamMatches.data, teamMatches.error, teamMatches.isError, teamMatches.isPending]);
  return <AdminTeamMatchesPageView model={model} onRetry={() => { void profile.refetch(); void teamMatches.refetch(); }} />;
}

export function AdminTeamsPageClient() {
  const profile = useV1Profile();
  const teams = useV1MyTeams({ permission: 'manage_team' });
  const managedTeams = useMemo(() => myTeamItems(teams.data), [teams.data]);
  const primaryTeamId = managedTeams[0]?.teamId ?? '';
  const joinRequests = useV1TeamJoinApplications(primaryTeamId, { status: 'requested', limit: 12 }, { enabled: Boolean(primaryTeamId) });
  const model = useMemo(() => toAdminTeamsPageModel({
    profile: profile.data,
    teams: managedTeams,
    joinRequests: joinRequests.data?.items ?? [],
    states: [
      queryState(profile.isPending, profile.isError),
      queryState(teams.isPending, teams.isError),
      primaryTeamId ? queryState(joinRequests.isPending, joinRequests.isError) : 'ready',
    ],
    errorMessage: firstErrorMessage([profile.error, teams.error, joinRequests.error]),
  }), [
    joinRequests.data,
    joinRequests.error,
    joinRequests.isError,
    joinRequests.isPending,
    managedTeams,
    primaryTeamId,
    profile.data,
    profile.error,
    profile.isError,
    profile.isPending,
    teams.error,
    teams.isError,
    teams.isPending,
  ]);
  return <AdminTeamsPageView model={model} onRetry={() => {
    void profile.refetch();
    void teams.refetch();
    if (primaryTeamId) void joinRequests.refetch();
  }} />;
}

export function AdminReviewsPageClient() {
  const profile = useV1Profile();
  const reviews = useV1Reviews({ tab: 'pending', limit: 24 });
  const model = useMemo(() => toAdminReviewsPageModel({
    profile: profile.data,
    pendingReviews: reviews.data?.items ?? [],
    states: [queryState(profile.isPending, profile.isError), queryState(reviews.isPending, reviews.isError)],
    errorMessage: firstErrorMessage([profile.error, reviews.error]),
  }), [profile.data, profile.error, profile.isError, profile.isPending, reviews.data, reviews.error, reviews.isError, reviews.isPending]);
  return <AdminReviewsPageView model={model} onRetry={() => { void profile.refetch(); void reviews.refetch(); }} />;
}

export function AdminNotificationsPageClient() {
  const profile = useV1Profile();
  const notifications = useV1Notifications({ limit: 30 });
  const model = useMemo(() => toAdminNotificationsPageModel({
    profile: profile.data,
    notifications: notifications.data?.items ?? [],
    states: [queryState(profile.isPending, profile.isError), queryState(notifications.isPending, notifications.isError)],
    errorMessage: firstErrorMessage([profile.error, notifications.error]),
  }), [notifications.data, notifications.error, notifications.isError, notifications.isPending, profile.data, profile.error, profile.isError, profile.isPending]);
  return <AdminNotificationsPageView model={model} onRetry={() => { void profile.refetch(); void notifications.refetch(); }} />;
}
