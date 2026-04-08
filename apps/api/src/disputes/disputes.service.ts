import { Injectable, NotFoundException } from '@nestjs/common';

export type DisputeType = 'no_show' | 'late' | 'level_mismatch' | 'misconduct';
export type DisputeStatus = 'pending' | 'investigating' | 'resolved' | 'dismissed';

interface DisputeHistoryEntry {
  id: string;
  action: string;
  actor: string;
  note: string | null;
  createdAt: Date;
}

interface DisputeTeamSummary {
  id: string;
  name: string;
  captain: string;
  trustScore: number;
  memberCount: number;
}

interface DisputeMatchSummary {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  address: string;
  sport: string;
}

interface DisputeEvidence {
  id: string;
  type: string;
  description: string;
}

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
  reporterTeam: DisputeTeamSummary;
  reportedTeam: DisputeTeamSummary;
  match: DisputeMatchSummary;
  arrivalCheck: {
    reporterArrival: string | null;
    reportedArrival: string | null;
    reporterCheckedIn: boolean;
    reportedCheckedIn: boolean;
  };
  evidence: DisputeEvidence[];
  adminNotes: string;
  history: DisputeHistoryEntry[];
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
      description: '상대팀이 경기 시간까지 도착하지 않았고 연락도 닿지 않았습니다.',
      status: 'pending',
      resolution: null,
      createdAt: new Date('2026-03-15T10:00:00Z'),
      updatedAt: new Date('2026-03-15T10:00:00Z'),
      reporterTeam: {
        id: 'team-001',
        name: 'FC 강남유나이티드',
        captain: '김풋살',
        trustScore: 87,
        memberCount: 8,
      },
      reportedTeam: {
        id: 'team-002',
        name: '서초 FC',
        captain: '이축구',
        trustScore: 62,
        memberCount: 6,
      },
      match: {
        id: 'tm-001',
        date: '2026-03-15',
        startTime: '19:00',
        endTime: '21:00',
        venue: '서울 풋살파크',
        address: '서울시 강남구 테헤란로 123',
        sport: 'futsal',
      },
      arrivalCheck: {
        reporterArrival: '18:45',
        reportedArrival: null,
        reporterCheckedIn: true,
        reportedCheckedIn: false,
      },
      evidence: [
        { id: 'evidence-001', type: 'photo', description: '빈 경기장 사진 (19:40)' },
        { id: 'evidence-002', type: 'chat', description: '연락 시도 캡처' },
      ],
      adminNotes: '',
      history: [
        this.createHistory('reported', 'system', '신고가 접수되었습니다.', '2026-03-15T10:00:00Z'),
      ],
    },
    {
      id: 'dispute-002',
      reporterTeamId: 'team-003',
      reportedTeamId: 'team-004',
      teamMatchId: 'tm-002',
      type: 'misconduct',
      description: '과격한 태클과 욕설이 반복되어 경기를 중단했습니다.',
      status: 'investigating',
      resolution: null,
      createdAt: new Date('2026-03-14T14:30:00Z'),
      updatedAt: new Date('2026-03-16T09:00:00Z'),
      reporterTeam: {
        id: 'team-003',
        name: '마포 킥커즈',
        captain: '박킥',
        trustScore: 91,
        memberCount: 10,
      },
      reportedTeam: {
        id: 'team-004',
        name: '용산 스트라이커즈',
        captain: '최슈팅',
        trustScore: 45,
        memberCount: 7,
      },
      match: {
        id: 'tm-002',
        date: '2026-03-12',
        startTime: '20:00',
        endTime: '22:00',
        venue: '마포 실내체육관',
        address: '서울시 마포구 월드컵로 200',
        sport: 'futsal',
      },
      arrivalCheck: {
        reporterArrival: '19:50',
        reportedArrival: '19:55',
        reporterCheckedIn: true,
        reportedCheckedIn: true,
      },
      evidence: [
        { id: 'evidence-003', type: 'photo', description: '부상 부위 사진' },
        { id: 'evidence-004', type: 'video', description: '경기 영상 캡처' },
        { id: 'evidence-005', type: 'document', description: '진단서' },
      ],
      adminNotes: '양 팀 인터뷰 대기 중입니다.',
      history: [
        this.createHistory('reported', 'system', '신고가 접수되었습니다.', '2026-03-14T14:30:00Z'),
        this.createHistory('investigating', 'admin', '운영 검토를 시작했습니다.', '2026-03-16T09:00:00Z'),
      ],
    },
    {
      id: 'dispute-003',
      reporterTeamId: 'team-005',
      reportedTeamId: 'team-006',
      teamMatchId: 'tm-003',
      type: 'level_mismatch',
      description: '상대팀 전력이 공지와 크게 달랐습니다.',
      status: 'resolved',
      resolution: '양 팀 모두 경고 처리했고 등급 정보를 조정했습니다.',
      createdAt: new Date('2026-03-10T08:00:00Z'),
      updatedAt: new Date('2026-03-12T16:00:00Z'),
      reporterTeam: {
        id: 'team-005',
        name: '성동 유나이티드',
        captain: '최서연',
        trustScore: 76,
        memberCount: 9,
      },
      reportedTeam: {
        id: 'team-006',
        name: 'FC 송파',
        captain: '정대현',
        trustScore: 68,
        memberCount: 8,
      },
      match: {
        id: 'tm-003',
        date: '2026-03-10',
        startTime: '18:00',
        endTime: '20:00',
        venue: '잠실 스포츠센터',
        address: '서울시 송파구 올림픽로 300',
        sport: 'soccer',
      },
      arrivalCheck: {
        reporterArrival: '17:40',
        reportedArrival: '17:45',
        reporterCheckedIn: true,
        reportedCheckedIn: true,
      },
      evidence: [{ id: 'evidence-006', type: 'text', description: '팀 평가 기록' }],
      adminNotes: '재발 시 정지 검토.',
      history: [
        this.createHistory('reported', 'system', '신고가 접수되었습니다.', '2026-03-10T08:00:00Z'),
        this.createHistory('resolved', 'admin', '등급 재조정 및 경고 조치 완료.', '2026-03-12T16:00:00Z'),
      ],
    },
  ];

  private nextId = 4;

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
      reporterTeam: this.buildTeamSummary(data.reporterTeamId, '신고팀'),
      reportedTeam: this.buildTeamSummary(data.reportedTeamId, '피신고팀'),
      match: {
        id: data.teamMatchId,
        date: new Date().toISOString().slice(0, 10),
        startTime: '19:00',
        endTime: '21:00',
        venue: '확인 중',
        address: '주소 확인 중',
        sport: 'futsal',
      },
      arrivalCheck: {
        reporterArrival: null,
        reportedArrival: null,
        reporterCheckedIn: false,
        reportedCheckedIn: false,
      },
      evidence: [],
      adminNotes: '',
      history: [this.createHistory('reported', 'system', '신고가 접수되었습니다.')],
    };
    this.disputes.push(dispute);
    return dispute;
  }

  updateStatus(
    id: string,
    data: { status: DisputeStatus; resolution?: string; note?: string; actor?: string },
  ) {
    const dispute = this.findOne(id);
    dispute.status = data.status;
    if (data.resolution !== undefined) {
      dispute.resolution = data.resolution;
    }
    if (data.note !== undefined) {
      dispute.adminNotes = data.note;
    }
    dispute.updatedAt = new Date();
    dispute.history.push(
      this.createHistory(data.status, data.actor ?? 'admin', data.note ?? data.resolution ?? null),
    );
    return dispute;
  }

  private buildTeamSummary(teamId: string, label: string): DisputeTeamSummary {
    return {
      id: teamId,
      name: `${label} ${teamId.slice(-3)}`,
      captain: '운영 확인 중',
      trustScore: 70,
      memberCount: 7,
    };
  }

  private createHistory(action: string, actor: string, note?: string | null, createdAt?: string) {
    return {
      id: `history-${Math.random().toString(36).slice(2, 8)}`,
      action,
      actor,
      note: note ?? null,
      createdAt: createdAt ? new Date(createdAt) : new Date(),
    };
  }
}
