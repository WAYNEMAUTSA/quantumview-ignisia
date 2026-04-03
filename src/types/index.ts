export type TransactionState =
  | 'created'
  | 'authorized'
  | 'captured'
  | 'settled'
  | 'failed'
  | 'refunded'
  | 'refund_initiated'
  | 'disputed'
  | 'unknown';

export interface NormalizedEvent {
  gatewayTxnId: string;
  gateway: 'razorpay';
  eventType: TransactionState;
  gatewayTimestamp: Date;
  amount: number;
  currency: string;
  idempotencyKey: string;
  rawPayload: object;
}
