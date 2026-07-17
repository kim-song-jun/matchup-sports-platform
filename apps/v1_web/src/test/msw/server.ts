import { setupServer } from 'msw/node';
import { v1MswHandlers } from './handlers';
import { v1TournamentCampaignMswHandlers } from './tournament-campaign-handlers';

export const server = setupServer(...v1MswHandlers, ...v1TournamentCampaignMswHandlers);
