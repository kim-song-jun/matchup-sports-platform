'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { v1Api, v1Get, v1Post, v1Put, v1Patch, v1Delete, v1MultipartPost } from '@/lib/api-client';

/** An explicit data dependency, scoped to a React subtree; never replaces global fetch or auth. */
export const liveV1DataSource = {
  get v1Api() { return v1Api; }, get v1Get() { return v1Get; },
  get v1Post() { return v1Post; }, get v1Put() { return v1Put; },
  get v1Patch() { return v1Patch; }, get v1Delete() { return v1Delete; },
  get v1MultipartPost() { return v1MultipartPost; },
};
export type V1DataSource = typeof liveV1DataSource;
const V1DataSourceContext = createContext<V1DataSource>(liveV1DataSource);

export function V1DataSourceProvider({ source, children }: { source: V1DataSource; children: ReactNode }) {
  return <V1DataSourceContext.Provider value={source}>{children}</V1DataSourceContext.Provider>;
}

export function useV1DataSource(): V1DataSource {
  return useContext(V1DataSourceContext);
}
