'use client';

import { createContext } from 'react';

/** Only the approved league + N finals journey loads the reusable time catalogue. */
export const FixtureAssignmentContext = createContext(false);
