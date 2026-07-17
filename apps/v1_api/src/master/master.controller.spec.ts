import { Test } from '@nestjs/testing';
import { MasterController } from './master.controller';
import { MasterService } from './master.service';

describe('MasterController', () => {
  const masterService = {
    getSports: jest.fn(),
    getRegions: jest.fn(),
    resolveLocation: jest.fn(),
  };

  let controller: MasterController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [MasterController],
      providers: [{ provide: MasterService, useValue: masterService }],
    }).compile();

    controller = moduleRef.get(MasterController);
  });

  it('returns active sports with levels', async () => {
    masterService.getSports.mockResolvedValue({
      sports: [{ id: 'sport-1', code: 'running', name: '러닝', levels: [] }],
    });

    await expect(controller.getSports()).resolves.toEqual({
      sports: [{ id: 'sport-1', code: 'running', name: '러닝', levels: [] }],
    });
  });

  it('returns active region tree', async () => {
    masterService.getRegions.mockResolvedValue({
      regions: [{ id: 'region-1', code: 'seoul', name: '서울', level: 1, children: [] }],
    });

    await expect(controller.getRegions()).resolves.toEqual({
      regions: [{ id: 'region-1', code: 'seoul', name: '서울', level: 1, children: [] }],
    });
  });

  it('resolves coordinates to a region', async () => {
    masterService.resolveLocation.mockResolvedValue({
      region: { id: 'region-2', code: 'seoul-gangnam', name: '강남구', level: 2 },
      source: 'nearest',
      distanceMeters: 1200,
    });

    await expect(controller.resolveLocation({
      locationConsentAccepted: true,
      latitude: 37.5172,
      longitude: 127.0473,
    })).resolves.toEqual({
      region: { id: 'region-2', code: 'seoul-gangnam', name: '강남구', level: 2 },
      source: 'nearest',
      distanceMeters: 1200,
    });
  });
});
