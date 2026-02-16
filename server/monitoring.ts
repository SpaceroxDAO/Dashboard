/**
 * Monitoring endpoints: cost tracking, system health, SSE live feed,
 * activity heatmap, and service controls.
 *
 * Inspired by openclaw-dashboard and clawdbot-cost-monitor.
 */

import { Router, type Request, type Response } from 'express';
import fs from 'fs/promises';
import { watch, type FSWatcher } from 'fs';
import path from 'path';
import os from 'os';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const router = Router();

// ─── Paths ───

const CLAUDE_PROJECTS_PATH = path.join(os.homedir(), '.claude', 'projects');
const AGENTS_BASE_PATH = '/Users/lume/clawd';

// ══════════════════════════════════════════════════════════════════════════════
// 1. COST TRACKING — Parse JSONL session files for token usage
// ══════════════════════════════════════════════════════════════════════════════

const MODEL_PRICING: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-opus-4-6':             { input: 15,   output: 75,   cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-opus-4-5-20251101':    { input: 15,   output: 75,   cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-sonnet-4-5-20251101':  { input: 3,    output: 15,   cacheWrite: 3.75,  cacheRead: 0.30 },
  'claude-sonnet-4-6':           { input: 3,    output: 15,   cacheWrite: 3.75,  cacheRead: 0.30 },
  'claude-sonnet-4-20250514':    { input: 3,    output: 15,   cacheWrite: 3.75,  cacheRead: 0.30 },
  'claude-haiku-4-5-20251101':   { input: 0.80, output: 4,    cacheWrite: 1.00,  cacheRead: 0.08 },
  // Fallback applied in code for unknown models
};

const DEFAULT_PRICING = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 }; // Sonnet-class

function getPricing(model: string) {
  return MODEL_PRICING[model] || DEFAULT_PRICING;
}

function tokenCost(tokens: number, pricePerMillion: number): number {
  return (tokens / 1_000_000) * pricePerMillion;
}

interface SessionCost {
  sessionId: string;
  project: string;
  model: string;
  date: string; // YYYY-MM-DD
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
  cacheSavings: number;
  messageCount: number;
  lastActivity: string;
}

interface CostSummary {
  totalCost: number;
  totalCacheSavings: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  dailyCosts: Record<string, number>;
  modelBreakdown: Record<string, { cost: number; tokens: number; messages: number }>;
  recentSessions: SessionCost[];
  monthlyProjection: number;
  dailyBurnRate: number;
}

// Cache cost data for 60 seconds
let costCache: { data: CostSummary; timestamp: number } | null = null;
const COST_CACHE_TTL = 60_000;

async function parseSessionFile(filePath: string): Promise<SessionCost | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    let messageCount = 0;
    let model = 'unknown';
    let lastTimestamp = '';
    let firstDate = '';

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const ts = obj.timestamp;
        if (ts && !firstDate) firstDate = ts.slice(0, 10);
        if (ts) lastTimestamp = ts;

        const msg = typeof obj.message === 'object' ? obj.message : null;
        const usage = msg?.usage;
        if (!usage) continue;

        messageCount++;
        inputTokens += usage.input_tokens || 0;
        outputTokens += usage.output_tokens || 0;
        cacheReadTokens += usage.cache_read_input_tokens || 0;
        cacheWriteTokens += usage.cache_creation_input_tokens || 0;

        if (msg.model && msg.model !== '<synthetic>') model = msg.model;
      } catch { /* skip malformed lines */ }
    }

    if (messageCount === 0) return null;

    const pricing = getPricing(model);
    const totalCost =
      tokenCost(inputTokens, pricing.input) +
      tokenCost(outputTokens, pricing.output) +
      tokenCost(cacheWriteTokens, pricing.cacheWrite) +
      tokenCost(cacheReadTokens, pricing.cacheRead);

    // Cache savings: what it would have cost if cached tokens were full-price input
    const cacheSavings =
      tokenCost(cacheReadTokens, pricing.input) - tokenCost(cacheReadTokens, pricing.cacheRead);

    const sessionId = path.basename(filePath, '.jsonl');
    const project = path.basename(path.dirname(filePath));

    return {
      sessionId,
      project,
      model,
      date: firstDate || new Date().toISOString().slice(0, 10),
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      totalCost,
      cacheSavings,
      messageCount,
      lastActivity: lastTimestamp,
    };
  } catch {
    return null;
  }
}

