import { V1PushPlatform } from '@prisma/client';

/** One registered device a notification can be addressed to. */
export interface PushTarget {
  id: string;
  token: string;
  platform: V1PushPlatform;
}

/** The notification content, identical for every platform. */
export interface NativePushPayload {
  notificationId: string;
  title: string;
  body?: string;
  route?: string;
}

export interface NativeDeliverySummary {
  devices: number;
  delivered: number;
  failed: number;
  /** True when the adapter has no credentials, so nothing was even attempted. */
  disabled: boolean;
}

/**
 * What the dispatcher needs from a platform adapter.
 *
 * Device selection lives in the dispatcher rather than in each adapter so that a platform
 * with no adapter is visible there — a registered device nobody routes must be a loud
 * failure, not a silent zero.
 */
export interface NativePushAdapter {
  readonly platform: V1PushPlatform;
  /**
   * Whether this adapter has credentials. The dispatcher checks it before looking up
   * devices at all: with no adapter configured there is nothing to route to, and resolving
   * the push environment would then throw on a deployment that simply has push turned off.
   */
  readonly isConfigured: boolean;
  send(devices: PushTarget[], payload: NativePushPayload): Promise<NativeDeliverySummary>;
}
