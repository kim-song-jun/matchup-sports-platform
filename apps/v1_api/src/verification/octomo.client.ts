import { Injectable, Logger } from '@nestjs/common';

export class OctomoDisabledError extends Error {
  constructor() {
    super('OCTOMO_API_KEY is not configured');
    this.name = 'OctomoDisabledError';
  }
}

export class OctomoApiError extends Error {
  constructor(readonly status: number, body: string) {
    super(`Octomo API error: ${status} ${body}`.slice(0, 300));
    this.name = 'OctomoApiError';
  }
}

export interface OctomoQrOptions {
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  margin?: number;
  width?: number;
}

@Injectable()
export class OctomoClient {
  private readonly logger = new Logger(OctomoClient.name);

  private get apiKey(): string {
    return process.env.OCTOMO_API_KEY ?? '';
  }

  private get baseUrl(): string {
    return process.env.OCTOMO_API_BASE ?? 'https://api.octoverse.kr';
  }

  get enabled(): boolean {
    return this.apiKey.length > 0;
  }

  async messageExists(mobileNum: string, text: string, withinMinutes = 5): Promise<boolean> {
    const data = await this.post<{ exists?: boolean }>('/octomo/v1/public/message/exists', {
      mobileNum,
      text,
      withinMinutes,
    });
    return data.exists === true;
  }

  async createQrCode(text: string, options: OctomoQrOptions = {}): Promise<string> {
    const data = await this.post<{ qrCode?: string }>('/octomo/v1/public/message/qr-code', { text, ...options });
    if (!data.qrCode) throw new OctomoApiError(502, 'Octomo response missing qrCode');
    return data.qrCode;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.enabled) throw new OctomoDisabledError();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Octomo ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new OctomoApiError(res.status, text);
    }
    return (await res.json()) as T;
  }
}
