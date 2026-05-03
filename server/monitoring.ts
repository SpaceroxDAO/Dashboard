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
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const router = Router();

// Yield the event loop periodically so health checks don't get starved
function yieldEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

// ─── Agent Utilities ───

type AgentId = 'finn' | 'kira';

const FINN_PROJECT_DIR_PREFIX = '-Users-adami';

// Agent workspace and session paths.
// Finn: now on Hermes in WSL → ~/.hermes/sessions (JSON files, not JSONL — cost
//   parser may return zero since Codex OAuth is subscription-based, not per-token).
// Kira: still on Windows-native OpenClaw, mounted into WSL at /mnt/c.
const AGENT_CONFIG: Record<AgentId, { basePath: string; sessionsPath: string; sessionsPathLegacy?: string }> = {
  finn: {
    basePath: path.join(os.homedir(), 'finn'),
    sessionsPath: path.join(os.homedir(), '.hermes', 'sessions'),
  },
  kira: {
    basePath: '/mnt/c/Users/adami/kira',
    sessionsPath: '/mnt/c/Users/adami/.openclaw/agents/kira/sessions',
    sessionsPathLegacy: '/mnt/c/Users/adami/.openclaw/agents/agents/kira/sessions',
  },
};

// Hermes Neurovision event stream — single append-only JSONL the gateway writes
// for every session/agent/tool event. This is what the Hermes terminal
// neurovisualizer consumes, and it's a much cleaner live-feed source than
// post-hoc parsing of session JSON files.
const FINN_NEUROVISION_PATH = path.join(os.homedir(), '.hermes', 'neurovision', 'events.jsonl');


function isValidAgent(agent: unknown): agent is AgentId {
  return agent === 'finn' || agent === 'kira';
}

function getAgentFromReq(req: Request): AgentId {
  const agent = req.query.agent;
  return isValidAgent(agent) ? agent : 'finn';
}

/** Return the sessions path(s) for an agent */
function getSessionsPaths(agent: AgentId): string[] {
  const config = AGENT_CONFIG[agent];
  const paths = [config.sessionsPath];
  if (config.sessionsPathLegacy) paths.push(config.sessionsPathLegacy);
  return paths;
}

/** Return project dir names filtered by agent */
async function getProjectDirsForAgent(agent: AgentId): Promise<string[]> {
  const allDirs = await fs.readdir(CLAUDE_PROJECTS_PATH).catch(() => []);
  return allDirs.filter(d => d.startsWith(FINN_PROJECT_DIR_PREFIX));
}

// ─── Paths ───

const CLAUDE_PROJECTS_PATH = path.join(os.homedir(), '.claude', 'projects');

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
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  // Try prefix match for short model names (e.g. "claude-opus-4-5" → "claude-opus-4-5-20251101")
  for (const key of Object.keys(MODEL_PRICING)) {
    if (key.startsWith(model) || model.startsWith(key)) return MODEL_PRICING[key];
  }
  return DEFAULT_PRICING;
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

    // Detect Hermes flat JSONL format: lines have {role, content, timestamp} with no usage wrapper.
    // First parseable line tells us which format we have.
    let isHermesFormat = false;
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.role && obj.content !== undefined && !obj.message) {
          isHermesFormat = true;
        }
        break;
      } catch { /* keep trying */ }
    }

    if (isHermesFormat) {
      // Hermes JSONL: {role, content, timestamp}. No billing data — subscription plan.
      // Count assistant turns; estimate tokens from content char length (~4 chars/token).
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const ts = obj.timestamp as string | undefined;
          if (ts && !firstDate) firstDate = ts.slice(0, 10);
          if (ts) lastTimestamp = ts;
          if (obj.role === 'assistant') {
            messageCount++;
            const chars = typeof obj.content === 'string' ? obj.content.length : 0;
            outputTokens += Math.round(chars / 4);
          } else if (obj.role === 'user') {
            const chars = typeof obj.content === 'string' ? obj.content.length : 0;
            inputTokens += Math.round(chars / 4);
          }
          if (obj.model && obj.model !== '<synthetic>') model = obj.model;
        } catch { /* skip malformed lines */ }
      }
      if (messageCount === 0) return null;
      // Subscription plan — no per-token cost. Return early with zero cost.
      model = model === 'unknown' ? 'gpt-5.5' : model;
      const sessionId = path.basename(filePath, '.jsonl');
      const project = path.basename(path.dirname(filePath));
      return {
        sessionId,
        project,
        model,
        date: firstDate || new Date().toISOString().slice(0, 10),
        inputTokens,
        outputTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalCost: 0,
        cacheSavings: 0,
        messageCount,
        lastActivity: lastTimestamp,
      };
    } else {
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
        // Support both Claude Code format (input_tokens) and OpenClaw format (input/cacheRead)
        inputTokens += usage.input_tokens || usage.input || 0;
        outputTokens += usage.output_tokens || usage.output || 0;
        cacheReadTokens += usage.cache_read_input_tokens || usage.cacheRead || 0;
        cacheWriteTokens += usage.cache_creation_input_tokens || usage.cacheWrite || 0;

        if (msg.model && msg.model !== '<synthetic>') model = msg.model;
      } catch { /* skip malformed lines */ }
    }

    if (messageCount === 0) return null;
    } // end non-Hermes branch

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

