import { Injectable, NotFoundException } from '@nestjs/common';

export type SettlementStatus = 'pending' | 'processed' | 'refunded' | 'failed';
export type SettlementType = 'match_fee' | 'lesson_fee' | 'mercenary_fee' | 'venue_rental';

interface SettlementHistoryEntry {
  id: string;
  action: string;
  actor: string;
  note: string | null;
  createdAt: Date;
}

export interface Settlement {
  id: string;
  type: SettlementType;
  status: SettlementStatus;
  amount: number;
  commission: number;
  netAmount: number;
  payerName: string;
  recipientName: string;
  relatedId: string;
  description: string;
  createdAt: Date;
  processedAt: Date | null;
  failureReason: string | null;
  history: SettlementHistoryEntry[];
}

@Injectable()
export class SettlementsService {
  private settlements: Settlement[] = [
    {
      id: 'settle-001',
      type: 'match_fee',
      status: 'processed',
      amount: 50000,
      commission: 5000,
      netAmount: 45000,
      payerName: 'FC 서울 유나이티드',
      recipientName: '구장 A 관리자',
      relatedId: 'tm-001',
      description: '3/15 풋살 매치 참가비',
      createdAt: new Date('2026-03-15T12:00:00Z'),
      processedAt: new Date('2026-03-16T10:00:00Z'),
      failureReason: null,
      history: [this.createHistory('approve', 'admin', '정산 승인 완료', '2026-03-16T10:00:00Z')],
    },
    {
      id: 'settle-002',
      type: 'lesson_fee',
      status: 'processed',
      amount: 80000,
      commission: 8000,
      netAmount: 72000,
      payerName: '김민수',
      recipientName: '코치 박진영',
      relatedId: 'lesson-001',
      description: '3/14 농구 레슨비',
      createdAt: new Date('2026-03-14T15:00:00Z'),
      processedAt: new Date('2026-03-15T09:00:00Z'),
      failureReason: null,
      history: [this.createHistory('approve', 'admin', '정산 승인 완료', '2026-03-15T09:00:00Z')],
    },
    {
      id: 'settle-003',
      type: 'mercenary_fee',
      status: 'pending',
      amount: 30000,
      commission: 3000,
      netAmount: 27000,
      payerName: 'FC 강남',
      recipientName: '용병 이정훈',
      relatedId: 'merc-001',
      description: '3/18 풋살 용병비',
      createdAt: new Date('2026-03-18T10:00:00Z'),
      processedAt: null,
      failureReason: null,
      history: [],
    },
    {
      id: 'settle-004',
      type: 'venue_rental',
      status: 'processed',
      amount: 120000,
      commission: 12000,
      netAmount: 108000,
      payerName: 'FC 한강',
      recipientName: '스포츠파크 B',
      relatedId: 'venue-booking-001',
      description: '3/12 구장 대관료',
      createdAt: new Date('2026-03-12T08:00:00Z'),
      processedAt: new Date('2026-03-13T11:00:00Z'),
      failureReason: null,
      history: [this.createHistory('approve', 'admin', '정산 승인 완료', '2026-03-13T11:00:00Z')],
    },
    {
      id: 'settle-005',
      type: 'match_fee',
      status: 'refunded',
      amount: 50000,
      commission: 0,
      netAmount: 0,
      payerName: 'FC 잠실',
      recipientName: '구장 C 관리자',
      relatedId: 'tm-003',
      description: '3/10 매치 취소 환불',
      createdAt: new Date('2026-03-10T09:00:00Z'),
      processedAt: new Date('2026-03-10T14:00:00Z'),
      failureReason: null,
      history: [this.createHistory('refund', 'admin', '취소 환불 처리 완료', '2026-03-10T14:00:00Z')],
    },
    {
      id: 'settle-006',
      type: 'lesson_fee',
      status: 'pending',
      amount: 60000,
      commission: 6000,
      netAmount: 54000,
      payerName: '박영희',
      recipientName: '코치 최은지',
      relatedId: 'lesson-002',
      description: '3/20 배드민턴 레슨비',
      createdAt: new Date('2026-03-20T11:00:00Z'),
      processedAt: null,
      failureReason: null,
      history: [],
    },
    {
      id: 'settle-007',
      type: 'mercenary_fee',
      status: 'failed',
      amount: 25000,
      commission: 2500,
      netAmount: 22500,
      payerName: 'FC 목동',
      recipientName: '용병 김태호',
      relatedId: 'merc-002',
      description: '3/17 풋살 용병비 - 결제 실패',
      createdAt: new Date('2026-03-17T13:00:00Z'),
      processedAt: new Date('2026-03-17T16:00:00Z'),
      failureReason: '정산 계좌 검증 실패',
      history: [this.createHistory('reject', 'admin', '정산 계좌 확인 필요', '2026-03-17T16:00:00Z')],
    },
    {
      id: 'settle-008',
      type: 'venue_rental',
      status: 'pending',
      amount: 150000,
      commission: 15000,
      netAmount: 135000,
      payerName: 'FC 송파',
      recipientName: '아이스링크 D',
      relatedId: 'venue-booking-002',
      description: '3/21 아이스하키 구장 대관료',
      createdAt: new Date('2026-03-21T07:00:00Z'),
      processedAt: null,
      failureReason: null,
      history: [],
    },
  ];

