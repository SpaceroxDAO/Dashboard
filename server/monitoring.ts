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

// Yield the event loop periodically so health checks don't get starved
function yieldEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

// ─── Agent Utilities ───

type AgentId = 'finn' | 'kira';

const FINN_PROJECT_DIR_PREFIX = '-Users-lume-clawd';
const KIRA_SSH_HOST = 'adami@100.117.33.89';
const KIRA_SESSIONS_PATH = 'C:\\Users\\adami\\.openclaw\\agents\\agents\\kira\\sessions';

// Dedup concurrent SSH calls for the same endpoint
const kiraInFlight = new Map<string, Promise<unknown>>();
async function withKiraLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = kiraInFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fn().finally(() => kiraInFlight.delete(key));
  kiraInFlight.set(key, promise);
  return promise;
}

function isValidAgent(agent: unknown): agent is AgentId {
  return agent === 'finn' || agent === 'kira';
}

function getAgentFromReq(req: Request): AgentId {
  const agent = req.query.agent;
  return isValidAgent(agent) ? agent : 'finn';
}

async function sshExec(command: string): Promise<string> {
  const { stdout } = await execFileAsync('ssh', [
    '-o', 'ConnectTimeout=5',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'BatchMode=yes',
    KIRA_SSH_HOST,
    command,
  ], { timeout: 15000 });
  return stdout;
}

/** Run a PowerShell script on Kira's PC via SSH using -EncodedCommand to avoid quoting issues with cmd.exe */
async function sshPowerShell(script: string): Promise<string> {
  // Encode as UTF-16LE base64 for PowerShell -EncodedCommand
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await execFileAsync('ssh', [
    '-o', 'ConnectTimeout=5',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'BatchMode=yes',
    KIRA_SSH_HOST,
    `powershell -NoProfile -EncodedCommand ${encoded}`,
  ], { timeout: 20000 });
  // Strip CLIXML noise that PowerShell sometimes emits
  const lines = stdout.split('\n').filter(l => !l.startsWith('#<') && !l.startsWith('<Objs') && !l.includes('</Objs>') && l.trim());
  return lines.join('\n').trim();
}

/** Return project dir names filtered by agent. Kira has no JSONL sessions. */
async function getProjectDirsForAgent(agent: AgentId): Promise<string[]> {
  if (agent === 'kira') return [];

  const allDirs = await fs.readdir(CLAUDE_PROJECTS_PATH).catch(() => []);
  return allDirs.filter(d => d.startsWith(FINN_PROJECT_DIR_PREFIX));
}

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

// Per-agent cost cache: key = `${agent}-${days}`
const costCaches = new Map<string, { data: CostSummary; timestamp: number }>();
const COST_CACHE_TTL = 60_000;

const ZERO_COST_SUMMARY: CostSummary = {
  totalCost: 0, totalCacheSavings: 0, totalInputTokens: 0, totalOutputTokens: 0,
  totalCacheReadTokens: 0, totalCacheWriteTokens: 0, dailyCosts: {}, modelBreakdown: {},
  recentSessions: [], monthlyProjection: 0, dailyBurnRate: 0,
};

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

