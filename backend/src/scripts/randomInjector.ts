import { randomInt } from 'crypto';

const PROFILES = ['realistic', 'balanced', 'chaos', 'normal-only'] as const;
type Profile = (typeof PROFILES)[number];

const BASE_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:3000';

// How long (ms) each profile runs before switching
const PROFILE_DURATION_MS: Record<Profile, [number, number]> = {
  realistic: [15_000, 30_000],
  balanced: [10_000, 20_000],
  chaos: [8_000, 15_000],
  'normal-only': [20_000, 40_000],
};

let active = false;
let currentProfile: Profile | null = null;
let cycleTimer: NodeJS.Timeout | null = null;

/**
 * Pick a random profile (weighted: chaos and balanced more likely for variety)
 */
function pickRandomProfile(): Profile {
  const weights = [1, 2, 3, 1]; // realistic, balanced, chaos, normal-only
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < PROFILES.length; i++) {
    r -= weights[i];
    if (r <= 0) return PROFILES[i];
  }
  return PROFILES[0];
}

/**
 * Call the backend API
 */
async function api(path: string, method: 'GET' | 'POST' = 'GET', body?: any) {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Stop the current running profile
 */
async function stopCurrent(): Promise<void> {
  try {
    await api('/injector/stop', 'POST');
    console.log(`  Stopped profile: ${currentProfile}`);
  } catch (err: any) {
    console.error(`  Failed to stop: ${err.message}`);
  }
}

/**
 * Start a specific profile
 */
async function startProfile(profile: Profile): Promise<void> {
  try {
    const data = await api('/injector/start', 'POST', { profile });
    console.log(
      `  Started: ${profile} | batch: ${data.status.config.batchSize} | interval: ${data.status.config.intervalMs}ms`
    );
    currentProfile = profile;
  } catch (err: any) {
    console.error(`  Failed to start ${profile}: ${err.message}`);
  }
}

/**
 * One cycle: pick a random profile, run it, then schedule the next cycle
 */
async function cycle(): Promise<void> {
  if (!active) return;

  const nextProfile = pickRandomProfile();

  // Avoid re-selecting the same profile
  if (nextProfile === currentProfile) {
    // Extend current profile duration
    const [min, max] = PROFILE_DURATION_MS[currentProfile];
    const duration = randomInt(min, max);
    console.log(`  Continuing: ${currentProfile} for ${(duration / 1000).toFixed(0)}s`);
    cycleTimer = setTimeout(cycle, duration);
    return;
  }

  // Switch to new profile
  await stopCurrent();
  await startProfile(nextProfile);

  const [min, max] = PROFILE_DURATION_MS[nextProfile];
  const duration = randomInt(min, max);

  console.log(`  Running for ${(duration / 1000).toFixed(0)}s...`);
  cycleTimer = setTimeout(cycle, duration);
}

/**
 * Start the random injector
 */
export async function startRandomInjector(): Promise<void> {
  if (active) {
    console.log('Random injector is already running. Use "stop" first.');
    return;
  }

  active = true;
  console.log('========================================');
  console.log('  Random Injector Started');
  console.log('  Cycling through: realistic, balanced, chaos, normal-only');
  console.log('  Press Ctrl+C or run "stop" to halt');
  console.log('========================================\n');

  cycle();
}

/**
 * Stop the random injector
 */
export async function stopRandomInjector(): Promise<void> {
  if (!active) {
    console.log('Random injector is not running.');
    return;
  }

  active = false;
  if (cycleTimer) {
    clearTimeout(cycleTimer);
    cycleTimer = null;
  }

  await stopCurrent();
  currentProfile = null;
  console.log('\n========================================');
  console.log('  Random Injector Stopped');
  console.log('========================================');
}

/**
 * Check the status
 */
export async function checkRandomInjectorStatus(): Promise<void> {
  try {
    const status = await api('/injector/status', 'GET');
    console.log('Injector Status:');
    console.log(`  Active: ${status.active}`);
    if (status.config) {
      console.log(`  Batch Size: ${status.config.batchSize}`);
      console.log(`  Interval: ${status.config.intervalMs}ms`);
    }
  } catch (err: any) {
    console.error(`Failed to check status: ${err.message}`);
  }
}

// CLI handling
async function main() {
  const command = process.argv[2]?.toLowerCase();

  switch (command) {
    case 'start':
      await startRandomInjector();
      // Keep process alive
      process.on('SIGINT', async () => {
        console.log('\n\nShutting down...');
        await stopRandomInjector();
        process.exit(0);
      });
      break;

    case 'stop':
      await stopRandomInjector();
      break;

    case 'status':
      await checkRandomInjectorStatus();
      break;

    default:
      console.log('Usage:');
      console.log('  npm run injector:start     - Start random cycling through profiles');
      console.log('  npm run injector:stop      - Stop the random injector');
      console.log('  npm run injector:status    - Check current injector status');
      console.log('\nProfiles: realistic, balanced, chaos, normal-only');
      break;
  }
}

main().catch(console.error);
