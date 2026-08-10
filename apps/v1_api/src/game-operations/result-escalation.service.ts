import { Injectable } from '@nestjs/common';
import { V1EscalationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ResultEscalationActionDto } from './dto/result-escalation.dto';
import { ResultEscalationAccessService } from './result-escalation-access.service';
import { ResultEscalationMutationService } from './result-escalation-mutation.service';
import { escalationView } from './result-escalation.types';

@Injectable()
export class ResultEscalationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ResultEscalationAccessService,
    private readonly mutations: ResultEscalationMutationService,
  ) {}

  async list(userId: string, tournamentId: string, status?: V1EscalationStatus) {
    const role = await this.access.role(this.prisma, userId, tournamentId);
    const rows = await this.access.rows(this.prisma, tournamentId, role, status);
    return { items: rows.map(escalationView) };
  }

  async detail(userId: string, tournamentId: string, escalationId: string) {
    const role = await this.access.role(this.prisma, userId, tournamentId);
    const row = await this.access.row(this.prisma, tournamentId, escalationId, role, false);
    return escalationView(row);
  }

  async listPlatform(userId: string, status?: V1EscalationStatus) {
    await this.access.requirePlatformOps(this.prisma, userId);
    const rows = await this.access.platformRows(this.prisma, status);
    return { items: rows.map(escalationView) };
  }

  async detailPlatform(userId: string, escalationId: string) {
    await this.access.requirePlatformOps(this.prisma, userId);
    const row = await this.access.platformRow(this.prisma, escalationId, false);
    return escalationView(row);
  }

  acknowledge(
    userId: string,
    tournamentId: string,
    escalationId: string,
    dto: ResultEscalationActionDto,
    idempotencyKey: string,
  ) {
    return this.mutations.mutate(
      'ACKNOWLEDGED',
      userId,
      tournamentId,
      escalationId,
      dto,
      idempotencyKey,
    );
  }

  resolve(
    userId: string,
    tournamentId: string,
    escalationId: string,
    dto: ResultEscalationActionDto,
    idempotencyKey: string,
  ) {
    return this.mutations.mutate(
      'RESOLVED',
      userId,
      tournamentId,
      escalationId,
      dto,
      idempotencyKey,
    );
  }

  acknowledgePlatform(
    userId: string,
    escalationId: string,
    dto: ResultEscalationActionDto,
    idempotencyKey: string,
  ) {
    return this.mutations.mutatePlatform(
      'ACKNOWLEDGED',
      userId,
      escalationId,
      dto,
      idempotencyKey,
    );
  }

  resolvePlatform(
    userId: string,
    escalationId: string,
    dto: ResultEscalationActionDto,
    idempotencyKey: string,
  ) {
    return this.mutations.mutatePlatform(
      'RESOLVED',
      userId,
      escalationId,
      dto,
      idempotencyKey,
    );
  }
}
