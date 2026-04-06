/// <reference types="vitest/globals" />
import '@testing-library/jest-dom/vitest';
import { server } from './src/test/msw/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
