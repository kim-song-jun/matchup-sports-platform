import { setupWorker } from 'msw/browser';
import { v1MswHandlers } from './handlers';

export const worker = setupWorker(...v1MswHandlers);
