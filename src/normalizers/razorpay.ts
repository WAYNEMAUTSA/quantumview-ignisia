import { NormalizedEvent, TransactionState } from '../types';

const EVENT_MAP: Record<string, TransactionState> = {
  'payment.created': 'created',
  'payment.authorized': 'authorized',
  'payment.captured': 'captured',
  'payment.failed': 'failed',
  'refund.created': 'refund_initiated',
  'refund.processed': 'refunded',
};

export function normalizeRazorpay(body: any): NormalizedEvent {
  const gatewayTxnId = body.payload?.payment?.entity?.id;
  const eventName = body.event;

  const eventType = EVENT_MAP[eventName];
  if (!eventType) {
    throw new Error('Unknown Razorpay event: ' + body.event);
  }

  const amount = body.payload?.payment?.entity?.amount / 100;
  const currency = body.payload?.payment?.entity?.currency ?? 'INR';
  const idempotencyKey = `razorpay:${gatewayTxnId}:${body.event}`;

  return {
    gatewayTxnId,
    gateway: 'razorpay',
    eventType,
    gatewayTimestamp: new Date(body.payload?.payment?.entity?.created_at * 1000),
    amount,
    currency,
    idempotencyKey,
    rawPayload: body,
  };
}
