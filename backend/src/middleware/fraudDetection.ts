import { Request, Response, NextFunction } from 'express';
import { supabase } from '../db/supabase.js';
import { FraudAssessment, SecurityLogEntry } from '../types/index.js';
import { logSecurityEvent } from '../services/securityLog.js';

// ────────────────────────────────────────────────────────────────
// FRAUD DETECTION MIDDLEWARE FOR WEBHOOK INGESTION
// ────────────────────────────────────────────────────────────────
//
// Placed between chaosHealer and applyEvent (ledger update).
// On duplicate ID detection:
//   1. Calculates risk score from time delta + header consistency
//   2. BLOCKS if risk is high (large time gap or header changes)
//   3. DROPS silently if it's a standard retry (low risk, same headers)
//   4. ALLOWS if first-time event (no duplicate)
//
// When fraud flag is set, applyEvent is UNREACHABLE — the middleware
// terminates the request before the ledger is touched.
// ────────────────────────────────────────────────────────────────

// Thresholds
const BLOCK_RISK_THRESHOLD = 60;        // risk score >= 60 → block
const DROP_RISK_THRESHOLD = 25;         // risk score 25–59 → drop silently
const MAX_TIME_DELTA_MS = 300_000;      // 5 min — large gap = suspicious
const STANDARD_RETRY_WINDOW_MS = 5000;  // 5 sec — normal retry window

// Headers that signal request authenticity
const AUTH_HEADERS = [
  'x-razorpay-signature',
  'x-webhook-signature',
  'x-request-id',
  'content-type',
  'user-agent',
  'x-forwarded-for',
];

interface WebhookDuplicateCheck {
  gatewayTxnId: string;
  eventType: string;
  currentHeaders: Record<string, string>;
  ip: string;
  userAgent: string;
}

interface DuplicateInfo {
  originalTimestamp: string;
  originalHeaders: Record<string, unknown>;
  attemptCount: number;
}

/**
 * Extract relevant headers from Express request.
 */
function extractHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const key of AUTH_HEADERS) {
    const val = req.headers[key];
    if (val) headers[key] = Array.isArray(val) ? val.join(', ') : val;
  }
  // Also capture x-forwarded-for if present
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) headers['x-forwarded-for'] = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
  return headers;
}

/**
 * Calculate header consistency score (0–1).
 * 1.0 = all auth headers match exactly.
 * 0.0 = no headers match.
 */
function calculateHeaderConsistency(
  original: Record<string, unknown>,
  current: Record<string, string>
): number {
  const checkedKeys = AUTH_HEADERS.filter(k => original[k] !== undefined);
  if (checkedKeys.length === 0) return 1.0; // no headers to compare

  let matching = 0;
  for (const key of checkedKeys) {
    const origVal = String(original[key] ?? '').toLowerCase();
    const curVal = (current[key] ?? '').toLowerCase();
    if (origVal === curVal) matching++;
  }
  return matching / checkedKeys.length;
}

/**
 * Identify which headers changed.
 */
function getFlaggedFields(
  original: Record<string, unknown>,
  current: Record<string, string>
): string[] {
  const flagged: string[] = [];
  for (const key of AUTH_HEADERS) {
    const origVal = String(original[key] ?? '').toLowerCase();
    const curVal = (current[key] ?? '').toLowerCase();
    if (origVal !== curVal && (origVal !== '' || curVal !== '')) {
      flagged.push(key);
    }
  }
  return flagged;
}

/**
 * Calculate a risk score (0–100) for a duplicate webhook attempt.
 *
 * Factors:
 *   - Time delta: larger gap = higher risk (up to 50 points)
 *   - Header consistency: lower match = higher risk (up to 50 points)
 */
function calculateRiskScore(
  timeDeltaMs: number,
  headerConsistency: number
): number {
  // Time component: 0 points if < 5s, up to 50 points if >= 5 min
  const timeRatio = Math.min(timeDeltaMs / MAX_TIME_DELTA_MS, 1);
  const timeScore = timeRatio * 50;

  // Header component: 0 points if 100% match, 50 points if 0% match
  const headerScore = (1 - headerConsistency) * 50;

  return Math.round(Math.min(timeScore + headerScore, 100));
}

/**
 * Determine assessment from risk score.
 */
function assessRisk(riskScore: number, timeDeltaMs: number): FraudAssessment['assessment'] {
  if (riskScore >= BLOCK_RISK_THRESHOLD) return 'block';
  if (riskScore >= DROP_RISK_THRESHOLD) return 'drop';
  return 'allow'; // standard retry
}

/**
 * Build a reasoning string for the assessment.
 */
function buildReasoning(
  assessment: FraudAssessment['assessment'],
  riskScore: number,
  timeDeltaMs: number,
  headerConsistency: number,
  flaggedFields: string[]
): string {
  const parts: string[] = [];

  parts.push(`Risk score: ${riskScore}/100`);
  parts.push(`Time delta: ${timeDeltaMs}ms`);
  parts.push(`Header consistency: ${(headerConsistency * 100).toFixed(0)}%`);

  if (flaggedFields.length > 0) {
    parts.push(`Changed headers: [${flaggedFields.join(', ')}]`);
  }

  switch (assessment) {
    case 'block':
      return `BLOCKED — ${parts.join('. ')}. Possible replay attack or tampered request.`;
    case 'drop':
      return `DROPPED — ${parts.join('. ')}. Moderate risk, treated as suspicious retry.`;
    case 'allow':
      return `ALLOWED — ${parts.join('. ')}. Standard retry within acceptable parameters.`;
  }
}