async function computeCosts(days: number = 30): Promise<CostSummary> {
  // Check cache
  if (costCache && Date.now() - costCache.timestamp < COST_CACHE_TTL) {
    return costCache.data;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();

  // Find all project directories
  const projectDirs = await fs.readdir(CLAUDE_PROJECTS_PATH).catch(() => []);
  const allFiles: string[] = [];

  for (const dir of projectDirs) {
    const dirPath = path.join(CLAUDE_PROJECTS_PATH, dir);
    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) continue;
      const files = await fs.readdir(dirPath);
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const fPath = path.join(dirPath, f);
        const fStat = await fs.stat(fPath);
        if (fStat.mtimeMs >= cutoffMs) {
          allFiles.push(fPath);
        }
      }
    } catch { /* skip */ }
  }

  // Parse files in batches to limit memory
  const BATCH_SIZE = 50;
  const sessions: SessionCost[] = [];

  for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
    const batch = allFiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(parseSessionFile));
    sessions.push(...results.filter((s): s is SessionCost => s !== null));
  }

  // Aggregate
  let totalCost = 0;
  let totalCacheSavings = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  const dailyCosts: Record<string, number> = {};
  const modelBreakdown: Record<string, { cost: number; tokens: number; messages: number }> = {};

  for (const s of sessions) {
    totalCost += s.totalCost;
    totalCacheSavings += s.cacheSavings;
    totalInputTokens += s.inputTokens;
    totalOutputTokens += s.outputTokens;
    totalCacheReadTokens += s.cacheReadTokens;
    totalCacheWriteTokens += s.cacheWriteTokens;

    dailyCosts[s.date] = (dailyCosts[s.date] || 0) + s.totalCost;

    if (!modelBreakdown[s.model]) {
      modelBreakdown[s.model] = { cost: 0, tokens: 0, messages: 0 };
    }
    modelBreakdown[s.model].cost += s.totalCost;
    modelBreakdown[s.model].tokens += s.inputTokens + s.outputTokens;
    modelBreakdown[s.model].messages += s.messageCount;
  }

  const dailyValues = Object.values(dailyCosts);
  const activeDays = dailyValues.length || 1;
  const dailyBurnRate = totalCost / activeDays;
  const daysInMonth = 30;
  const monthlyProjection = dailyBurnRate * daysInMonth;

  // Sort sessions by last activity, return top 20
  const recentSessions = sessions
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))
    .slice(0, 20);

  const summary: CostSummary = {
    totalCost: Math.round(totalCost * 100) / 100,
    totalCacheSavings: Math.round(totalCacheSavings * 100) / 100,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheWriteTokens,
    dailyCosts,
    modelBreakdown,
    recentSessions,
    monthlyProjection: Math.round(monthlyProjection * 100) / 100,
    dailyBurnRate: Math.round(dailyBurnRate * 100) / 100,
  };

  costCache = { data: summary, timestamp: Date.now() };
  return summary;
}

