import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ChangeMatchStatusDto,
  ChangeTeamMatchStatusDto,
  ChangeTeamStatusDto,
  ChangeUserStatusDto,
  DeleteAdminUserDto,
  GrantAdminDto,
  RenameArchivedTeamDto,
  UpdateAdminDto,
} from './admin.dto';
import { ChangeAdminTermsDocumentStatusDto } from './admin-terms.dto';

type Ctor = new () => object;

const cases: Array<[string, Ctor, Record<string, unknown>]> = [
  ['ChangeUserStatusDto', ChangeUserStatusDto, { status: 'suspended' }],
  ['DeleteAdminUserDto', DeleteAdminUserDto, {}],
  ['ChangeMatchStatusDto', ChangeMatchStatusDto, { status: 'closed' }],
  ['ChangeTeamStatusDto', ChangeTeamStatusDto, { status: 'suspended' }],
  ['RenameArchivedTeamDto', RenameArchivedTeamDto, { name: '새 이름' }],
  ['ChangeTeamMatchStatusDto', ChangeTeamMatchStatusDto, { status: 'closed' }],
  ['UpdateAdminDto', UpdateAdminDto, { status: 'revoked' }],
  ['GrantAdminDto', GrantAdminDto, { userId: '3f1c2b9e-6f0a-4c1e-8f4d-1a2b3c4d5e6f', adminRole: 'ops' }],
  ['ChangeAdminTermsDocumentStatusDto', ChangeAdminTermsDocumentStatusDto, { status: 'published' }],
];

describe.each(cases)('%s reason', (_name, Dto, base) => {
  const check = async (reason: unknown) => {
    const dto = plainToInstance(Dto, { ...base, reason }) as { reason?: string };
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    return { dto, errors };
  };

  it.each(['', '   ', '\n\t '])('rejects blank reason %j', async (reason) => {
    expect((await check(reason)).errors.length).toBeGreaterThan(0);
  });

  it('trims a valid reason', async () => {
    const { dto, errors } = await check('  운영 사유  ');
    expect(errors).toHaveLength(0);
    expect(dto.reason).toBe('운영 사유');
  });
});