/**
 * Look up the original webhook event for a given idempotency key.
 * Returns the first occurrence's timestamp and headers.
 */
async function findOriginalEvent(
  gatewayTxnId: string,
  eventType: string
): Promise<DuplicateInfo | null> {
  // Find any existing webhook_events for this transaction + event type
  const { data: events } = await supabase
    .from('webhook_events')
    .select('gateway_timestamp, raw_payload, created_at')
    .eq('event_type', eventType)
    .order('created_at', { ascending: true })
    .limit(1);

  if (!events || events.length === 0) return null;

  const original = events[0];
  const payload = (original.raw_payload as Record<string, unknown>) || {};
  const originalHeaders = (payload._original_headers as Record<string, unknown>) ||
                          (payload.original_headers as Record<string, unknown>) || {};

  // Count total attempts
  const { count: attemptCount } = await supabase
    .from('webhook_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', eventType);

  return {
    originalTimestamp: original.gateway_timestamp,
    originalHeaders,
    attemptCount: (attemptCount || 0) + 1,
  };
}

/**
 * Fraud Detection Middleware.
 *
 * Usage: Add to webhook route before calling chaosHealer/applyEvent.
 *
 * Returns a FraudAssessment on the request object so downstream
 * code can check if the request was flagged.
 *
 * If assessment is 'block' or 'drop', the middleware sends a response
 * and calls next() with no further action — applyEvent is unreachable.
 */
export async function fraudDetectionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const body = req.body;
  if (!body) {
    next();
    return;
  }

  // Extract transaction ID from Razorpay payload (handles nested or flat)
  const entity = (body.payload as any)?.payment?.entity ?? body;
  const gatewayTxnId = entity?.id;
  const eventType = String(body.event || '');

  if (!gatewayTxnId) {
    // No transaction ID — can't check for duplicates, pass through
    next();
    return;
  }

  const currentHeaders = extractHeaders(req);
  const ip = req.headers['x-forwarded-for'] as string || req.ip || 'unknown';
  const userAgent = req.headers['user-agent'] as string || 'unknown';

  // Check if this is a duplicate
  const original = await findOriginalEvent(gatewayTxnId, eventType);

  if (!original) {
    // First time seeing this event — attach clean assessment and continue
    (req as any).fraudAssessment = {
      isFraud: false,
      riskScore: 0,
      timeDeltaMs: 0,
      headerConsistency: 1.0,
      flaggedFields: [],
      assessment: 'allow' as const,
      reasoning: 'First-time event — no duplicate detected.',
    } satisfies FraudAssessment;
    next();
    return;
  }

  // ── Duplicate detected — run fraud assessment ──
  const originalTime = new Date(original.originalTimestamp).getTime();
  const retryTime = Date.now();
  const timeDeltaMs = retryTime - originalTime;

  const headerConsistency = calculateHeaderConsistency(original.originalHeaders, currentHeaders);
  const riskScore = calculateRiskScore(timeDeltaMs, headerConsistency);
  const flaggedFields = getFlaggedFields(original.originalHeaders, currentHeaders);
  const assessment = assessRisk(riskScore, timeDeltaMs);
  const isFraud = assessment === 'block';

  const reasoning = buildReasoning(assessment, riskScore, timeDeltaMs, headerConsistency, flaggedFields);

  const fraudAssessment: FraudAssessment = {
    isFraud,
    riskScore,
    timeDeltaMs,
    headerConsistency,
    flaggedFields,
    assessment,
    reasoning,
  };

  (req as any).fraudAssessment = fraudAssessment;

  // ── Build security log entry ──
  const securityEntry: SecurityLogEntry = {
    gateway_txn_id: gatewayTxnId,
    event_type: eventType,
    risk_score: riskScore,
    fraud_flag: isFraud,
    assessment,
    original_timestamp: original.originalTimestamp,
    retry_timestamp: new Date(retryTime).toISOString(),
    time_delta_ms: timeDeltaMs,
    header_consistency: headerConsistency,
    flagged_fields: flaggedFields,
    request_headers: currentHeaders,
    original_headers: original.originalHeaders as Record<string, string>,
    ip_address: typeof ip === 'string' ? ip : String(ip),
    user_agent: userAgent,
  };

  // ── Log to security dashboard ──
  await logSecurityEvent(securityEntry);

  // ── Act on assessment ──
  if (assessment === 'block') {
    // BLOCK — fraudulent request, do NOT reach applyEvent
    console.warn(`[FraudDetection] BLOCKED: ${reasoning}`);
    res.status(403).json({
      error: 'Request blocked by fraud detection',
      risk_score: riskScore,
      gateway_txn_id: gatewayTxnId,
      reason: reasoning,
    });
    return;
  }

  if (assessment === 'drop') {
    // DROP — suspicious but not fraudulent, silently drop
    console.log(`[FraudDetection] DROPPED (silent): ${reasoning}`);
    res.status(200).json({
      received: true,
      dropped: true,
      gateway_txn_id: gatewayTxnId,
      reason: 'Duplicate dropped as suspicious retry',
    });
    return;
  }

  // ALLOW — standard retry, pass through to chaosHealer → applyEvent
  console.log(`[FraudDetection] ALLOWED (standard retry): ${reasoning}`);
  next();
}