async function computeKiraCosts(days: number = 30): Promise<CostSummary> {
  const cacheKey = `kira-${days}`;
  const cached = costCaches.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 2 * 60_000) return cached.data;

  return withKiraLock(cacheKey, async () => {
    const psScript = `
$dir = '${KIRA_SESSIONS_PATH}'
$cutoff = (Get-Date).AddDays(-${days})
$r = @()
Get-ChildItem $dir -Filter '*.jsonl' | Where-Object { $_.LastWriteTime -ge $cutoff } | ForEach-Object {
  $first = Get-Content $_.FullName -TotalCount 1 | ConvertFrom-Json
  $inp = 0; $out = 0; $msgs = 0; $model = 'unknown'; $last = ''
  foreach ($line in (Get-Content $_.FullName)) {
    try {
      $obj = $line | ConvertFrom-Json
      if ($obj.timestamp) { $last = $obj.timestamp }
      if ($obj.type -eq 'assistant' -and $obj.message.usage) {
        $msgs++; $inp += $obj.message.usage.input; $out += $obj.message.usage.output
      }
      if ($obj.type -eq 'model_change') { $model = $obj.modelId }
    } catch {}
  }
  if ($msgs -gt 0) {
    $r += @{ id=$first.id; ts=$first.timestamp; last=$last; model=$model; inp=$inp; out=$out; msgs=$msgs }
  }
}
$r | ConvertTo-Json -Compress
`.trim();

    try {
      const raw = await sshPowerShell(psScript);
      if (!raw || raw === 'null') {
        costCaches.set(cacheKey, { data: ZERO_COST_SUMMARY, timestamp: Date.now() });
        return ZERO_COST_SUMMARY;
      }

      const sessions: Array<{ id: string; ts: string; last: string; model: string; inp: number; out: number; msgs: number }> =
        Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [JSON.parse(raw)];

      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      const dailyCosts: Record<string, number> = {};
      const modelBreakdown: Record<string, { cost: number; tokens: number; messages: number }> = {};
      const recentSessions: SessionCost[] = [];

      for (const s of sessions) {
        totalInputTokens += s.inp;
        totalOutputTokens += s.out;
        const date = (s.ts || '').slice(0, 10);
        if (date) dailyCosts[date] = (dailyCosts[date] || 0) + s.inp + s.out;

        if (!modelBreakdown[s.model]) modelBreakdown[s.model] = { cost: 0, tokens: 0, messages: 0 };
        modelBreakdown[s.model].tokens += s.inp + s.out;
        modelBreakdown[s.model].messages += s.msgs;

        recentSessions.push({
          sessionId: s.id || 'unknown',
          project: 'kira',
          model: s.model,
          date,
          inputTokens: s.inp,
          outputTokens: s.out,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalCost: 0,
          cacheSavings: 0,
          messageCount: s.msgs,
          lastActivity: s.last || s.ts || '',
        });
      }

      recentSessions.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));

      const summary: CostSummary = {
        totalCost: 0,
        totalCacheSavings: 0,
        totalInputTokens,
        totalOutputTokens,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        dailyCosts,
        modelBreakdown,
        recentSessions: recentSessions.slice(0, 20),
        monthlyProjection: 0,
        dailyBurnRate: 0,
      };

      costCaches.set(cacheKey, { data: summary, timestamp: Date.now() });
      return summary;
    } catch (err) {
      console.error('Kira cost SSH error:', err);
      costCaches.set(cacheKey, { data: ZERO_COST_SUMMARY, timestamp: Date.now() });
      return ZERO_COST_SUMMARY;
    }
  });
}

async function computeCosts(agent: AgentId = 'finn', days: number = 30): Promise<CostSummary> {
  if (agent === 'kira') return computeKiraCosts(days);

  const cacheKey = `${agent}-${days}`;
  const cached = costCaches.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < COST_CACHE_TTL) {
    return cached.data;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();

  // Find agent-filtered project directories
  const projectDirs = await getProjectDirsForAgent(agent);
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
    // Yield to event loop so other requests (health checks) aren't starved
    await yieldEventLoop();
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

  costCaches.set(cacheKey, { data: summary, timestamp: Date.now() });
  return summary;
}

