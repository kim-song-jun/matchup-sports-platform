import { Injectable, NotFoundException } from '@nestjs/common';

export type DisputeType = 'no_show' | 'late' | 'level_mismatch' | 'misconduct';
export type DisputeStatus = 'pending' | 'investigating' | 'resolved' | 'dismissed';

export interface Dispute {
  id: string;
  reporterTeamId: string;
  reportedTeamId: string;
  teamMatchId: string;
  type: DisputeType;
  description: string;
  status: DisputeStatus;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DisputesService {
  private disputes: Dispute[] = [
    {
      id: 'dispute-001',
      reporterTeamId: 'team-001',
      reportedTeamId: 'team-002',
      teamMatchId: 'tm-001',
      type: 'no_show',
      description: '상대팀이 경기 시간에 나타나지 않았습니다.',
      status: 'pending',
      resolution: null,
      createdAt: new Date('2026-03-15T10:00:00Z'),
      updatedAt: new Date('2026-03-15T10:00:00Z'),
    },
    {
      id: 'dispute-002',
      reporterTeamId: 'team-003',
      reportedTeamId: 'team-004',
      teamMatchId: 'tm-002',
      type: 'misconduct',
      description: '상대팀 선수가 경기 중 과격한 행동을 했습니다.',
      status: 'investigating',
      resolution: null,
      createdAt: new Date('2026-03-14T14:30:00Z'),
      updatedAt: new Date('2026-03-16T09:00:00Z'),
    },
    {
      id: 'dispute-003',
      reporterTeamId: 'team-005',
      reportedTeamId: 'team-006',
      teamMatchId: 'tm-003',
      type: 'level_mismatch',
      description: '상대팀 실력이 등록된 레벨과 크게 차이가 났습니다.',
      status: 'resolved',
      resolution: '양 팀에게 경고 조치 및 레벨 재조정 완료',
      createdAt: new Date('2026-03-10T08:00:00Z'),
      updatedAt: new Date('2026-03-12T16:00:00Z'),
    },
    {
      id: 'dispute-004',
      reporterTeamId: 'team-007',
      reportedTeamId: 'team-008',
      teamMatchId: 'tm-004',
      type: 'late',
      description: '상대팀이 30분 이상 지각하여 경기 시간이 부족했습니다.',
      status: 'dismissed',
      resolution: '증거 불충분으로 기각',
      createdAt: new Date('2026-03-08T11:00:00Z'),
      updatedAt: new Date('2026-03-09T15:00:00Z'),
    },
    {
      id: 'dispute-005',
      reporterTeamId: 'team-009',
      reportedTeamId: 'team-010',
      teamMatchId: 'tm-005',
      type: 'no_show',
      description: '매치 당일 상대팀이 연락 없이 불참했습니다.',
      status: 'pending',
      resolution: null,
      createdAt: new Date('2026-03-20T09:00:00Z'),
      updatedAt: new Date('2026-03-20T09:00:00Z'),
    },
  ];

  private nextId = 6;

  findAll(filter: { status?: string; type?: string }) {
    let result = [...this.disputes];

    if (filter.status) {
      result = result.filter((d) => d.status === filter.status);
    }
    if (filter.type) {
      result = result.filter((d) => d.type === filter.type);
    }

    return { items: result, total: result.length };
  }

  findOne(id: string) {
    const dispute = this.disputes.find((d) => d.id === id);
    if (!dispute) {
      throw new NotFoundException(`분쟁 ${id}을(를) 찾을 수 없습니다.`);
    }
    return dispute;
  }

  create(data: {
    reporterTeamId: string;
    reportedTeamId: string;
    teamMatchId: string;
    type: DisputeType;
    description: string;
  }) {
    const dispute: Dispute = {
      id: `dispute-${String(this.nextId++).padStart(3, '0')}`,
      reporterTeamId: data.reporterTeamId,
      reportedTeamId: data.reportedTeamId,
      teamMatchId: data.teamMatchId,
      type: data.type,
      description: data.description,
      status: 'pending',
      resolution: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.disputes.push(dispute);
    return dispute;
  }

  updateStatus(id: string, data: { status: DisputeStatus; resolution?: string }) {
    const dispute = this.findOne(id);
    dispute.status = data.status;
    if (data.resolution !== undefined) {
      dispute.resolution = data.resolution;
    }
    dispute.updatedAt = new Date();
    return dispute;
  }
}
