import { Test } from '@nestjs/testing';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { TeamContactsController } from './team-contacts.controller';
import { TeamContactsService } from './team-contacts.service';

const user = {
  id: 'user-1',
  email: 'user@teameet.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('TeamContactsController', () => {
  const teamContactsService = {
    create: jest.fn(),
    listForTeam: jest.fn(),
    detail: jest.fn(),
    accept: jest.fn(),
    decline: jest.fn(),
    withdraw: jest.fn(),
    createBlock: jest.fn(),
    listBlocks: jest.fn(),
    removeBlock: jest.fn(),
    updateContactPolicy: jest.fn(),
  };
  let controller: TeamContactsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [TeamContactsController],
      providers: [
        { provide: TeamContactsService, useValue: teamContactsService },
      ],
    })
      .overrideGuard(V1AuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();
    controller = moduleRef.get(TeamContactsController);
  });

  it('routes block creation to the service', async () => {
    teamContactsService.createBlock.mockResolvedValue({ block: { id: 'block-1' } });
    await expect(
      controller.createBlock(user, 'team-1', { blockedTeamId: 'team-2' }),
    ).resolves.toEqual({ block: { id: 'block-1' } });
    expect(teamContactsService.createBlock).toHaveBeenCalledWith(user, 'team-1', { blockedTeamId: 'team-2' });
  });

  it('routes block listing to the service', async () => {
    teamContactsService.listBlocks.mockResolvedValue({ items: [] });
    await expect(controller.listBlocks(user, 'team-1')).resolves.toEqual({ items: [] });
    expect(teamContactsService.listBlocks).toHaveBeenCalledWith(user, 'team-1');
  });

  it('routes block removal to the service', async () => {
    teamContactsService.removeBlock.mockResolvedValue({ removed: true });
    await expect(controller.removeBlock(user, 'team-1', 'team-2')).resolves.toEqual({ removed: true });
    expect(teamContactsService.removeBlock).toHaveBeenCalledWith(user, 'team-1', 'team-2');
  });

  it('routes contact policy updates to the service', async () => {
    teamContactsService.updateContactPolicy.mockResolvedValue({ id: 'team-1', contactPolicy: 'closed' });
    await expect(
      controller.updateContactPolicy(user, 'team-1', { contactPolicy: 'closed' }),
    ).resolves.toEqual({ id: 'team-1', contactPolicy: 'closed' });
    expect(teamContactsService.updateContactPolicy).toHaveBeenCalledWith(user, 'team-1', { contactPolicy: 'closed' });
  });
});