  findAll(filter: { status?: string; type?: string }) {
    let result = [...this.settlements];

    if (filter.status) {
      result = result.filter((s) => s.status === filter.status);
    }
    if (filter.type) {
      result = result.filter((s) => s.type === filter.type);
    }

    return { items: result, total: result.length };
  }

  getSummary() {
    const total = this.settlements.reduce((sum, s) => sum + s.amount, 0);
    const commission = this.settlements
      .filter((s) => s.status === 'processed')
      .reduce((sum, s) => sum + s.commission, 0);
    const pending = this.settlements
      .filter((s) => s.status === 'pending')
      .reduce((sum, s) => sum + s.amount, 0);
    const refunded = this.settlements
      .filter((s) => s.status === 'refunded')
      .reduce((sum, s) => sum + s.amount, 0);

    return {
      total,
      commission,
      pending,
      refunded,
      processedCount: this.settlements.filter((s) => s.status === 'processed').length,
      pendingCount: this.settlements.filter((s) => s.status === 'pending').length,
      refundedCount: this.settlements.filter((s) => s.status === 'refunded').length,
      failedCount: this.settlements.filter((s) => s.status === 'failed').length,
    };
  }

  process(id: string, data: { action: string; note?: string; actor?: string }) {
    const settlement = this.settlements.find((s) => s.id === id);
    if (!settlement) {
      throw new NotFoundException(`정산 ${id}을(를) 찾을 수 없습니다.`);
    }

    if (data.action === 'approve') {
      settlement.status = 'processed';
      settlement.failureReason = null;
      settlement.processedAt = new Date();
    } else if (data.action === 'refund') {
      settlement.status = 'refunded';
      settlement.commission = 0;
      settlement.netAmount = 0;
      settlement.failureReason = null;
      settlement.processedAt = new Date();
    } else if (data.action === 'reject') {
      settlement.status = 'failed';
      settlement.failureReason = data.note ?? '운영자 반려';
      settlement.processedAt = new Date();
    }

    settlement.history.push(
      this.createHistory(data.action, data.actor ?? 'admin', data.note ?? null),
    );

    return settlement;
  }

  private createHistory(action: string, actor: string, note?: string | null, createdAt?: string) {
    return {
      id: `settlement-history-${Math.random().toString(36).slice(2, 8)}`,
      action,
      actor,
      note: note ?? null,
      createdAt: createdAt ? new Date(createdAt) : new Date(),
    };
  }
}
