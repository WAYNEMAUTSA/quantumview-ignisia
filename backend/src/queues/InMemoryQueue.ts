import { HealJobData as HealJobDataType } from '../types/index.js';

/**
 * In-memory queue fallback for when Redis is unavailable.
 * Implements a minimal Queue-like interface so the rest of the
 * codebase can use it without changes.
 */
export class InMemoryQueue {
  private jobs: Array<{ id: string; data: HealJobDataType; processed: boolean }> = [];
  private listeners: Map<string, Function[]> = new Map();
  private processing = false;
  private paused = false;
  private processor: ((job: { id: string; data: HealJobDataType }) => Promise<void>) | null = null;

  constructor() {
    console.warn('[InMemoryQueue] Redis unavailable — using in-memory heal queue');
  }

  /**
   * Add a job to the in-memory queue and process immediately.
   * BullMQ signature compatible: add(name, data, opts)
   */
  async add(
    name: string,
    data: HealJobDataType,
    _opts?: any,
  ): Promise<{ id: string; data: HealJobDataType }> {
    const job = { id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, data, processed: false };
    this.jobs.push(job);
    console.log(`[InMemoryQueue] Job added: ${job.id} (${name}) — total queued: ${this.jobs.length}`);

    // Trigger processing if a processor is registered
    this.emit('active', job);
    return job;
  }

  /**
   * Register a job processor (mimics Worker behavior).
   * We store it so we can process jobs as they're added.
   */
  setProcessor(processor: (job: { id: string; data: HealJobDataType }) => Promise<void>): void {
    this.processor = processor;
  }

  /**
   * Subscribe to queue events: 'active', 'completed', 'failed'
   */
  on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  /**
   * Pause the queue — jobs will still be queued but not processed.
   */
  async pause(): Promise<void> {
    this.paused = true;
    console.log('[InMemoryQueue] Queue paused');
  }

  /**
   * Resume processing paused jobs.
   */
  async resume(): Promise<void> {
    this.paused = false;
    console.log('[InMemoryQueue] Queue resumed');
    // Process any jobs that accumulated while paused
    this.processPending();
  }

  /**
   * Get queue status (useful for health checks).
   */
  async getJobCounts(): Promise<{ waiting: number; active: number; failed: number; completed: number }> {
    const waiting = this.jobs.filter(j => !j.processed).length;
    return { waiting, active: 0, failed: 0, completed: this.jobs.filter(j => j.processed).length };
  }

  /**
   * Check if queue is paused.
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Close the queue (no-op for in-memory).
   */
  async close(): Promise<void> {
    console.log('[InMemoryQueue] Queue closed');
  }

  // ——— Internal helpers ———

  private emit(event: string, job: { id: string; data: HealJobDataType; processed: boolean }): void {
    if (this.paused || !this.processor) return;

    const listeners = this.listeners.get(event) || [];
    for (const listener of listeners) {
      listener(job);
    }

    // Fire-and-forget processing
    this.processJob(job).catch(err => {
      console.error(`[InMemoryQueue] Job ${job.id} failed:`, err.message);
      this.emit('failed', job);
    });
  }

  private async processJob(job: { id: string; data: HealJobDataType; processed: boolean }): Promise<void> {
    if (!this.processor) return;

    try {
      await this.processor({ id: job.id, data: job.data });
      job.processed = true;
      console.log(`[InMemoryQueue] Job ${job.id} processed successfully`);
    } catch (err: any) {
      console.error(`[InMemoryQueue] Job ${job.id} processing failed:`, err.message);
      throw err;
    }
  }

  private async processPending(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    const pending = this.jobs.filter(j => !j.processed);
    for (const job of pending) {
      if (this.paused) break;
      try {
        await this.processJob(job);
      } catch {
        // Already logged
      }
    }

    this.processing = false;
  }
}
