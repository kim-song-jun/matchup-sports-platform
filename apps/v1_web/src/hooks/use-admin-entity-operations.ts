import { useQuery } from '@tanstack/react-query';
import { v1Get } from '@/lib/api-client';

export type AdminOperationSection = 'history' | 'inquiries' | 'matches' | 'competitions' | 'appearances' | 'upcoming';
export type AdminOperationItem = {
  id: string; title: string; href: string | null; status: string; at: string | null;
  description: string | null; actor?: string | null; fromStatus?: string | null; reason?: string | null;
};
export type AdminOperationsPage = {
  items: AdminOperationItem[];
  pageInfo: { page: number; pageSize: number; total: number; hasNext: boolean };
};
export type AdminOperationsContext = {
  kind: 'user'; signupStage: string; missingItems: string[]; pendingRequiredDocumentIds: string[];
  deletionFinalized: boolean; withdrawalScheduledAt: string | null;
} | {
  kind: 'team'; ownerAccountStatus: string; ownerLastLoginAt: string | null;
  pendingJoinCount: number; lastPlayedAt: string | null;
};

export function useAdminOperationsContext(entity: 'users' | 'teams', id: string) {
  return useQuery({ queryKey: ['v1', 'admin', entity, id, 'operations'],
    queryFn: () => v1Get<AdminOperationsContext>(`/admin/${entity}/${encodeURIComponent(id)}/operations`), enabled: Boolean(id) });
}

export function useAdminOperations(entity: 'users' | 'teams', id: string, section: AdminOperationSection, page: number) {
  return useQuery({ queryKey: ['v1', 'admin', entity, id, 'operations', section, page],
    queryFn: () => v1Get<AdminOperationsPage>(`/admin/${entity}/${encodeURIComponent(id)}/operations/${section}`, { page }), enabled: Boolean(id) });
}