router.get('/api/costs', async (_req: Request, res: Response) => {
  try {
    const agent = getAgentFromReq(_req);
    const days = parseInt((_req.query.days as string) || '30', 10);
    const data = await computeCosts(agent, days);
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

// Per-agent health histories
const healthHistories: Record<AgentId, HealthSnapshot[]> = { finn: [], kira: [] };
const MAX_HEALTH_SNAPSHOTS = 288; // 24h at 5-min intervals

async function captureFinnHealthSnapshot(): Promise<HealthSnapshot> {
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

async function captureKiraHealthSnapshot(): Promise<HealthSnapshot> {
  // Fetch CPU, RAM, Disk from Windows via SSH PowerShell
  const psScript = `
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
Write-Output "$cpu|$($os.TotalVisibleMemorySize)|$($os.FreePhysicalMemory)|$($disk.Size)|$($disk.FreeSpace)"
`.trim();

  const raw = await sshPowerShell(psScript);
  const parts = raw.trim().split('|');

  const cpuPercent = Math.round(parseFloat(parts[0]) || 0);
  // Win32_OperatingSystem reports KB
  const memTotalKB = parseFloat(parts[1]) || 0;
  const memFreeKB = parseFloat(parts[2]) || 0;
  const memTotal = memTotalKB * 1024;
  const memUsed = (memTotalKB - memFreeKB) * 1024;
  const memPercent = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0;

  const diskTotal = parseFloat(parts[3]) || 0;
  const diskFree = parseFloat(parts[4]) || 0;
  const diskUsed = diskTotal - diskFree;
  const diskPercent = diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0;

  return {
    timestamp: new Date().toISOString(),
    cpu: cpuPercent,
    memUsed,
    memTotal,
    memPercent,
    diskUsed,
    diskTotal,
    diskPercent,
    loadAvg: [0, 0, 0], // Windows doesn't have load average
  };
}

function pushSnapshot(agent: AgentId, snap: HealthSnapshot) {
  healthHistories[agent].push(snap);
  if (healthHistories[agent].length > MAX_HEALTH_SNAPSHOTS) {
    healthHistories[agent].shift();
  }
}

// Cache for Kira's system info (hostname, OS, CPU model, etc.) — refreshed every 10 min
let kiraSystemInfoCache: { hostname: string; platform: string; cpuModel: string; cpuCount: number; uptime: number } | null = null;
let kiraSystemInfoTimestamp = 0;

// Capture Finn snapshot every 5 minutes
async function startHealthMonitoring() {
  // Initial Finn snapshot
  try {
    const snap = await captureFinnHealthSnapshot();
    pushSnapshot('finn', snap);
  } catch { /* skip */ }

  // Finn: every 5 minutes
  setInterval(async () => {
    try {
      const s = await captureFinnHealthSnapshot();
      pushSnapshot('finn', s);
    } catch { /* skip */ }
  }, 5 * 60 * 1000);

  // Initial Kira snapshot (best-effort)
  try {
    const snap = await captureKiraHealthSnapshot();
    pushSnapshot('kira', snap);
  } catch { /* Kira offline, no-op */ }

  // Kira: every 10 minutes (SSH latency)
  setInterval(async () => {
    try {
      const s = await captureKiraHealthSnapshot();
      pushSnapshot('kira', s);
    } catch { /* Kira offline, no-op */ }
  }, 10 * 60 * 1000);
}

startHealthMonitoring();

router.get('/api/system/health', async (_req: Request, res: Response) => {
  try {
    const agent = getAgentFromReq(_req);

    if (agent === 'kira') {
      try {
        const current = await captureKiraHealthSnapshot();
        pushSnapshot('kira', current);

        // Fetch system info (best-effort, cached)
        let sysInfo = kiraSystemInfoCache;
        if (!sysInfo || Date.now() - kiraSystemInfoTimestamp > 600_000) {
          try {
            const raw = await sshPowerShell(`
$cs = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$uptime = (Get-Date) - $os.LastBootUpTime
Write-Output "$($cs.Name)|$($os.Caption) $($os.Version)|$($cpu.Name)|$($cpu.NumberOfLogicalProcessors)|$([int]$uptime.TotalSeconds)"
`.trim());
            const parts = raw.split('|');
            sysInfo = {
              hostname: parts[0] || 'kira-pc',
              platform: parts[1] || 'Windows',
              cpuModel: parts[2] || 'unknown',
              cpuCount: parseInt(parts[3]) || 0,
              uptime: parseInt(parts[4]) || 0,
            };
            kiraSystemInfoCache = sysInfo;
            kiraSystemInfoTimestamp = Date.now();
          } catch { /* use stale cache or defaults */ }
        }

        res.json({
          current,
          history: healthHistories.kira,
          uptime: sysInfo?.uptime ?? 0,
          hostname: sysInfo?.hostname ?? 'kira-pc',
          platform: sysInfo?.platform ?? 'Windows',
          cpuModel: sysInfo?.cpuModel ?? 'unknown',
          cpuCount: sysInfo?.cpuCount ?? 0,
        });
      } catch {
        res.status(503).json({ error: 'Kira offline', offline: true });
      }
      return;
    }

    // Finn: local OS metrics
    const current = await captureFinnHealthSnapshot();
    res.json({
      current,
      history: healthHistories.finn,
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
  agent: AgentId;
}

const sseClients: SSEClient[] = [];
const watchers: FSWatcher[] = [];
const fileOffsets = new Map<string, number>(); // Track read positions

function broadcastSSE(event: string, data: unknown, filterAgent?: AgentId) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    if (filterAgent && client.agent !== filterAgent) continue;
    try { client.res.write(payload); } catch { /* dead client */ }
  }
}

/** Check if a dir name belongs to Finn's project dirs */
function isFinnProjectDir(dirName: string): boolean {
  return dirName.startsWith(FINN_PROJECT_DIR_PREFIX);
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

          // Only broadcast to finn clients (these are all Finn project dirs)
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
          }, 'finn');
        }
      } catch { /* skip malformed */ }
    }
  } catch { /* skip */ }
}

