import { setupServer } from 'msw/node';
import { v1MswHandlers } from './handlers';

export const server = setupServer(...v1MswHandlers);
