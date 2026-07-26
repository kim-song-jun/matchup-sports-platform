import { setupWorker } from 'msw/browser';
import { v1MswHandlers } from './handlers';
import { v1TournamentCampaignMswHandlers } from './tournament-campaign-handlers';

export const worker = setupWorker(...v1MswHandlers, ...v1TournamentCampaignMswHandlers);
