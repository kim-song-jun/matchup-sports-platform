import 'reflect-metadata';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { BracketTemplateController } from './bracket-template.controller';

describe('BracketTemplateController 라우트 계약', () => {
  it('POST admin/tournaments/:tournamentId/bracket/template, 인증 가드 아래', () => {
    const handler = BracketTemplateController.prototype.apply;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('admin/tournaments/:tournamentId/bracket/template');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(GUARDS_METADATA, BracketTemplateController)).toContain(V1AuthGuard);
  });
});