/** Collect session files from all sessions paths for an agent, filtered by cutoff */
async function collectSessionFiles(agent: AgentId, cutoffMs: number): Promise<string[]> {
  const allFiles: string[] = [];
  for (const dirPath of getSessionsPaths(agent)) {
    try {
      const files = await fs.readdir(dirPath);
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const fPath = path.join(dirPath, f);
        const fStat = await fs.stat(fPath);
        if (fStat.mtimeMs >= cutoffMs) {
          allFiles.push(fPath);
        }
      }
    } catch { /* directory may not exist */ }
  }
  return allFiles;
}

async function computeCosts(agent: AgentId = 'finn', days: number = 30): Promise<CostSummary> {
  const cacheKey = `${agent}-${days}`;
  const cached = costCaches.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < COST_CACHE_TTL) {
    return cached.data;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();

  const allFiles = await collectSessionFiles(agent, cutoffMs);

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

/** Capture local system health snapshot (both agents run on this same Windows PC) */
async function captureLocalHealthSnapshot(): Promise<HealthSnapshot> {
  // CPU: load average (on Windows these are always 0, so we use a rough estimate)
  const loadAvg = os.loadavg();
  const cpuCount = os.cpus().length;
  const cpuPercent = Math.min(100, Math.round((loadAvg[0] / cpuCount) * 100));

  // Memory
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = memTotal - memFree;
  const memPercent = Math.round((memUsed / memTotal) * 100);

  // Disk (Windows-compatible via wmic or df in Git Bash)
  let diskUsed = 0;
  let diskTotal = 0;
  let diskPercent = 0;
  try {
    const { stdout } = await execAsync('df -k / | tail -1');
    const parts = stdout.trim().split(/\s+/);
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

function pushSnapshot(agent: AgentId, snap: HealthSnapshot) {
  healthHistories[agent].push(snap);
  if (healthHistories[agent].length > MAX_HEALTH_SNAPSHOTS) {
    healthHistories[agent].shift();
  }
}

// Both agents share the same machine, so health snapshots are identical
async function startHealthMonitoring() {
  // Initial snapshot for both agents
  try {
    const snap = await captureLocalHealthSnapshot();
    pushSnapshot('finn', snap);
    pushSnapshot('kira', snap);
  } catch { /* skip */ }

  // Every 5 minutes, capture for both
  setInterval(async () => {
    try {
      const s = await captureLocalHealthSnapshot();
      pushSnapshot('finn', s);
      pushSnapshot('kira', s);
    } catch { /* skip */ }
  }, 5 * 60 * 1000);
}

startHealthMonitoring();

router.get('/api/system/health', async (_req: Request, res: Response) => {
  try {
    const agent = getAgentFromReq(_req);
    const current = await captureLocalHealthSnapshot();
    pushSnapshot(agent, current);

    res.json({
      current,
      history: healthHistories[agent],
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

async function tailFile(filePath: string, agent: AgentId, format: 'claude' | 'openclaw' | 'hermes') {
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
      const events = format === 'hermes'
        ? parseNeurovisionEvent(line)
        : parseFeedEvent(line, path.basename(filePath, '.jsonl'), format);
      if (events) {
        for (const evt of events) broadcastSSE('message', evt, agent);
      }
    }
  } catch { /* skip */ }
}

async function startFileWatching() {
  // Finn → tail single Hermes neurovision events.jsonl. Watching the parent dir
  // and matching the basename is more reliable than watching the file itself,
  // which can break when the inode is replaced (rotation / atomic rewrite).
  try {
    const fStat = await fs.stat(FINN_NEUROVISION_PATH);
    fileOffsets.set(FINN_NEUROVISION_PATH, fStat.size);
    const dirPath = path.dirname(FINN_NEUROVISION_PATH);
    const baseName = path.basename(FINN_NEUROVISION_PATH);
    const watcher = watch(dirPath, async (_eventType, filename) => {
      if (filename !== baseName) return;
      if (sseClients.length === 0) return;
      await tailFile(FINN_NEUROVISION_PATH, 'finn', 'hermes');
    });
    watchers.push(watcher);
  } catch { /* neurovision file not yet created */ }

  // Kira → still on OpenClaw session JSONL files
  for (const dirPath of getSessionsPaths('kira')) {
    try {
      const files = await fs.readdir(dirPath);
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const fPath = path.join(dirPath, f);
        const fStat = await fs.stat(fPath);
        fileOffsets.set(fPath, fStat.size);
      }

      const watcher = watch(dirPath, async (_eventType, filename) => {
        if (!filename?.endsWith('.jsonl')) return;
        if (sseClients.length === 0) return;
        const fPath = path.join(dirPath, filename);
        await tailFile(fPath, 'kira', 'openclaw');
      });
      watchers.push(watcher);
    } catch { /* sessions dir not found */ }
  }
}

startFileWatching();

// ─── Background cache warming ───
// Pre-warm both agents at startup, then keep caches hot on intervals.

setTimeout(async () => {
  for (const agent of ['finn', 'kira'] as AgentId[]) {
    try { await computeCosts(agent); } catch { /* ignore */ }
    try { await computeHeatmap(agent); } catch { /* ignore */ }
  }
}, 100);

// Refresh costs every 5 min, heatmap every 10 min for both agents
setInterval(async () => {
  for (const agent of ['finn', 'kira'] as AgentId[]) {
    try { await computeCosts(agent); } catch { /* ignore */ }
  }
}, 5 * 60_000);

setInterval(async () => {
  for (const agent of ['finn', 'kira'] as AgentId[]) {
    try { await computeHeatmap(agent); } catch { /* ignore */ }
  }
}, 10 * 60_000);

// ─── Feed event types ───

type FeedEventType = 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'compaction' | 'model_change';
type ChannelType = 'discord' | 'telegram' | 'cron' | 'system' | 'chat';

interface FeedEvent {
  type: FeedEventType;
  timestamp: string;
  sessionId: string;
  text?: string;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
  cost?: number;
  stopReason?: string;
  hasThinking?: boolean;
  channel?: ChannelType;
  channelName?: string;
  sender?: string;
  toolName?: string;
  toolArgs?: string;
  toolCallId?: string;
  toolStatus?: 'completed' | 'error';
  toolDuration?: number;
  toolError?: string;
  tokensBefore?: number;
  provider?: string;
  modelId?: string;
}

/** Classify the channel source from a user message text */
function classifyChannel(text: string): { channel: ChannelType; channelName?: string; sender?: string } {
  // New JSON metadata format: "conversation_label": "Guild #channel-name..."
  const convLabelMatch = text.match(/"conversation_label"\s*:\s*"Guild\s+#([^"]+)"/);
  if (convLabelMatch) {
    const channelName = '#' + convLabelMatch[1].split(/\s+/)[0];
    // Extract sender from Sender metadata block
    const senderMatch = text.match(/"name"\s*:\s*"([^"]+)"/);
    return { channel: 'discord', channelName, sender: senderMatch?.[1] };
  }

  // Old-style: [Discord Guild #channel-name ...] Username (tag):
  const oldDiscordMatch = text.match(/^\[Discord Guild #(\S+)[^\]]*\]\s*(\S+)/);
  if (oldDiscordMatch) {
    return { channel: 'discord', channelName: '#' + oldDiscordMatch[1], sender: oldDiscordMatch[2] };
  }

  // Telegram
  if (/Telegram/i.test(text.slice(0, 200))) {
    return { channel: 'telegram' };
  }

  // Cron: [cron:UUID job-name]
  const cronMatch = text.match(/^\[cron:[a-f0-9-]+\s+([^\]]+)\]/);
  if (cronMatch) {
    return { channel: 'cron', channelName: cronMatch[1].trim() };
  }

  // System: prefix or NO_REPLY
  if (/^System:/i.test(text) || text.trim() === 'NO_REPLY') {
    return { channel: 'system' };
  }

  return { channel: 'chat' };
}

/** Strip verbose metadata preambles from user message text */
function stripChannelMetadata(text: string): string {
  let cleaned = text;

  // Strip "Conversation info (untrusted metadata): ```json...```" blocks
  cleaned = cleaned.replace(/Conversation info \(untrusted metadata\):\s*```json[\s\S]*?```\s*/g, '');

  // Strip "Sender (untrusted metadata): ```json...```" blocks
  cleaned = cleaned.replace(/Sender \(untrusted metadata\):\s*```json[\s\S]*?```\s*/g, '');

  // Strip old-style [Discord Guild #channel...] Username (tag): prefix
  cleaned = cleaned.replace(/^\[Discord Guild #[^\]]*\]\s*\S+\s*\([^)]*\):\s*/m, '');

  // Strip [cron:UUID name] prefix
  cleaned = cleaned.replace(/^\[cron:[a-f0-9-]+\s+[^\]]*\]\s*/m, '');

  // Strip System: prefix with timestamp
  cleaned = cleaned.replace(/^System:\s*(\[[^\]]*\]\s*)?/m, '');

  return cleaned.trim();
}

/** Brief description of tool call arguments */
function summarizeToolArgs(toolName: string, args: any): string {
  if (!args || typeof args !== 'object') return '';
  try {
    switch (toolName) {
      case 'exec':
      case 'terminal':
        return (args.command || '').slice(0, 100);
      case 'read':
      case 'write':
      case 'edit':
      case 'read_file':
      case 'write_file':
        return args.file_path || args.path || args.filePath || '';
      case 'patch':
        return `${args.mode || 'patch'} ${args.path || ''}`.trim();
      case 'search_files':
        return `${args.pattern || ''} in ${args.path || '.'}`.slice(0, 100);
      case 'session_search':
        return (args.query || '').slice(0, 100);
      case 'memory':
        return `${args.action || ''} ${args.target || ''}`.trim();
      case 'skill_view':
        return args.name || '';
      case 'todo':
        return Array.isArray(args.todos) ? `${args.todos.length} todos` : '';
      case 'message':
        return 'send to discord';
      case 'cron':
        if (args.action === 'list') return 'list';
        return args.action ? `${args.action} ${args.name || ''}`.trim() : '';
      default:
        return JSON.stringify(args).slice(0, 100);
    }
  } catch {
    return '';
  }
}

/** Extract feed events from a JSONL line. Returns an array (one line can produce multiple events). */
function parseFeedEvent(line: string, sessionId: string, format: 'claude' | 'openclaw'): FeedEvent[] | null {
  try {
    const obj = JSON.parse(line);
    const ts = obj.timestamp;
    if (!ts) return null;
    const sid = sessionId.slice(0, 8);

    // ─── Compaction event ───
    if (obj.type === 'compaction') {
      // Try to extract token count from summary
      const tokenMatch = obj.summary?.match(/(\d[\d,]+)\s*tokens/);
      const tokensBefore = tokenMatch ? parseInt(tokenMatch[1].replace(/,/g, ''), 10) : undefined;
      return [{
        type: 'compaction',
        timestamp: ts,
        sessionId: sid,
        tokensBefore,
        text: obj.summary?.match(/<modified-files>([\s\S]*?)<\/modified-files>/)?.[1]?.trim(),
      }];
    }

    // ─── Model change event ───
    if (obj.type === 'model_change') {
      return [{
        type: 'model_change',
        timestamp: ts,
        sessionId: sid,
        provider: obj.provider,
        modelId: obj.modelId,
      }];
    }

    // ─── Skip non-message types ───
    if (format === 'openclaw') {
      if (obj.type !== 'message') return null;
    } else {
      if (obj.type !== 'user' && obj.type !== 'assistant') return null;
    }

    const msg = typeof obj.message === 'object' ? obj.message : null;
    if (!msg) return null;

    const role = format === 'openclaw' ? msg.role : obj.type;
    // Skip delivery-mirror model (outbound copies, zero tokens)
    if (msg.model === 'delivery-mirror') return null;

    const content = msg.content;
    if (!Array.isArray(content) && typeof content !== 'string') return null;

    const contentArray = Array.isArray(content) ? content : [{ type: 'text', text: content }];

    // ─── Tool result ───
    if (role === 'toolResult') {
      const details = msg.details;
      const resultText = contentArray.find((c: any) => c.type === 'text')?.text;
      return [{
        type: 'tool_result',
        timestamp: ts,
        sessionId: sid,
        toolName: msg.toolName,
        toolCallId: msg.toolCallId,
        toolStatus: details?.status === 'error' || details?.exitCode ? (details.exitCode === 0 ? 'completed' : 'error') : (details?.status || 'completed'),
        toolDuration: details?.durationMs,
        toolError: details?.status === 'error' ? resultText?.slice(0, 200) : undefined,
      }];
    }

    if (role !== 'user' && role !== 'assistant') return null;

    const events: FeedEvent[] = [];

    // Usage & cost from assistant messages
    const usage = msg.usage;
    let usageData: { inputTokens: number; outputTokens: number } | undefined;
    let cost: number | undefined;
    if (usage) {
      if (format === 'openclaw') {
        usageData = { inputTokens: usage.input || 0, outputTokens: usage.output || 0 };
        cost = usage.cost?.total;
      } else {
        usageData = { inputTokens: usage.input_tokens || 0, outputTokens: usage.output_tokens || 0 };
      }
      // Calculate cost from tokens if not provided
      if (cost === undefined && msg.model) {
        const pricing = getPricing(msg.model);
        cost =
          tokenCost(usageData!.inputTokens, pricing.input) +
          tokenCost(usageData!.outputTokens, pricing.output) +
          tokenCost(usage.cache_read_input_tokens || usage.cacheRead || 0, pricing.cacheRead) +
          tokenCost(usage.cache_creation_input_tokens || usage.cacheWrite || 0, pricing.cacheWrite);
      }
    }

    // Check for thinking block
    const hasThinking = contentArray.some((c: any) => c.type === 'thinking');

    // ─── Extract text content ───
    const textBlock = contentArray.find((c: any) => c.type === 'text');
    if (textBlock?.text) {
      if (role === 'user') {
        const channelInfo = classifyChannel(textBlock.text);
        const cleanedText = stripChannelMetadata(textBlock.text);
        // Filter out NO_REPLY system signals
        if (cleanedText && cleanedText.trim() !== 'NO_REPLY') {
          events.push({
            type: 'user',
            timestamp: ts,
            sessionId: sid,
            text: cleanedText.slice(0, 500),
            channel: channelInfo.channel,
            channelName: channelInfo.channelName,
            sender: channelInfo.sender || 'Adam',
          });
        }
      } else {
        events.push({
          type: 'assistant',
          timestamp: ts,
          sessionId: sid,
          text: textBlock.text.slice(0, 500),
          model: msg.model,
          usage: usageData,
          cost: cost !== undefined ? Math.round(cost * 10000) / 10000 : undefined,
          hasThinking,
          stopReason: msg.stopReason,
        });
      }
    }

    // ─── Extract tool calls from assistant messages ───
    if (role === 'assistant') {
      for (const block of contentArray) {
        if (block.type === 'toolCall') {
          events.push({
            type: 'tool_call',
            timestamp: ts,
            sessionId: sid,
            toolName: block.name,
            toolCallId: block.id,
            toolArgs: summarizeToolArgs(block.name, block.arguments),
          });
        }
      }

      // If assistant had no text but had tool calls, attach usage/cost/thinking to first tool_call
      if (!textBlock?.text && events.length > 0 && events[0].type === 'tool_call') {
        events[0].usage = usageData;
        events[0].cost = cost !== undefined ? Math.round(cost * 10000) / 10000 : undefined;
        events[0].hasThinking = hasThinking;
        events[0].model = msg.model;
      }
    }

    return events.length > 0 ? events : null;
  } catch { return null; }
}

/** Parse one line from ~/.hermes/neurovision/events.jsonl (Hermes' live event
 *  stream — same source the terminal neurovisualizer consumes) into the
 *  dashboard's FeedEvent shape. Schema:
 *    { timestamp: <epoch float>, event_type: 'session:start'|'agent:start'|'agent:step'|'agent:end',
 *      context: { platform, session_id, message?, response?, tools?: [{name, arguments, result}] } }
 */
function parseNeurovisionEvent(line: string): FeedEvent[] | null {
  try {
    const obj = JSON.parse(line);
    const ts = obj.timestamp;
    const evtType = obj.event_type;
    const ctx = obj.context || {};
    if (typeof ts !== 'number' || !evtType) return null;

    const isoTs = new Date(ts * 1000).toISOString();
    const sid = String(ctx.session_id || '').slice(0, 8);
    const platform = String(ctx.platform || '');
    const channel: ChannelType | undefined =
      platform === 'telegram' ? 'telegram' :
      platform === 'discord' ? 'discord' :
      platform === 'cron' ? 'cron' :
      platform === 'system' ? 'system' :
      undefined;

    const events: FeedEvent[] = [];

    // User inbound message (start of a turn)
    if (evtType === 'agent:start' && ctx.message) {
      events.push({
        type: 'user',
        timestamp: isoTs,
        sessionId: sid,
        text: String(ctx.message).slice(0, 500),
        channel,
        sender: 'Adam',
      });
    }

    // Assistant final reply (end of a turn). agent:end also echoes the
    // inbound message but we already emitted that on agent:start.
    if (evtType === 'agent:end' && ctx.response) {
      events.push({
        type: 'assistant',
        timestamp: isoTs,
        sessionId: sid,
        text: String(ctx.response).slice(0, 500),
      });
    }

    // Tool calls + results from each step. Hermes already pairs args with the
    // result on the same step, so we emit a tool_call followed by a tool_result
    // with the same iso timestamp.
    if (evtType === 'agent:step' && Array.isArray(ctx.tools)) {
      for (const tool of ctx.tools) {
        if (!tool?.name) continue;
        const parsedArgs = typeof tool.arguments === 'string'
          ? safeJsonParseOrNull(tool.arguments)
          : tool.arguments;
        events.push({
          type: 'tool_call',
          timestamp: isoTs,
          sessionId: sid,
          toolName: tool.name,
          toolArgs: summarizeToolArgs(tool.name, parsedArgs),
        });
        if (tool.result !== undefined) {
          const parsedResult = typeof tool.result === 'string'
            ? safeJsonParseOrNull(tool.result)
            : tool.result;
          const isError = parsedResult && typeof parsedResult === 'object' &&
            (parsedResult.success === false || parsedResult.error);
          events.push({
            type: 'tool_result',
            timestamp: isoTs,
            sessionId: sid,
            toolName: tool.name,
            toolStatus: isError ? 'error' : 'completed',
            toolError: isError && parsedResult.error
              ? String(parsedResult.error).slice(0, 200)
              : undefined,
          });
        }
      }
    }

    return events.length > 0 ? events : null;
  } catch { return null; }
}

function safeJsonParseOrNull(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

/** Send recent history to a newly connected SSE client.
 *  Finn → Hermes neurovision events.jsonl (single file, append-only)
 *  Kira → OpenClaw session JSONL files in sessions dirs */
async function backfillAgentFeed(agent: AgentId, res: Response) {
  try {
    const recentEvents: FeedEvent[] = [];

    if (agent === 'finn') {
      const content = await fs.readFile(FINN_NEUROVISION_PATH, 'utf-8').catch(() => '');
      const lines = content.trim().split('\n').filter(Boolean);
      // Include the full event stream (tools + turns) so the backfill matches
      // what the Hermes neurovisualizer shows — agents-doing-things activity,
      // not just human-readable turn boundaries. The frontend has a Wrench
      // toggle to hide tools if the user wants a quieter view.
      for (const line of lines.slice(-200)) {
        const events = parseNeurovisionEvent(line);
        if (events) recentEvents.push(...events);
      }
    } else {
      const allWithStats: Array<{ f: string; fPath: string; mtimeMs: number }> = [];
      for (const dirPath of getSessionsPaths(agent)) {
        try {
          const files = await fs.readdir(dirPath);
          const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
          for (const f of jsonlFiles) {
            const fPath = path.join(dirPath, f);
            const fStat = await fs.stat(fPath);
            allWithStats.push({ f, fPath, mtimeMs: fStat.mtimeMs });
          }
        } catch { /* dir may not exist */ }
      }
      allWithStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

      // Take last 10 lines from 3 most recent session files
      for (const { f, fPath } of allWithStats.slice(0, 3)) {
        const content = await fs.readFile(fPath, 'utf-8');
        const lines = content.trim().split('\n');
        for (const line of lines.slice(-10)) {
          const events = parseFeedEvent(line, f.replace('.jsonl', ''), 'openclaw');
          if (events) {
            for (const evt of events) {
              if (evt.type !== 'tool_call' && evt.type !== 'tool_result') {
                recentEvents.push(evt);
              }
            }
          }
        }
      }
    }

    recentEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    // 80 ≈ a few turns including their tool fan-out; below the frontend's MAX_MESSAGES (100)
    for (const evt of recentEvents.slice(-80)) {
      try { res.write(`event: message\ndata: ${JSON.stringify(evt)}\n\n`); } catch { break; }
    }
  } catch { /* skip */ }
}

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

  // Backfill recent history so the feed isn't empty on connect
  // Both agents are local now, so use the same backfill logic
  backfillAgentFeed(agent, res);

  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = sseClients.findIndex(c => c.id === clientId);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3b. REST FEED ENDPOINT — Return recent feed events as JSON (for Kira cron)
// ══════════════════════════════════════════════════════════════════════════════

router.get('/api/feed/recent', async (req: Request, res: Response) => {
  try {
    const agent = getAgentFromReq(req);
    const limit = Math.min(parseInt((req.query.limit as string) || '30', 10), 100);
    const minutes = Math.min(parseInt((req.query.minutes as string) || '60', 10), 1440);
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);

    const events: FeedEvent[] = [];

    if (agent === 'finn') {
      // Hermes neurovision events.jsonl is one append-only file. Read the tail
      // (last ~2000 lines is plenty for a 24-hour window of a chatty agent).
      const content = await fs.readFile(FINN_NEUROVISION_PATH, 'utf-8').catch(() => '');
      const lines = content.trim().split('\n').filter(Boolean).slice(-2000);
      for (const line of lines) {
        const parsed = parseNeurovisionEvent(line);
        if (!parsed) continue;
        for (const evt of parsed) {
          if (evt.timestamp && new Date(evt.timestamp) >= cutoff) {
            events.push(evt);
          }
        }
      }
    } else {
      // Kira: still on OpenClaw session files
      const allWithStats: Array<{ f: string; fPath: string; mtimeMs: number }> = [];
      for (const dirPath of getSessionsPaths(agent)) {
        try {
          const files = await fs.readdir(dirPath);
          const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
          for (const f of jsonlFiles) {
            const fPath = path.join(dirPath, f);
            const fStat = await fs.stat(fPath);
            allWithStats.push({ f, fPath, mtimeMs: fStat.mtimeMs });
          }
        } catch { /* dir not found */ }
      }
      allWithStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

      for (const { f, fPath } of allWithStats.slice(0, 5)) {
        try {
          const content = await fs.readFile(fPath, 'utf-8');
          const lines = content.trim().split('\n');
          for (const line of lines) {
            const parsed = parseFeedEvent(line, f.replace('.jsonl', ''), 'openclaw');
            if (!parsed) continue;
            for (const evt of parsed) {
              if (evt.timestamp && new Date(evt.timestamp) >= cutoff) {
                events.push(evt);
              }
            }
          }
        } catch { /* skip unreadable file */ }
      }
    }

    // Sort by timestamp and apply limit
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const trimmed = events.slice(-limit);

    // Compute summary stats for quick consumption
    const errorCount = trimmed.filter(e => e.type === 'tool_result' && e.toolStatus === 'error').length;
    const toolCallCount = trimmed.filter(e => e.type === 'tool_call').length;
    const userMsgCount = trimmed.filter(e => e.type === 'user').length;
    const assistantMsgCount = trimmed.filter(e => e.type === 'assistant').length;
    const compactionCount = trimmed.filter(e => e.type === 'compaction').length;

    res.json({
      agent,
      eventCount: trimmed.length,
      timeRange: {
        from: trimmed[0]?.timestamp || null,
        to: trimmed[trimmed.length - 1]?.timestamp || null,
      },
      summary: {
        userMessages: userMsgCount,
        assistantMessages: assistantMsgCount,
        toolCalls: toolCallCount,
        toolErrors: errorCount,
        compactions: compactionCount,
      },
      events: trimmed,
    });
  } catch (error) {
    console.error('Feed recent error:', error);
    res.status(500).json({ error: 'Failed to get recent feed events' });
  }
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

async function computeHeatmap(agent: AgentId = 'finn'): Promise<HeatmapData> {
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

  // Read from all session directories for this agent
  let fileCount = 0;
  for (const dirPath of getSessionsPaths(agent)) {
    try {
      const files = await fs.readdir(dirPath);
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const fPath = path.join(dirPath, f);
        const fStat = await fs.stat(fPath);
        if (fStat.mtimeMs < cutoffMs) continue;

        totalSessions++;

        try {
          const content = await fs.readFile(fPath, 'utf-8');
          const lines = content.trim().split('\n');
          for (const line of lines) {
            try {
              const obj = JSON.parse(line);
              if (!obj.timestamp) continue;
              if (obj.type === 'message') {
                const role = obj.message?.role;
                if (role !== 'user' && role !== 'assistant') continue;
              } else if (obj.type !== 'user' && obj.type !== 'assistant') {
                continue;
              }
              totalMessages++;

              const d = new Date(obj.timestamp);
              if (d.getTime() < cutoffMs) continue;

              const dayOfWeek = d.getDay();
              const hour = d.getHours();
              grid[dayOfWeek][hour]++;

              const dateStr = d.toISOString().slice(0, 10);
              dailyActivity[dateStr] = (dailyActivity[dateStr] || 0) + 1;
            } catch { /* skip */ }
          }
        } catch { /* skip */ }

        if (++fileCount % 50 === 0) await yieldEventLoop();
      }
    } catch { /* dir not found */ }
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

router.get('/api/rate-limits', async (_req: Request, res: Response) => {
  try {
    const agent = getAgentFromReq(_req);

    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    let tokensLast5h = 0;
    let tokensLast1h = 0;
    let requestsLast5h = 0;
    let requestsLast1h = 0;

    let rlFileCount = 0;
    for (const dirPath of getSessionsPaths(agent)) {
      try {
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
              const totalTokens = (usage.input_tokens || usage.input || 0) +
                (usage.output_tokens || usage.output || 0) +
                (usage.cache_read_input_tokens || usage.cacheRead || 0) +
                (usage.cache_creation_input_tokens || usage.cacheWrite || 0);

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
      } catch { /* dir not found */ }
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

async function getAgentServiceStatus(agent: AgentId): Promise<ServiceInfo[]> {
  const services: ServiceInfo[] = [];
  const config = AGENT_CONFIG[agent];

  // 1. API Server — if we're serving this request, we're running (only show for finn)
  if (agent === 'finn') {
    services.push({ name: 'api-server', status: 'running', pid: process.pid, description: 'Dashboard API server (port 3001)' });
  }

  // 2. Agent gateway: Hermes for Finn, OpenClaw for Kira
  if (agent === 'finn') {
    try {
      const { stdout } = await execAsync('hermes gateway status 2>&1', { timeout: 10000 });
      // Hermes prints "✓ Gateway is running (PID: NNNN)" when up
      const isOk = stdout.includes('Gateway is running') || stdout.includes('✓');
      services.push({
        name: 'hermes-gateway',
        status: isOk ? 'running' : 'stopped',
        description: 'Hermes agent gateway (Finn, GPT-5.5 via Codex OAuth)',
      });
    } catch {
      services.push({
        name: 'hermes-gateway',
        status: 'unknown',
        description: 'Hermes agent gateway (Finn, GPT-5.5 via Codex OAuth)',
      });
    }

    // Telegram bot for Finn (analogous to Kira's discord check below)
    services.push({
      name: 'telegram',
      status: 'running',  // Tracked by gateway; shown for parity with Kira services list
      description: 'Telegram bot (@FinnTheFox_bot) — handled by hermes gateway',
    });
  } else {
    // Kira on Windows-native OpenClaw — openclaw CLI not in WSL PATH;
    // can't run the health check from here. Surface as "unknown" honestly.
    services.push({
      name: 'openclaw-gateway',
      status: 'unknown',
      description: 'OpenClaw agent gateway (Kira) — Windows-native, not directly reachable from WSL dashboard',
    });
  }

  // 3. Tailscale — check if tailscaled is running (shared by both agents on same machine)
  try {
    const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq tailscaled.exe" /NH 2>nul', { timeout: 5000 });
    const isRunning = stdout.includes('tailscaled.exe');
    services.push({ name: 'tailscale', status: isRunning ? 'running' : 'stopped', description: 'Tailscale VPN connection' });
  } catch {
    services.push({ name: 'tailscale', status: 'unknown', description: 'Tailscale VPN connection' });
  }

  // 4. For Kira, check Discord bot
  if (agent === 'kira') {
    try {
      const { stdout } = await execAsync('openclaw gateway health 2>&1', { timeout: 10000 });
      const discordOk = stdout.includes('Discord: ok');
      services.push({ name: 'discord', status: discordOk ? 'running' : 'stopped', description: 'Discord bot (@KiraBot)' });
    } catch {
      services.push({ name: 'discord', status: 'unknown', description: 'Discord bot (@KiraBot)' });
    }
  }

  return services;
}

router.get('/api/services', async (_req: Request, res: Response) => {
  try {
    const agent = getAgentFromReq(_req);
    const services = await getAgentServiceStatus(agent);
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

    // Only allow specific services to be restarted
    const agentBase = AGENT_CONFIG[agent].basePath;
    const restartCommands: Record<string, { kill: string; start?: string }> = {
      'api-server': {
        kill: "taskkill /F /FI \"WINDOWTITLE eq tsx*\" 2>nul || true",
        start: `cd "${path.join(agentBase, 'agent-dashboard', 'server')}" && npx tsx index.ts &`,
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