router.get('/api/costs', async (_req: Request, res: Response) => {
  try {
    const days = parseInt((_req.query.days as string) || '30', 10);
    const data = await computeCosts(days);
    res.json(data);
  } catch (error) {
    console.error('Cost tracking error:', error);
    res.status(500).json({ error: 'Failed to compute costs' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. SYSTEM HEALTH — CPU, RAM, disk with snapshot history
// ══════════════════════════════════════════════════════════════════════════════

interface HealthSnapshot {
  timestamp: string;
  cpu: number; // 0-100 percentage
  memUsed: number; // bytes
  memTotal: number; // bytes
  memPercent: number; // 0-100
  diskUsed: number; // bytes
  diskTotal: number; // bytes
  diskPercent: number; // 0-100
  loadAvg: number[]; // 1, 5, 15 min
}

const healthHistory: HealthSnapshot[] = [];
const MAX_HEALTH_SNAPSHOTS = 288; // 24h at 5-min intervals

async function captureHealthSnapshot(): Promise<HealthSnapshot> {
  // CPU: load average
  const loadAvg = os.loadavg();
  const cpuCount = os.cpus().length;
  const cpuPercent = Math.min(100, Math.round((loadAvg[0] / cpuCount) * 100));

  // Memory
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = memTotal - memFree;
  const memPercent = Math.round((memUsed / memTotal) * 100);

  // Disk (macOS-compatible)
  let diskUsed = 0;
  let diskTotal = 0;
  let diskPercent = 0;
  try {
    const { stdout } = await execAsync('df -k / | tail -1');
    const parts = stdout.trim().split(/\s+/);
    // df -k output: Filesystem 1K-blocks Used Available Use% Mounted
    const totalBlocks = parseInt(parts[1], 10) || 0;
    const usedBlocks = parseInt(parts[2], 10) || 0;
    diskTotal = totalBlocks * 1024;
    diskUsed = usedBlocks * 1024;
    diskPercent = diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0;
  } catch { /* skip disk */ }

  return {
    timestamp: new Date().toISOString(),
    cpu: cpuPercent,
    memUsed,
    memTotal,
    memPercent,
    diskUsed,
    diskTotal,
    diskPercent,
    loadAvg,
  };
}

// Capture snapshot every 5 minutes
async function startHealthMonitoring() {
  // Initial snapshot
  const snap = await captureHealthSnapshot();
  healthHistory.push(snap);

  setInterval(async () => {
    try {
      const s = await captureHealthSnapshot();
      healthHistory.push(s);
      if (healthHistory.length > MAX_HEALTH_SNAPSHOTS) {
        healthHistory.shift();
      }
    } catch { /* skip */ }
  }, 5 * 60 * 1000); // 5 minutes
}

startHealthMonitoring();

router.get('/api/system/health', async (_req: Request, res: Response) => {
  try {
    const current = await captureHealthSnapshot();
    res.json({
      current,
      history: healthHistory,
      uptime: os.uptime(),
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      cpuModel: os.cpus()[0]?.model || 'unknown',
      cpuCount: os.cpus().length,
    });
  } catch (error) {
    console.error('System health error:', error);
    res.status(500).json({ error: 'Failed to get system health' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. SSE LIVE FEED — Watch session files and push events
// ══════════════════════════════════════════════════════════════════════════════

interface SSEClient {
  id: string;
  res: Response;
}

const sseClients: SSEClient[] = [];
const watchers: FSWatcher[] = [];
const fileOffsets = new Map<string, number>(); // Track read positions

function broadcastSSE(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.res.write(payload); } catch { /* dead client */ }
  }
}

async function tailFile(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    const prevOffset = fileOffsets.get(filePath) || stat.size;
    if (stat.size <= prevOffset) {
      fileOffsets.set(filePath, stat.size);
      return;
    }

    // Read only the new bytes
    const fh = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(stat.size - prevOffset);
    await fh.read(buffer, 0, buffer.length, prevOffset);
    await fh.close();
    fileOffsets.set(filePath, stat.size);

    const newLines = buffer.toString('utf-8').trim().split('\n').filter(Boolean);
    for (const line of newLines) {
      try {
        const obj = JSON.parse(line);
        const msg = typeof obj.message === 'object' ? obj.message : null;
        const type = obj.type || 'unknown';
        const ts = obj.timestamp || new Date().toISOString();

        // Only broadcast interesting events
        if (type === 'user' || type === 'assistant') {
          const content = msg?.content;
          const text = Array.isArray(content)
            ? content.find((c: any) => c.type === 'text')?.text
            : (typeof content === 'string' ? content : undefined);

          broadcastSSE('message', {
            type,
            timestamp: ts,
            text: text?.slice(0, 500),
            model: msg?.model,
            sessionId: path.basename(filePath, '.jsonl'),
            usage: msg?.usage ? {
              inputTokens: msg.usage.input_tokens || 0,
              outputTokens: msg.usage.output_tokens || 0,
            } : undefined,
          });
        }
      } catch { /* skip malformed */ }
    }
  } catch { /* skip */ }
}

async function startFileWatching() {
  try {
    const projectDirs = await fs.readdir(CLAUDE_PROJECTS_PATH);
    for (const dir of projectDirs) {
      const dirPath = path.join(CLAUDE_PROJECTS_PATH, dir);
      try {
        const stat = await fs.stat(dirPath);
        if (!stat.isDirectory()) continue;

        // Initialize offsets for existing files
        const files = await fs.readdir(dirPath);
        for (const f of files) {
          if (!f.endsWith('.jsonl')) continue;
          const fPath = path.join(dirPath, f);
          const fStat = await fs.stat(fPath);
          fileOffsets.set(fPath, fStat.size);
        }

        // Watch directory for changes
        const watcher = watch(dirPath, async (eventType, filename) => {
          if (!filename?.endsWith('.jsonl')) return;
          if (sseClients.length === 0) return; // No listeners
          const fPath = path.join(dirPath, filename);
          await tailFile(fPath);
        });
        watchers.push(watcher);
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
}

startFileWatching();

router.get('/api/live', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const clientId = Math.random().toString(36).slice(2);
  const client: SSEClient = { id: clientId, res };
  sseClients.push(client);

  // Send heartbeat every 30s
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 30_000);

  // Send initial connect event
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`);

  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = sseClients.findIndex(c => c.id === clientId);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. ACTIVITY HEATMAP — Parse session timestamps
// ══════════════════════════════════════════════════════════════════════════════

interface HeatmapData {
  // 7 (days) x 24 (hours) grid of activity counts
  grid: number[][];
  // Daily activity counts for contribution-style calendar (last 30 days)
  dailyActivity: Record<string, number>;
  totalSessions: number;
  totalMessages: number;
  peakHour: number;
  peakDay: number; // 0=Sun, 6=Sat
}

let heatmapCache: { data: HeatmapData; timestamp: number } | null = null;
const HEATMAP_CACHE_TTL = 5 * 60_000; // 5 minutes

async function computeHeatmap(): Promise<HeatmapData> {
  if (heatmapCache && Date.now() - heatmapCache.timestamp < HEATMAP_CACHE_TTL) {
    return heatmapCache.data;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffMs = cutoff.getTime();

  // 7 x 24 grid (day-of-week x hour)
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const dailyActivity: Record<string, number> = {};
  let totalSessions = 0;
  let totalMessages = 0;

  const projectDirs = await fs.readdir(CLAUDE_PROJECTS_PATH).catch(() => []);

  for (const dir of projectDirs) {
    const dirPath = path.join(CLAUDE_PROJECTS_PATH, dir);
    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) continue;
      const files = await fs.readdir(dirPath);

      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const fPath = path.join(dirPath, f);
        const fStat = await fs.stat(fPath);
        if (fStat.mtimeMs < cutoffMs) continue;

        totalSessions++;

        // Read file and extract timestamps
        try {
          const content = await fs.readFile(fPath, 'utf-8');
          const lines = content.trim().split('\n');
          for (const line of lines) {
            try {
              const obj = JSON.parse(line);
              if (!obj.timestamp) continue;
              if (obj.type !== 'user' && obj.type !== 'assistant') continue;
              totalMessages++;

              const d = new Date(obj.timestamp);
              if (d.getTime() < cutoffMs) continue;

              const dayOfWeek = d.getDay(); // 0=Sun
              const hour = d.getHours();
              grid[dayOfWeek][hour]++;

              const dateStr = d.toISOString().slice(0, 10);
              dailyActivity[dateStr] = (dailyActivity[dateStr] || 0) + 1;
            } catch { /* skip */ }
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  // Find peak
  let peakHour = 0;
  let peakDay = 0;
  let peakVal = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (grid[d][h] > peakVal) {
        peakVal = grid[d][h];
        peakHour = h;
        peakDay = d;
      }
    }
  }

  const data: HeatmapData = { grid, dailyActivity, totalSessions, totalMessages, peakHour, peakDay };
  heatmapCache = { data, timestamp: Date.now() };
  return data;
}

router.get('/api/activity/heatmap', async (_req: Request, res: Response) => {
  try {
    const data = await computeHeatmap();
    res.json(data);
  } catch (error) {
    console.error('Heatmap error:', error);
    res.status(500).json({ error: 'Failed to compute activity heatmap' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. RATE LIMIT MONITORING — Track token usage in rolling windows
// ══════════════════════════════════════════════════════════════════════════════

router.get('/api/rate-limits', async (_req: Request, res: Response) => {
  try {
    // Parse recent sessions (last 5 hours for rolling window)
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const projectDirs = await fs.readdir(CLAUDE_PROJECTS_PATH).catch(() => []);

    let tokensLast5h = 0;
    let tokensLast1h = 0;
    let requestsLast5h = 0;
    let requestsLast1h = 0;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    for (const dir of projectDirs) {
      const dirPath = path.join(CLAUDE_PROJECTS_PATH, dir);
      try {
        const stat = await fs.stat(dirPath);
        if (!stat.isDirectory()) continue;
        const files = await fs.readdir(dirPath);

        for (const f of files) {
          if (!f.endsWith('.jsonl')) continue;
          const fPath = path.join(dirPath, f);
          const fStat = await fs.stat(fPath);
          if (fStat.mtimeMs < fiveHoursAgo.getTime()) continue;

          const content = await fs.readFile(fPath, 'utf-8');
          for (const line of content.trim().split('\n')) {
            try {
              const obj = JSON.parse(line);
              const msg = typeof obj.message === 'object' ? obj.message : null;
              const usage = msg?.usage;
              if (!usage || !obj.timestamp) continue;

              const ts = new Date(obj.timestamp);
              const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0) +
                (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);

              if (ts >= fiveHoursAgo) {
                tokensLast5h += totalTokens;
                requestsLast5h++;
              }
              if (ts >= oneHourAgo) {
                tokensLast1h += totalTokens;
                requestsLast1h++;
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    }

    res.json({
      rolling5h: { tokens: tokensLast5h, requests: requestsLast5h },
      rolling1h: { tokens: tokensLast1h, requests: requestsLast1h },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Rate limit error:', error);
    res.status(500).json({ error: 'Failed to compute rate limits' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. SERVICE CONTROLS — List processes and restart services
// ══════════════════════════════════════════════════════════════════════════════

interface ServiceInfo {
  name: string;
  status: 'running' | 'stopped' | 'unknown';
  pid?: number;
  uptime?: string;
  description: string;
}

async function getServiceStatus(): Promise<ServiceInfo[]> {
  const services: ServiceInfo[] = [];

  const checks: Array<{ name: string; pattern: string; description: string }> = [
    { name: 'api-server', pattern: 'tsx.*server/index.ts', description: 'Dashboard API server (port 3001)' },
    { name: 'tailscale-funnel', pattern: 'tailscale.*funnel', description: 'Tailscale funnel for external access' },
    { name: 'claude-code', pattern: 'claude', description: 'Claude Code CLI sessions' },
  ];

  for (const check of checks) {
    try {
      const { stdout } = await execAsync(`pgrep -f '${check.pattern}' 2>/dev/null || true`);
      const pids = stdout.trim().split('\n').filter(Boolean).map(Number);
      if (pids.length > 0 && pids[0] > 0) {
        // Get process uptime
        let uptime = '';
        try {
          const { stdout: psOut } = await execAsync(`ps -p ${pids[0]} -o etime= 2>/dev/null`);
          uptime = psOut.trim();
        } catch { /* skip */ }
        services.push({
          name: check.name,
          status: 'running',
          pid: pids[0],
          uptime,
          description: check.description,
        });
      } else {
        services.push({ name: check.name, status: 'stopped', description: check.description });
      }
    } catch {
      services.push({ name: check.name, status: 'unknown', description: check.description });
    }
  }

  // Check launchd services
  try {
    const { stdout } = await execAsync('launchctl list 2>/dev/null | grep com.finn || true');
    const launchdLines = stdout.trim().split('\n').filter(Boolean);
    for (const line of launchdLines) {
      const parts = line.split('\t');
      const pid = parseInt(parts[0], 10);
      const name = parts[2] || 'unknown';
      services.push({
        name: `launchd:${name}`,
        status: pid > 0 ? 'running' : 'stopped',
        pid: pid > 0 ? pid : undefined,
        description: `launchd managed: ${name}`,
      });
    }
  } catch { /* skip */ }

  return services;
}

router.get('/api/services', async (_req: Request, res: Response) => {
  try {
    const services = await getServiceStatus();
    res.json({ services });
  } catch (error) {
    console.error('Services error:', error);
    res.status(500).json({ error: 'Failed to get service status' });
  }
});

router.post('/api/services/:name/restart', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;

    // Only allow specific services to be restarted
    const restartCommands: Record<string, { kill: string; start?: string }> = {
      'api-server': {
        kill: "pkill -f 'tsx.*server/index.ts'",
        start: `cd ${AGENTS_BASE_PATH}/agent-dashboard && npx tsx server/index.ts &`,
      },
    };

    const cmd = restartCommands[name];
    if (!cmd) {
      return res.status(400).json({ error: `Service "${name}" cannot be restarted from the dashboard` });
    }

    // Kill existing process
    try { await execAsync(cmd.kill); } catch { /* may not be running */ }

    // Start new process if applicable
    if (cmd.start) {
      await execAsync(`sleep 1 && ${cmd.start}`);
    }

    res.json({
      success: true,
      service: name,
      action: 'restart',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Service restart error:', error);
    res.status(500).json({ error: 'Failed to restart service' });
  }
});

export default router;
