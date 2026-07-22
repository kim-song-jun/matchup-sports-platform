import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminTermsService } from './admin-terms.service';
import {
  AdminTermsListQueryDto,
  ChangeAdminTermsDocumentStatusDto,
  CreateAdminTermsPolicyDto,
  CreateAdminTermsVersionDto,
  UpdateAdminTermsDraftDto,
  UpdateAdminTermsPolicyDto,
} from './dto/admin-terms.dto';

@Controller('admin/terms')
@UseGuards(V1AuthGuard)
export class AdminTermsController {
  constructor(private readonly terms: AdminTermsService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser, @Query() query: AdminTermsListQueryDto) {
    return this.terms.list(user, query);
  }

  @Post()
  createPolicy(@CurrentUser() user: V1AuthUser, @Body() dto: CreateAdminTermsPolicyDto) {
    return this.terms.createPolicy(user, dto);
  }

  @Get(':policyId')
  detail(@CurrentUser() user: V1AuthUser, @Param('policyId') policyId: string) {
    return this.terms.detail(user, policyId);
  }

  @Patch(':policyId')
  updatePolicy(
    @CurrentUser() user: V1AuthUser,
    @Param('policyId') policyId: string,
    @Body() dto: UpdateAdminTermsPolicyDto,
  ) {
    return this.terms.updatePolicy(user, policyId, dto);
  }

  @Post(':policyId/documents')
  createVersion(
    @CurrentUser() user: V1AuthUser,
    @Param('policyId') policyId: string,
    @Body() dto: CreateAdminTermsVersionDto,
  ) {
    return this.terms.createVersion(user, policyId, dto);
  }

  @Patch(':policyId/documents/:documentId')
  updateDraft(
    @CurrentUser() user: V1AuthUser,
    @Param('policyId') policyId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateAdminTermsDraftDto,
  ) {
    return this.terms.updateDraft(user, policyId, documentId, dto);
  }

  @Post(':policyId/documents/:documentId/status')
  changeStatus(
    @CurrentUser() user: V1AuthUser,
    @Param('policyId') policyId: string,
    @Param('documentId') documentId: string,
    @Body() dto: ChangeAdminTermsDocumentStatusDto,
  ) {
    return this.terms.changeStatus(user, policyId, documentId, dto);
  }
}
