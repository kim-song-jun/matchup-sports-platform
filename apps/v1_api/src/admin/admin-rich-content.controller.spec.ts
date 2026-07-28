import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

const adminUser = {
  id: 'admin-user-id',
  email: 'admin@teameet.v1',
  accountStatus: 'active',
  onboardingStatus: 'completed',
};

const assetId = '123e4567-e89b-42d3-a456-426614174000';
const assetUrl = `/uploads/2026/07/${assetId}.webp`;

function rawTiptapImageContent() {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: null },
        content: [{
          type: 'text',
          text: 'Image payload',
          marks: [{
            type: 'link',
            attrs: {
              href: '/matches',
              target: '_blank',
              rel: 'noopener noreferrer nofollow',
              class: null,
              title: null,
            },
          }],
        }],
      },
      { type: 'paragraph' },
      {
        type: 'image',
        attrs: {
          assetId,
          src: assetUrl,
          alt: 'Managed image',
          title: null,
          width: null,
          height: null,
        },
      },
    ],
  };
}

describe('Admin rich-content HTTP contract', () => {
  let app: INestApplication;
  const createPopup = jest.fn();
  const createNotice = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{
        provide: AdminService,
        useValue: { createPopup, createNotice },
      }],
    })
      .overrideGuard(V1AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().v1User = adminUser;
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    createPopup.mockResolvedValue({ popup: { popupId: 'popup-created' } });
    createNotice.mockResolvedValue({ notice: { noticeId: 'notice-created' } });
  });

  it('accepts an actual Tiptap image document through POST /admin/popups', async () => {
    const content = rawTiptapImageContent();
    const payload = {
      audience: 'public',
      title: 'Image popup',
      content,
      targetScreens: ['home'],
      status: 'draft',
      displayStartAt: null,
      displayEndAt: null,
    };

    await request(app.getHttpServer())
      .post('/api/v1/admin/popups')
      .send(payload)
      .expect(201);

    expect(createPopup).toHaveBeenCalledWith(
      expect.objectContaining({ id: adminUser.id }),
      expect.objectContaining({ content }),
    );
  });

  it('accepts the same managed image document through POST /admin/notices', async () => {
    const content = rawTiptapImageContent();
    const payload = {
      audience: 'public',
      category: '안내',
      title: 'Image notice',
      content,
      status: 'draft',
    };

    await request(app.getHttpServer())
      .post('/api/v1/admin/notices')
      .send(payload)
      .expect(201);

    expect(createNotice).toHaveBeenCalledWith(
      expect.objectContaining({ id: adminUser.id }),
      expect.objectContaining({ content }),
    );
  });

  it('still rejects unknown top-level popup fields at the HTTP boundary', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/popups')
      .send({
        audience: 'public',
        title: 'Invalid popup',
        content: rawTiptapImageContent(),
        targetScreens: ['home'],
        status: 'draft',
        unknownUiField: true,
      })
      .expect(400);

    expect(createPopup).not.toHaveBeenCalled();
  });
});
