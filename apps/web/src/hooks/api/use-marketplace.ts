'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  MarketplaceListing,
  Tournament,
  PaginatedResponse,
  CreateListingInput,
  UpdateListingInput,
  CreateTournamentInput,
} from '@/types/api';
import { extractData } from './shared';
import { queryKeys } from './query-keys';

// ── Marketplace ──
export function useListings(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<MarketplaceListing>>({
    queryKey: queryKeys.listings.list(params),
    queryFn: async () => {
      const res = await api.get('/marketplace/listings', { params });
      return extractData<PaginatedResponse<MarketplaceListing>>(res);
    },
    staleTime: 3 * 60 * 1000,
  });
}

export function useListing(id: string) {
  return useQuery<MarketplaceListing>({
    queryKey: queryKeys.listings.detail(id),
    queryFn: async () => {
      const res = await api.get(`/marketplace/listings/${id}`);
      return extractData<MarketplaceListing>(res);
    },
    enabled: !!id,
  });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateListingInput) => {
      const res = await api.post('/marketplace/listings', data);
      return extractData<MarketplaceListing>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}

export function useUpdateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateListingInput }) => {
      const res = await api.patch(`/marketplace/listings/${id}`, data);
      return extractData<MarketplaceListing>(res);
    },
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.detail(id) });
    },
  });
}

export function useDeleteListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/marketplace/listings/${id}`);
      return { id };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}

export function useCreateMarketplaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (listingId: string) => {
      const res = await api.post(`/marketplace/listings/${listingId}/order`);
      return extractData<{ orderId: string; amount: number }>(res);
    },
    onSuccess: (_, listingId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.detail(listingId) });
    },
  });
}

export function useConfirmMarketplaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, paymentKey }: { orderId: string; paymentKey: string }) => {
      const res = await api.post(`/marketplace/orders/${orderId}/confirm`, { paymentKey });
      return extractData<{ id: string }>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}

// ── Tournaments ──
export function useTournaments(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<Tournament>>({
    queryKey: queryKeys.tournaments.list(params),
    queryFn: async () => {
      const res = await api.get('/tournaments', { params });
      return extractData<PaginatedResponse<Tournament>>(res);
    },
    staleTime: 3 * 60 * 1000,
  });
}

export function useTournament(id: string) {
  return useQuery<Tournament>({
    queryKey: queryKeys.tournaments.detail(id),
    queryFn: async () => {
      const res = await api.get(`/tournaments/${id}`);
      return extractData<Tournament>(res);
    },
    enabled: !!id,
  });
}

export function useCreateTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTournamentInput) => {
      const payload = {
        title: data.title,
        sportType: data.sportType,
        description: data.description,
        startDate: data.eventDate,
        endDate: data.eventDate,
        entryFee: data.entryFee,
        teamId: data.teamId,
        venueId: data.venueId,
      };
      const res = await api.post('/tournaments', payload);
      return extractData<Tournament>(res);
    },
    onSuccess: (_tournament, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tournaments.all });
      if (variables.teamId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.teams.hub(variables.teamId) });
      }
      if (variables.venueId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.venues.hub(variables.venueId) });
      }
    },
  });
}
