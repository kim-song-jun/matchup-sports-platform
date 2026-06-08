import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type TossMode = 'test' | 'live';

export type TossConfirmResult = {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  approvedAt?: string;
  raw: Record<string, unknown>;
};

export type TossCancelResult = {
  paymentKey: string;
  orderId?: string;
  transactionKey?: string;
  status: string;
  cancelAmount: number;
  raw: Record<string, unknown>;
};

@Injectable()
export class TossPaymentsService {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('TOSS_PAYMENTS_BASE_URL') ?? 'https://api.tosspayments.com';
  }

  async confirmPayment(input: { paymentKey: string; orderId: string; amount: number }): Promise<TossConfirmResult> {
    const raw = await this.requestToss('POST', '/v1/payments/confirm', {
      paymentKey: input.paymentKey,
      orderId: input.orderId,
      amount: input.amount,
    });
    return mapTossPayment(raw, input);
  }

  async retrievePayment(input: { paymentKey?: string; orderId?: string }): Promise<TossConfirmResult> {
    const path = input.paymentKey
      ? `/v1/payments/${encodeURIComponent(input.paymentKey)}`
      : `/v1/payments/orders/${encodeURIComponent(input.orderId ?? '')}`;
    const raw = await this.requestToss('GET', path);
    return mapTossPayment(raw, {
      paymentKey: input.paymentKey ?? String(raw.paymentKey ?? ''),
      orderId: input.orderId ?? String(raw.orderId ?? ''),
      amount: Number(raw.totalAmount ?? raw.amount ?? 0),
    });
  }

  async cancelPayment(input: { paymentKey: string; cancelReason: string; cancelAmount: number; idempotencyKey?: string }): Promise<TossCancelResult> {
    const raw = await this.requestToss(
      'POST',
      `/v1/payments/${encodeURIComponent(input.paymentKey)}/cancel`,
      {
        cancelReason: input.cancelReason,
        cancelAmount: input.cancelAmount,
      },
      input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined,
    );
    const lastCancel = Array.isArray(raw.cancels) ? raw.cancels.at(-1) : null;
    return {
      paymentKey: String(raw.paymentKey ?? input.paymentKey),
      orderId: typeof raw.orderId === 'string' ? raw.orderId : undefined,
      transactionKey: typeof lastCancel?.transactionKey === 'string' ? lastCancel.transactionKey : undefined,
      status: String(raw.status ?? 'CANCELED'),
      cancelAmount: input.cancelAmount,
      raw,
    };
  }

  payoutContractUnavailable() {
    return {
      code: 'TOSS_PAYOUT_CONTRACT_REQUIRED',
      message: 'Toss payout requires a separate contracted 지급대행 API, KYC, and encryption/JWE setup.',
    };
  }

  private async requestToss(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>, extraHeaders?: Record<string, string>) {
    const secretKey = this.requireSecretKey();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ServiceUnavailableException({
        code: String(raw.code ?? 'TOSS_PROVIDER_ERROR'),
        message: String(raw.message ?? 'Toss provider request failed'),
      });
    }
    return raw as Record<string, unknown>;
  }

  private requireSecretKey() {
    const secretKey = this.config.get<string>('TOSS_PAYMENTS_SECRET_KEY');
    const clientKey = this.config.get<string>('TOSS_PAYMENTS_CLIENT_KEY');
    if (!secretKey) {
      throw new ServiceUnavailableException({
        code: 'TOSS_SECRET_KEY_REQUIRED',
        message: 'TOSS_PAYMENTS_SECRET_KEY must be configured server-side before calling Toss APIs.',
      });
    }
    this.assertKeyModes(secretKey, clientKey);
    return secretKey;
  }

  private assertKeyModes(secretKey: string, clientKey?: string) {
    const secretMode = detectTossMode(secretKey);
    const clientMode = clientKey ? detectTossMode(clientKey) : undefined;
    const configuredMode = this.config.get<string>('TOSS_PAYMENTS_MODE');
    if (configuredMode && configuredMode !== 'test' && configuredMode !== 'live') {
      throw new ServiceUnavailableException({
        code: 'TOSS_MODE_INVALID',
        message: 'TOSS_PAYMENTS_MODE must be either test or live.',
      });
    }
    if (configuredMode && secretMode && configuredMode !== secretMode) {
      throw new ServiceUnavailableException({
        code: 'TOSS_SECRET_KEY_MODE_MISMATCH',
        message: 'TOSS_PAYMENTS_SECRET_KEY mode does not match TOSS_PAYMENTS_MODE.',
      });
    }
    if (secretMode && clientMode && secretMode !== clientMode) {
      throw new ServiceUnavailableException({
        code: 'TOSS_KEY_PAIR_MODE_MISMATCH',
        message: 'Toss client and secret keys must come from the same test/live mode.',
      });
    }
  }
}

function detectTossMode(key: string): TossMode | null {
  if (key.startsWith('test_')) return 'test';
  if (key.startsWith('live_')) return 'live';
  return null;
}

function mapTossPayment(raw: Record<string, unknown>, fallback: { paymentKey: string; orderId: string; amount: number }): TossConfirmResult {
  return {
    paymentKey: String(raw.paymentKey ?? fallback.paymentKey),
    orderId: String(raw.orderId ?? fallback.orderId),
    status: String(raw.status ?? 'DONE'),
    totalAmount: Number(raw.totalAmount ?? raw.amount ?? fallback.amount),
    approvedAt: typeof raw.approvedAt === 'string' ? raw.approvedAt : undefined,
    raw,
  };
}
