'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Venue,
  VenueHub,
  VenueScheduleSlot,
  PaginatedResponse,
  CreateVenueReviewInput,
} from '@/types/api';
import { extractData } from './shared';
import { queryKeys } from './query-keys';

// ── Venues ──
export function useVenues(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<Venue>>({
    queryKey: queryKeys.venues.list(params),
    queryFn: async () => {
      const res = await api.get('/venues', { params });
      const data = extractData<PaginatedResponse<Venue> | Venue[]>(res);
      if (Array.isArray(data)) {
        return {
          items: data,
          nextCursor: null,
        };
      }
      return data;
    },
  });
}

export function useVenue(id: string) {
  return useQuery<Venue>({
    queryKey: queryKeys.venues.detail(id),
    queryFn: async () => {
      const res = await api.get(`/venues/${id}`);
      return extractData<Venue>(res);
    },
    enabled: !!id,
  });
}

export function useVenueHub(id: string) {
  return useQuery<VenueHub>({
    queryKey: queryKeys.venues.hub(id),
    queryFn: async () => {
      const res = await api.get(`/venues/${id}/hub`);
      return extractData<VenueHub>(res);
    },
    enabled: !!id,
    retry: 0,
  });
}

export function useUpdateVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Venue> }) => {
      const res = await api.patch(`/venues/${id}`, data);
      return extractData<Venue>(res);
    },
    onSuccess: (_venue, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.venues.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.venues.hub(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.venues.list() });
    },
  });
}

export function useVenueSchedule(id: string) {
  return useQuery<VenueScheduleSlot[]>({
    queryKey: queryKeys.venues.schedule(id),
    queryFn: async () => {
      const res = await api.get(`/venues/${id}/schedule`);
      return extractData<VenueScheduleSlot[]>(res);
    },
    enabled: !!id,
  });
}

export function useCreateVenueReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CreateVenueReviewInput }) => {
      const res = await api.post(`/venues/${id}/reviews`, data);
      return extractData<{ id: string }>(res);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.venues.detail(id) });
    },
  });
}