async function startFileWatching() {
  try {
    const projectDirs = await fs.readdir(CLAUDE_PROJECTS_PATH);
    for (const dir of projectDirs) {
      // Only watch Finn's project dirs (exclude user's own sessions)
      if (!isFinnProjectDir(dir)) continue;

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

// ─── Background cache warming ───
// Pre-warm both agents at startup, then keep Kira's caches hot on intervals
// so dashboard loads are always instant regardless of which agent is selected.

async function warmKiraCaches() {
  try { await computeKiraCosts(30); } catch { /* Kira offline */ }
  try { await computeKiraHeatmap(); } catch { /* Kira offline */ }
  try { await computeKiraRateLimits(); } catch { /* Kira offline */ }
}

setTimeout(async () => {
  // Finn (local, fast)
  try { await computeCosts('finn'); } catch { /* ignore */ }
  try { await computeHeatmap('finn'); } catch { /* ignore */ }
  // Kira (SSH, staggered to avoid hammering)
  setTimeout(() => warmKiraCaches(), 5_000);
}, 100);

// Kira background refresh: costs every 5 min, heatmap every 10 min, rate limits every 2 min
setInterval(async () => {
  try { await computeKiraCosts(30); } catch { /* Kira offline */ }
}, 5 * 60_000);

setInterval(async () => {
  try { await computeKiraHeatmap(); } catch { /* Kira offline */ }
}, 10 * 60_000);

setInterval(async () => {
  try { await computeKiraRateLimits(); } catch { /* Kira offline */ }
}, 2 * 60_000);

router.get('/api/live', (req: Request, res: Response) => {
  const agent = getAgentFromReq(req);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const clientId = Math.random().toString(36).slice(2);
  const client: SSEClient = { id: clientId, res, agent };
  sseClients.push(client);

  // Send heartbeat every 30s
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 30_000);

  // Send initial connect event
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`);

  // Kira: poll the most recently modified session file every 10s
  let kiraPollInterval: ReturnType<typeof setInterval> | null = null;
  if (agent === 'kira') {
    let lastSeenTimestamp = '';

    const pollKiraFeed = async () => {
      try {
        const psScript = `
$dir = '${KIRA_SESSIONS_PATH}'
$latest = Get-ChildItem $dir -Filter '*.jsonl' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latest) { Get-Content $latest.FullName | Select-Object -Last 20 }
`.trim();
        const raw = await sshPowerShell(psScript);
        if (!raw) return;

        const lines = raw.split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            const ts = obj.timestamp;
            if (!ts || ts <= lastSeenTimestamp) continue;
            if (obj.type !== 'user' && obj.type !== 'assistant') continue;

            lastSeenTimestamp = ts;
            const msg = typeof obj.message === 'object' ? obj.message : null;
            const content = msg?.content;
            const text = Array.isArray(content)
              ? content.find((c: any) => c.type === 'text')?.text
              : (typeof content === 'string' ? content : undefined);

            broadcastSSE('message', {
              type: obj.type,
              timestamp: ts,
              text: text?.slice(0, 500),
              model: msg?.model,
              sessionId: 'kira-live',
              usage: msg?.usage ? {
                inputTokens: msg.usage.input || 0,
                outputTokens: msg.usage.output || 0,
              } : undefined,
            }, 'kira');
          } catch { /* skip malformed */ }
        }
      } catch { /* SSH error, skip */ }
    };

    kiraPollInterval = setInterval(pollKiraFeed, 10_000);
    // Fire once immediately
    pollKiraFeed();
  }

  req.on('close', () => {
    clearInterval(heartbeat);
    if (kiraPollInterval) clearInterval(kiraPollInterval);
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

const ZERO_HEATMAP: HeatmapData = {
  grid: Array.from({ length: 7 }, () => Array(24).fill(0)),
  dailyActivity: {},
  totalSessions: 0,
  totalMessages: 0,
  peakHour: 0,
  peakDay: 0,
};

// Per-agent heatmap cache
const heatmapCaches = new Map<string, { data: HeatmapData; timestamp: number }>();
const HEATMAP_CACHE_TTL = 5 * 60_000; // 5 minutes

async function computeKiraHeatmap(): Promise<HeatmapData> {
  const cached = heatmapCaches.get('kira');
  if (cached && Date.now() - cached.timestamp < HEATMAP_CACHE_TTL) return cached.data;

  return withKiraLock('kira-heatmap', async () => {
    const psScript = `
$dir = '${KIRA_SESSIONS_PATH}'
$cutoff = (Get-Date).AddDays(-30)
$grid = @{}; $daily = @{}; $sessions = 0; $msgs = 0
Get-ChildItem $dir -Filter '*.jsonl' | Where-Object { $_.LastWriteTime -ge $cutoff } | ForEach-Object {
  $sessions++
  foreach ($line in (Get-Content $_.FullName)) {
    try {
      $obj = $line | ConvertFrom-Json
      if (($obj.type -eq 'user' -or $obj.type -eq 'assistant') -and $obj.timestamp) {
        $msgs++
        $d = [datetime]::Parse($obj.timestamp)
        $key = "$([int]$d.DayOfWeek)-$($d.Hour)"
        if ($grid.ContainsKey($key)) { $grid[$key]++ } else { $grid[$key] = 1 }
        $dk = $d.ToString('yyyy-MM-dd')
        if ($daily.ContainsKey($dk)) { $daily[$dk]++ } else { $daily[$dk] = 1 }
      }
    } catch {}
  }
}
@{ grid = $grid; daily = $daily; sessions = $sessions; msgs = $msgs } | ConvertTo-Json -Compress
`.trim();

    try {
      const raw = await sshPowerShell(psScript);
      if (!raw || raw === 'null') {
        heatmapCaches.set('kira', { data: ZERO_HEATMAP, timestamp: Date.now() });
        return ZERO_HEATMAP;
      }

      const parsed = JSON.parse(raw) as {
        grid: Record<string, number>;
        daily: Record<string, number>;
        sessions: number;
        msgs: number;
      };

      // Convert "dayOfWeek-hour" keys to 7x24 array
      const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
      for (const [key, count] of Object.entries(parsed.grid || {})) {
        const [dayStr, hourStr] = key.split('-');
        const day = parseInt(dayStr, 10);
        const hour = parseInt(hourStr, 10);
        if (day >= 0 && day < 7 && hour >= 0 && hour < 24) {
          grid[day][hour] = count;
        }
      }

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

      const data: HeatmapData = {
        grid,
        dailyActivity: parsed.daily || {},
        totalSessions: parsed.sessions || 0,
        totalMessages: parsed.msgs || 0,
        peakHour,
        peakDay,
      };

      heatmapCaches.set('kira', { data, timestamp: Date.now() });
      return data;
    } catch (err) {
      console.error('Kira heatmap SSH error:', err);
      heatmapCaches.set('kira', { data: ZERO_HEATMAP, timestamp: Date.now() });
      return ZERO_HEATMAP;
    }
  });
}

async function computeHeatmap(agent: AgentId = 'finn'): Promise<HeatmapData> {
  if (agent === 'kira') return computeKiraHeatmap();

  const cached = heatmapCaches.get(agent);
  if (cached && Date.now() - cached.timestamp < HEATMAP_CACHE_TTL) {
    return cached.data;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffMs = cutoff.getTime();

  // 7 x 24 grid (day-of-week x hour)
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const dailyActivity: Record<string, number> = {};
  let totalSessions = 0;
  let totalMessages = 0;

  const projectDirs = await getProjectDirsForAgent(agent);

  let fileCount = 0;
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

        // Yield every 50 files to let other requests through
        if (++fileCount % 50 === 0) await yieldEventLoop();
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
  heatmapCaches.set(agent, { data, timestamp: Date.now() });
  return data;
}

router.get('/api/activity/heatmap', async (_req: Request, res: Response) => {
  try {
    const agent = getAgentFromReq(_req);
    const data = await computeHeatmap(agent);
    res.json(data);
  } catch (error) {
    console.error('Heatmap error:', error);
    res.status(500).json({ error: 'Failed to compute activity heatmap' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. RATE LIMIT MONITORING — Track token usage in rolling windows
// ══════════════════════════════════════════════════════════════════════════════

const KIRA_RL_CACHE_KEY = 'kira-ratelimits';
const ZERO_RATE_LIMITS = {
  rolling5h: { tokens: 0, requests: 0 },
  rolling1h: { tokens: 0, requests: 0 },
  timestamp: new Date().toISOString(),
};

async function computeKiraRateLimits() {
  const rlCached = costCaches.get(KIRA_RL_CACHE_KEY);
  if (rlCached && Date.now() - rlCached.timestamp < 60_000) return rlCached.data;

  return withKiraLock('kira-ratelimits', async () => {
    const psScript = `
$dir = '${KIRA_SESSIONS_PATH}'
$cutoff = (Get-Date).AddHours(-5)
$r = @()
Get-ChildItem $dir -Filter '*.jsonl' | Where-Object { $_.LastWriteTime -ge $cutoff } | ForEach-Object {
  foreach ($line in (Get-Content $_.FullName)) {
    try {
      $obj = $line | ConvertFrom-Json
      if ($obj.type -eq 'assistant' -and $obj.message.usage -and $obj.timestamp) {
        $r += @{ ts=$obj.timestamp; inp=$obj.message.usage.input; out=$obj.message.usage.output }
      }
    } catch {}
  }
}
$r | ConvertTo-Json -Compress
`.trim();

    try {
      const raw = await sshPowerShell(psScript);
      if (!raw || raw === 'null') return null;
      const entries: Array<{ ts: string; inp: number; out: number }> =
        Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [JSON.parse(raw)];

      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      const fiveHoursAgo = now - 5 * 60 * 60 * 1000;
      let tokens1h = 0, tokens5h = 0, req1h = 0, req5h = 0;

      for (const e of entries) {
        const ts = new Date(e.ts).getTime();
        const totalTokens = (e.inp || 0) + (e.out || 0);
        if (ts >= fiveHoursAgo) { tokens5h += totalTokens; req5h++; }
        if (ts >= oneHourAgo) { tokens1h += totalTokens; req1h++; }
      }

      const result = {
        rolling5h: { tokens: tokens5h, requests: req5h },
        rolling1h: { tokens: tokens1h, requests: req1h },
        timestamp: new Date().toISOString(),
      };
      costCaches.set(KIRA_RL_CACHE_KEY, { data: result as any, timestamp: Date.now() });
      return result;
    } catch (err) {
      console.error('Kira rate-limits SSH error:', err);
      return null;
    }
  });
}

router.get('/api/rate-limits', async (_req: Request, res: Response) => {
  try {
    const agent = getAgentFromReq(_req);

    if (agent === 'kira') {
      const rlData = await computeKiraRateLimits();
      if (rlData) return res.json(rlData);
      // Return last cached data if available, otherwise zeros
      const stale = costCaches.get(KIRA_RL_CACHE_KEY);
      return res.json(stale?.data || ZERO_RATE_LIMITS);
    }

    // Parse recent sessions (last 5 hours for rolling window)
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const projectDirs = await getProjectDirsForAgent(agent);

    let tokensLast5h = 0;
    let tokensLast1h = 0;
    let requestsLast5h = 0;
    let requestsLast1h = 0;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    let rlFileCount = 0;
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
          if (++rlFileCount % 50 === 0) await yieldEventLoop();
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

async function getFinnServiceStatus(): Promise<ServiceInfo[]> {
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

async function getKiraServiceStatus(): Promise<ServiceInfo[]> {
  const services: ServiceInfo[] = [];

  const checks: Array<{ name: string; processName: string; description: string }> = [
    { name: 'kimi-api', processName: 'node', description: 'Kimi API service' },
    { name: 'tailscale', processName: 'tailscaled', description: 'Tailscale VPN connection' },
  ];

  for (const check of checks) {
    try {
      const raw = await sshPowerShell(
        `Get-Process -Name '${check.processName}' -ErrorAction SilentlyContinue | Select-Object -First 1 | Format-List Id`
      );
      const pidMatch = raw.match(/Id\s*:\s*(\d+)/);
      if (pidMatch) {
        services.push({
          name: check.name,
          status: 'running',
          pid: parseInt(pidMatch[1], 10),
          description: check.description,
        });
      } else {
        services.push({ name: check.name, status: 'stopped', description: check.description });
      }
    } catch {
      services.push({ name: check.name, status: 'unknown', description: check.description });
    }
  }

  return services;
}

router.get('/api/services', async (_req: Request, res: Response) => {
  try {
    const agent = getAgentFromReq(_req);
    const services = agent === 'kira'
      ? await getKiraServiceStatus()
      : await getFinnServiceStatus();
    res.json({ services });
  } catch (error) {
    console.error('Services error:', error);
    res.status(500).json({ error: 'Failed to get service status' });
  }
});

router.post('/api/services/:name/restart', async (req: Request, res: Response) => {
  try {
    const agent = getAgentFromReq(req);
    const { name } = req.params;

    // Disable restart for Kira
    if (agent === 'kira') {
      return res.status(403).json({ error: 'Remote service restart is not supported for Kira' });
    }

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
