import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile, exec, spawn } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import monitoringRouter from './monitoring.js';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const app = express();
const PORT = process.env.API_PORT || 3001;

// Per-agent base paths (both local on this Windows PC)
const AGENT_BASES: Record<string, string> = {
  finn: path.join(os.homedir(), 'finn'),
  kira: path.join(os.homedir(), 'kira'),
};

// Default agent paths (Finn is the primary agent for the dashboard)
const AGENTS_BASE_PATH = AGENT_BASES.finn;
const MEMORY_PATH = path.join(AGENTS_BASE_PATH, 'memory');
const SKILLS_PATH = path.join(AGENTS_BASE_PATH, 'skills');
const SCRIPTS_PATH = path.join(AGENTS_BASE_PATH, 'scripts');
const HEALTH_PATH = path.join(MEMORY_PATH, 'health');

/** Get base path for an agent */
function agentBasePath(agentId: string): string {
  return AGENT_BASES[agentId] || AGENT_BASES.finn;
}

/** Get memory path for an agent */
function agentMemoryPath(agentId: string): string {
  return path.join(agentBasePath(agentId), 'memory');
}

/** Get runtime state path for an agent.
 *  Finn now lives on Hermes (~/.hermes), Kira still on OpenClaw on Windows-native
 *  (read from the Windows mount when the dashboard server runs in WSL). */
function agentOpenClawPath(agentId: string): string {
  if (agentId === 'finn') return path.join(os.homedir(), '.hermes');
  // Kira's OpenClaw config lives on the Windows side of RexIII
  return '/mnt/c/Users/adami/.openclaw';
}

// Chrome Private Network Access: must come BEFORE cors() to handle preflight
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});
app.use(cors());
app.use(express.json());

// Serve the built React SPA from dist/ (same-origin avoids Chrome PNA blocking
// when the dashboard is hit via Tailscale Funnel from a public Vercel page).
const DIST_PATH = path.join(AGENTS_BASE_PATH, 'agent-dashboard', 'dist');
app.use(express.static(DIST_PATH));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Health Data (Oura) ───

// Health/Oura ingest stopped 2026-02-16 (the ingest cron lived on the
// decommissioned macOS VM). Anything older than this threshold is presented as
// "no recent data" rather than silently surfacing months-old numbers as "today".
const HEALTH_STALE_DAYS = 7;

app.get('/api/health-data', async (req, res) => {
  try {
    const files = await fs.readdir(HEALTH_PATH);
    const mdFiles = files.filter(f => f.endsWith('.md')).sort().reverse();

    const latestFile = mdFiles[0];
    const latestDate = latestFile?.replace('.md', '');
    const ageMs = latestFile
      ? Date.now() - new Date(latestDate).getTime()
      : Infinity;
    const ageDays = Number.isFinite(ageMs) ? Math.floor(ageMs / (24 * 60 * 60 * 1000)) : null;
    const stale = ageDays !== null && ageDays > HEALTH_STALE_DAYS;

    if (stale) {
      return res.json({ data: [], stale: true, latestEntryDate: latestDate, ageDays, reason: 'Oura ingest pipeline not running on Hermes yet' });
    }

    const healthRecords = await Promise.all(
      mdFiles.map(async (file) => {
        const content = await fs.readFile(path.join(HEALTH_PATH, file), 'utf-8');
        return parseHealthFile(file, content);
      })
    );

    res.json({ data: healthRecords, stale: false, latestEntryDate: latestDate, ageDays });
  } catch (error) {
    console.error('Health data error:', error);
    res.status(500).json({ error: 'Failed to read health data' });
  }
});

function parseHealthFile(filename: string, content: string) {
  const date = filename.replace('.md', '');

  const parseNum = (label: string): number | null => {
    const match = content.match(new RegExp(`- ${label}:\\s*(\\d+)`));
    return match ? parseInt(match[1]) : null;
  };

  return {
    date,
    sleep: { score: parseNum('Sleep') ?? 0 },
    readiness: { score: parseNum('Readiness') ?? 0, hrv: parseNum('HRV') ?? 0 },
    activity: { score: parseNum('Activity') ?? 0 },
    heartRate: { restingHr: parseNum('Resting HR') ?? 0 },
  };
}

// ─── Skills (from skills/ directory) ───

app.get('/api/skills', async (req, res) => {
  try {
    const entries = await fs.readdir(SKILLS_PATH, { withFileTypes: true });
    const skillDirs = entries.filter(e => e.isDirectory());
    const skillStates = await readSkillStates();

    const skills = await Promise.all(
      skillDirs.map(async (dir) => {
        const skillPath = path.join(SKILLS_PATH, dir.name);
        let description = '';
        let name = prettyCategoryName(dir.name);

        // Try to read SKILL.md or README.md for description
        for (const docFile of ['SKILL.md', 'README.md']) {
          try {
            const content = await fs.readFile(path.join(skillPath, docFile), 'utf-8');
            const firstLine = content.split('\n').find(l => l.startsWith('#'));
            if (firstLine) {
              name = firstLine.replace(/^#+\s*/, '').trim();
            }
            // Get first non-header, non-empty line as description
            const descLine = content.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('---'));
            if (descLine) description = descLine.trim();
            break;
          } catch {
            // File doesn't exist, continue
          }
        }

        // Count files in skill directory
        const allFiles = await fs.readdir(skillPath);

        return {
          id: dir.name,
          agentId: 'finn',
          name,
          description: description || `${name} skill`,
          icon: guessSkillIcon(dir.name),
          category: guessSkillCategory(dir.name),
          enabled: skillStates[dir.name] !== false,
          commands: [],
          fileCount: allFiles.length,
        };
      })
    );

    res.json({ skills });
  } catch (error) {
    console.error('Skills error:', error);
    res.status(500).json({ error: 'Failed to list skills' });
  }
});

function guessSkillIcon(name: string): string {
  const iconMap: Record<string, string> = {
    'icloud-findmy': 'map-pin',
    'meal-planner': 'utensils',
    'email-podcast': 'headphones',
    'work-calendar': 'calendar',
    'task-sync': 'check-circle',
    'nightly-build': 'moon',
    'coding-agent': 'code',
    'github-pr-monitor': 'git-pull-request',
    'linkedin': 'briefcase',
    'spotify-player': 'music',
    'kira-supervisor': 'eye',
    'browser-login': 'globe',
    'knowledge-synthesis': 'brain',
    'memory-recency': 'database',
    'model-routing': 'cpu',
    'job-offer-tracker': 'target',
    'date-wingman': 'heart',
    'daily-dashboard': 'layout-dashboard',
    'context-recovery': 'refresh-cw',
    'continuous-learning': 'book-open',
    'skill-reviewer': 'search',
    'mcp-gateway': 'server',
    'agent-teams-pipeline': 'users',
    'answeroverflow': 'message-circle',
    'moltbook': 'book',
    'claude-code-logs': 'terminal',
  };
  return iconMap[name] || 'zap';
}

function guessSkillCategory(name: string): string {
  const integrations = ['icloud-findmy', 'linkedin', 'spotify-player', 'work-calendar', 'github-pr-monitor', 'moltbook', 'answeroverflow'];
  const core = ['memory-recency', 'model-routing', 'context-recovery', 'task-sync', 'mcp-gateway', 'browser-login', 'coding-agent', 'claude-code-logs'];
  if (integrations.includes(name)) return 'integration';
  if (core.includes(name)) return 'core';
  return 'custom';
}

// ─── Skill detail & toggle ───

// Legacy file — toggle endpoint still writes here for now (Hermes' real
// enable/disable lives in `hermes skills config`, which isn't programmatic).
const SKILL_STATES_PATH = path.join(MEMORY_PATH, 'system', 'skill-states.json');
const HERMES_SKILLS_SNAPSHOT_PATH = path.join(os.homedir(), '.hermes', '.skills_prompt_snapshot.json');

/** Read enabled skill state. The canonical source is the Hermes prompt
 *  snapshot — every skill present in the manifest is loaded into the agent's
 *  prompt (i.e. enabled). The legacy skill-states.json layered an explicit
 *  user-disable on top; we still honour those overrides. */
async function readSkillStates(): Promise<Record<string, boolean>> {
  const states: Record<string, boolean> = {};
  // 1) Mark every skill in the Hermes manifest as enabled
  try {
    const raw = await fs.readFile(HERMES_SKILLS_SNAPSHOT_PATH, 'utf-8');
    const snapshot = JSON.parse(raw);
    const manifest = snapshot?.manifest;
    if (manifest && typeof manifest === 'object') {
      for (const key of Object.keys(manifest)) {
        // Manifest keys look like "finn/<skill>/SKILL.md" or "<category>/<skill>/SKILL.md"
        const match = key.match(/^(?:finn\/)?([^/]+)\/SKILL\.md$/);
        if (match) states[match[1]] = true;
      }
    }
  } catch { /* snapshot missing — fall back to legacy file below */ }

  // 2) Layer the legacy explicit disables on top
  try {
    const content = await fs.readFile(SKILL_STATES_PATH, 'utf-8');
    const legacy = JSON.parse(content);
    for (const [k, v] of Object.entries(legacy as Record<string, boolean>)) {
      if (v === false) states[k] = false;
    }
    return states;
  } catch {
    return states;  // legacy file missing is fine — Hermes manifest already populated
  }
}

app.get('/api/skills/:id', async (req, res) => {
  try {
    const skillId = req.params.id;
    const skillPath = path.join(SKILLS_PATH, skillId);

    let documentation = '';
    for (const docFile of ['SKILL.md', 'README.md']) {
      try {
        documentation = await fs.readFile(path.join(skillPath, docFile), 'utf-8');
        break;
      } catch { /* next */ }
    }

    const files = await fs.readdir(skillPath).catch(() => []);
    const states = await readSkillStates();

    res.json({
      id: skillId,
      documentation,
      files,
      fileCount: files.length,
      enabled: states[skillId] !== false,
    });
  } catch (error) {
    console.error('Skill detail error:', error);
    res.status(500).json({ error: 'Failed to load skill detail' });
  }
});

app.patch('/api/skills/:id/toggle', async (req, res) => {
  try {
    const skillId = req.params.id;
    const { enabled } = req.body;

    // Verify skill exists
    await fs.access(path.join(SKILLS_PATH, skillId));

    // Ensure system directory exists
    await fs.mkdir(path.join(MEMORY_PATH, 'system'), { recursive: true });

    const states = await readSkillStates();
    states[skillId] = enabled;
    await fs.writeFile(SKILL_STATES_PATH, JSON.stringify(states, null, 2));

    res.json({ success: true, id: skillId, enabled });
  } catch (error) {
    console.error('Skill toggle error:', error);
    res.status(500).json({ error: 'Failed to toggle skill' });
  }
});

// ─── Tasks (from memory/tasks.md) ───

app.get('/api/tasks', async (req, res) => {
  try {
    const content = await fs.readFile(path.join(MEMORY_PATH, 'tasks.md'), 'utf-8');
    const tasks = parseTasksFile(content);
    res.json({ tasks });
  } catch (error) {
    console.error('Tasks error:', error);
    res.status(500).json({ error: 'Failed to read tasks' });
  }
});

function parseTasksFile(content: string) {
  const tasks: Array<{
    id: string;
    agentId: string;
    title: string;
    completed: boolean;
    priority: 'high' | 'medium' | 'low';
    category: string;
    createdAt: Date;
  }> = [];

  let currentSection = '';
  let currentPriority: 'high' | 'medium' | 'low' = 'medium';
  let idx = 0;

  for (const line of content.split('\n')) {
    // Track section headers
    if (line.startsWith('## ')) {
      currentSection = line.replace(/^##\s*/, '').trim();
      continue;
    }
    if (line.startsWith('### ')) {
      const header = line.toLowerCase();
      if (header.includes('high')) currentPriority = 'high';
      else if (header.includes('medium')) currentPriority = 'medium';
      else if (header.includes('low')) currentPriority = 'low';

      // Extract category from header
      const catMatch = line.match(/\(([^)]+)\)/);
      if (catMatch) currentSection = catMatch[1];
      continue;
    }

    // Parse task lines
    const taskMatch = line.match(/^-\s*\[([ x~])\]\s*\*?\*?(.+?)(?:\*?\*?\s*(?:—.*)?)?$/);
    if (taskMatch) {
      const [, status, rawTitle] = taskMatch;
      const projectMatch = rawTitle.match(/(?:^|\s)#([\w-]+)/);
      const project = projectMatch ? projectMatch[1] : undefined;
      const titleWithoutTag = rawTitle.replace(/\s*#[\w-]+/, '').trim();
      idx++;
      tasks.push({
        id: `task-${idx}`,
        agentId: 'finn',
        title: titleWithoutTag.replace(/\*\*/g, '').trim(),
        completed: status === 'x',
        priority: currentPriority,
        category: currentSection,
        project,
        createdAt: new Date(),
      });
    }
  }

  return tasks;
}

// ─── Kanban: Task File AST + Mutation Endpoints ───

type KanbanColumnId = 'inbox' | 'in-progress' | 'backlog' | 'blocked' | 'done';
type TaskStatusMark = ' ' | 'x' | '~';

interface ASTNode {
  type: 'heading' | 'task' | 'text' | 'subheading';
  raw: string; // original line(s)
  // heading/subheading fields
  level?: number;
  title?: string;
  // task fields
  taskStatus?: TaskStatusMark;
  taskTitle?: string;
  taskId?: string;
  priority?: 'high' | 'medium' | 'low';
  category?: string;
  column?: KanbanColumnId;
  // subheading priority tracking
  subPriority?: 'high' | 'medium' | 'low';
  subCategory?: string;
  project?: string;
}

function makeTaskId(agentId: string, title: string): string {
  return createHash('sha256')
    .update(`${agentId}:${title}`)
    .digest('hex')
    .slice(0, 12);
}

/** Determine which kanban column a ## section maps to */
function sectionToColumn(sectionTitle: string): KanbanColumnId | null {
  const lower = sectionTitle.toLowerCase().trim();
  if (lower === 'inbox') return 'inbox';
  if (lower === 'in progress') return 'in-progress';
  if (lower === 'backlog') return 'backlog';
  if (lower === 'blocked') return 'blocked';
  if (lower.startsWith('done')) return 'done';
  // "New This Build Cycle" sections → done (they contain completed tasks)
  if (lower.startsWith('new this build cycle')) return 'done';
  return null;
}

function columnToSectionTitle(col: KanbanColumnId): string {
  switch (col) {
    case 'inbox': return 'Inbox';
    case 'in-progress': return 'In Progress';
    case 'backlog': return 'Backlog';
    case 'blocked': return 'Blocked';
    case 'done': return 'Done';
  }
}

/** Parse tasks.md into an AST of nodes, preserving all original lines */
function parseTaskFileAST(content: string, agentId: string): ASTNode[] {
  const lines = content.split('\n');
  const nodes: ASTNode[] = [];
  let currentColumn: KanbanColumnId | null = null;
  let currentPriority: 'high' | 'medium' | 'low' = 'medium';
  let currentCategory = '';

  for (const line of lines) {
    // ## section header
    if (line.startsWith('## ')) {
      const title = line.replace(/^##\s*/, '').trim();
      currentColumn = sectionToColumn(title);
      currentPriority = 'medium';
      currentCategory = title;
      nodes.push({ type: 'heading', raw: line, level: 2, title, column: currentColumn ?? undefined });
      continue;
    }

    // ### subsection header
    if (line.startsWith('### ')) {
      const header = line.toLowerCase();
      if (header.includes('high')) currentPriority = 'high';
      else if (header.includes('medium')) currentPriority = 'medium';
      else if (header.includes('low')) currentPriority = 'low';
      const catMatch = line.match(/\(([^)]+)\)/);
      if (catMatch) currentCategory = catMatch[1];
      nodes.push({
        type: 'subheading', raw: line, level: 3, title: line.replace(/^###\s*/, '').trim(),
        subPriority: currentPriority, subCategory: currentCategory,
      });
      continue;
    }

    // Task line: - [ ] or - [x] or - [~]
    const taskMatch = line.match(/^-\s*\[([ x~])\]\s*(.+)$/);
    if (taskMatch && currentColumn) {
      const [, status, rawTitle] = taskMatch;
      // Extract #project tag
      const projectMatch = rawTitle.match(/(?:^|\s)#([\w-]+)/);
      const project = projectMatch ? projectMatch[1] : undefined;
      // Strip tag from title for display and ID generation
      const titleWithoutTag = rawTitle.replace(/\s*#[\w-]+/, '').trim();
      const cleanTitle = titleWithoutTag.replace(/\*\*/g, '').replace(/\s*—.*$/, '').trim();
      const taskId = makeTaskId(agentId, cleanTitle);
      nodes.push({
        type: 'task',
        raw: line,
        taskStatus: status as TaskStatusMark,
        taskTitle: cleanTitle,
        taskId,
        priority: currentPriority,
        category: currentCategory,
        column: currentColumn,
        project,
      });
      continue;
    }

    // Everything else (comments, blank lines, other text)
    nodes.push({ type: 'text', raw: line });
  }

  return nodes;
}

/** Serialize AST back to markdown string */
function serializeAST(nodes: ASTNode[]): string {
  return nodes.map(n => n.raw).join('\n');
}

/** Build kanban columns from AST for API response */
function astToKanbanColumns(nodes: ASTNode[], agentId: string) {
  const columns: Record<KanbanColumnId, Array<{
    id: string; agentId: string; title: string; status: string;
    priority: string; category: string; column: KanbanColumnId; project?: string;
  }>> = {
    'inbox': [],
    'in-progress': [],
    'backlog': [],
    'blocked': [],
    'done': [],
  };

  for (const node of nodes) {
    if (node.type === 'task' && node.column && node.taskId) {
      let status: string = 'incomplete';
      if (node.taskStatus === 'x') status = 'done';
      else if (node.taskStatus === '~') status = 'in-progress';

      columns[node.column].push({
        id: node.taskId,
        agentId,
        title: node.taskTitle || '',
        status,
        priority: node.priority || 'medium',
        category: node.category || '',
        column: node.column,
        project: node.project,
      });
    }
  }

  return columns;
}

function computeFileHash(content: string): string {
  return createHash('md5').update(content).digest('hex').slice(0, 16);
}

/** Simple in-memory mutex per agent to prevent concurrent writes */
const fileMutexes: Record<string, Promise<void>> = {};

async function withFileMutex<T>(agentId: string, fn: () => Promise<T>): Promise<T> {
  const key = `task-${agentId}`;
  const prev = fileMutexes[key] || Promise.resolve();
  let resolve: () => void;
  fileMutexes[key] = new Promise<void>(r => { resolve = r; });
  await prev;
  try {
    return await fn();
  } finally {
    resolve!();
  }
}

/** Read tasks file content for an agent */
async function readTasksFile(agentId: string): Promise<string> {
  const tasksPath = path.join(agentMemoryPath(agentId), 'tasks.md');
  return fs.readFile(tasksPath, 'utf-8').catch(() => '');
}

/** Write tasks file content for an agent */
async function writeTasksFile(agentId: string, content: string): Promise<void> {
  const tasksPath = path.join(agentMemoryPath(agentId), 'tasks.md');
  await fs.writeFile(tasksPath, content, 'utf-8');
}

// GET /api/tasks/kanban — returns kanban columns
app.get('/api/tasks/kanban', async (req, res) => {
  try {
    const agentId = (req.query.agentId as string) || 'finn';
    const content = await readTasksFile(agentId);
    const ast = parseTaskFileAST(content, agentId);
    const columns = astToKanbanColumns(ast, agentId);
    const fileHash = computeFileHash(content);
    res.json({ columns, fileHash });
  } catch (error) {
    console.error('Kanban fetch error:', error);
    res.status(500).json({ error: 'Failed to load kanban data' });
  }
});

// PATCH /api/tasks/:taskId/move — move task between columns
app.patch('/api/tasks/:taskId/move', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { agentId = 'finn', targetColumn, targetIndex } = req.body as {
      agentId: string; targetColumn: KanbanColumnId; targetIndex?: number;
    };

    if (!targetColumn) {
      return res.status(400).json({ error: 'targetColumn is required' });
    }

    const result = await withFileMutex(agentId, async () => {
      const content = await readTasksFile(agentId);
      const ast = parseTaskFileAST(content, agentId);

      // Find the task node
      const taskIdx = ast.findIndex(n => n.type === 'task' && n.taskId === taskId);
      if (taskIdx === -1) {
        throw new Error('Task not found');
      }

      const taskNode = ast[taskIdx];
      const taskLine = taskNode.raw;

      // Remove from current position
      ast.splice(taskIdx, 1);

      // Update checkbox status based on target column
      let updatedLine = taskLine;
      if (targetColumn === 'done') {
        updatedLine = taskLine.replace(/\[([ ~])\]/, '[x]');
      } else if (taskNode.column === 'done') {
        updatedLine = taskLine.replace(/\[x\]/, '[ ]');
      }

      // Find target section insertion point
      let insertIdx = -1;
      let tasksInTargetSection = 0;
      const targetSectionTitle = columnToSectionTitle(targetColumn);

      for (let i = 0; i < ast.length; i++) {
        const node = ast[i];
        if (node.type === 'heading' && node.column === targetColumn) {
          // Found the target section header - find end of section
          insertIdx = i + 1;
          // Skip past comments and blank lines right after header
          while (insertIdx < ast.length && ast[insertIdx].type === 'text') {
            insertIdx++;
          }
          // Count existing tasks in this section and find insert position
          let taskCount = 0;
          for (let j = insertIdx; j < ast.length; j++) {
            if (ast[j].type === 'heading') break; // next section
            if (ast[j].type === 'task') {
              taskCount++;
              if (targetIndex !== undefined && taskCount > targetIndex) break;
              tasksInTargetSection = j + 1;
            }
          }
          if (targetIndex !== undefined && targetIndex < taskCount) {
            // Insert at specific position among tasks
            let seen = 0;
            for (let j = insertIdx; j < ast.length; j++) {
              if (ast[j].type === 'heading') break;
              if (ast[j].type === 'task') {
                if (seen === targetIndex) { insertIdx = j; break; }
                seen++;
              }
            }
          } else {
            // Insert after last task in section (or after header if no tasks)
            insertIdx = tasksInTargetSection > 0 ? tasksInTargetSection : insertIdx;
          }
          break;
        }
      }

      if (insertIdx === -1) {
        // Target section doesn't exist — create it
        ast.push({ type: 'text', raw: '' });
        ast.push({ type: 'heading', raw: `## ${targetSectionTitle}`, level: 2, title: targetSectionTitle, column: targetColumn });
        insertIdx = ast.length;
      }

      // Insert the task at the target position
      const updatedNode: ASTNode = { ...taskNode, raw: updatedLine, column: targetColumn };
      if (targetColumn === 'done') updatedNode.taskStatus = 'x';
      else if (taskNode.column === 'done') updatedNode.taskStatus = ' ';
      ast.splice(insertIdx, 0, updatedNode);

      const newContent = serializeAST(ast);
      await writeTasksFile(agentId, newContent);
      return { fileHash: computeFileHash(newContent) };
    });

    res.json({ success: true, fileHash: result.fileHash });
  } catch (error: any) {
    console.error('Task move error:', error);
    res.status(error.message === 'Task not found' ? 404 : 500)
      .json({ error: error.message || 'Failed to move task' });
  }
});

// PATCH /api/tasks/:taskId/status — toggle task checkbox
app.patch('/api/tasks/:taskId/status', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { agentId = 'finn', status } = req.body as {
      agentId: string; status: 'done' | 'incomplete' | 'in-progress';
    };

    const result = await withFileMutex(agentId, async () => {
      const content = await readTasksFile(agentId);
      const ast = parseTaskFileAST(content, agentId);

      const taskNode = ast.find(n => n.type === 'task' && n.taskId === taskId);
      if (!taskNode) throw new Error('Task not found');

      const markMap: Record<string, string> = { 'done': 'x', 'incomplete': ' ', 'in-progress': '~' };
      const newMark = markMap[status] || ' ';
      taskNode.raw = taskNode.raw.replace(/\[([ x~])\]/, `[${newMark}]`);
      taskNode.taskStatus = newMark as TaskStatusMark;

      const newContent = serializeAST(ast);
      await writeTasksFile(agentId, newContent);
      return { fileHash: computeFileHash(newContent) };
    });

    res.json({ success: true, fileHash: result.fileHash });
  } catch (error: any) {
    console.error('Task status error:', error);
    res.status(error.message === 'Task not found' ? 404 : 500)
      .json({ error: error.message || 'Failed to update task status' });
  }
});

// POST /api/tasks — create a new task
app.post('/api/tasks', async (req, res) => {
  try {
    const { agentId = 'finn', title, column = 'inbox', priority, project } = req.body as {
      agentId: string; title: string; column?: KanbanColumnId; priority?: string; project?: string;
    };

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const result = await withFileMutex(agentId, async () => {
      const content = await readTasksFile(agentId);
      const ast = parseTaskFileAST(content, agentId);

      const tagSuffix = project ? ` #${project}` : '';
      const newLine = `- [ ] **${title}**${tagSuffix}`;
      const newNode: ASTNode = {
        type: 'task',
        raw: newLine,
        taskStatus: ' ',
        taskTitle: title,
        taskId: makeTaskId(agentId, title),
        priority: (priority as 'high' | 'medium' | 'low') || 'medium',
        column: column,
        project,
      };

      // Find the target section and insert after header/comments
      const targetSectionTitle = columnToSectionTitle(column);
      let insertIdx = -1;

      for (let i = 0; i < ast.length; i++) {
        const node = ast[i];
        if (node.type === 'heading' && node.column === column) {
          insertIdx = i + 1;
          // Skip comments and blank lines after header
          while (insertIdx < ast.length && ast[insertIdx].type === 'text') {
            insertIdx++;
          }
          break;
        }
      }

      if (insertIdx === -1) {
        // Section doesn't exist — create it
        ast.push({ type: 'text', raw: '' });
        ast.push({ type: 'heading', raw: `## ${targetSectionTitle}`, level: 2, title: targetSectionTitle, column: column });
        insertIdx = ast.length;
      }

      ast.splice(insertIdx, 0, newNode);

      const newContent = serializeAST(ast);
      await writeTasksFile(agentId, newContent);
      return { fileHash: computeFileHash(newContent) };
    });

    res.json({ success: true, fileHash: result.fileHash });
  } catch (error: any) {
    console.error('Task create error:', error);
    res.status(500).json({ error: error.message || 'Failed to create task' });
  }
});

// ─── Checkpoint ───

app.get('/api/checkpoint', async (req, res) => {
  try {
    const content = await fs.readFile(path.join(MEMORY_PATH, 'checkpoint.md'), 'utf-8');
    const stats = await fs.stat(path.join(MEMORY_PATH, 'checkpoint.md'));
    res.json({
      content,
      lastModified: stats.mtime,
      parsed: parseCheckpoint(content),
    });
  } catch (error) {
    console.error('Checkpoint error:', error);
    res.status(500).json({ error: 'Failed to read checkpoint' });
  }
});

function parseCheckpoint(content: string) {
  const getSection = (header: string): string[] => {
    const regex = new RegExp(`## ${header}\\n([\\s\\S]*?)(?=\\n## |\\n---|\$)`, 'i');
    const match = content.match(regex);
    if (!match) return [];
    return match[1].trim().split('\n').filter(l => l.startsWith('- ')).map(l => l.replace(/^-\s*/, ''));
  };

  return {
    sessionState: getSection('Session State'),
    todayActivity: getSection("Today's Activity"),
    pendingTasks: getSection('Pending Tasks'),
    systems: getSection('Systems'),
    tokenStatus: getSection('Token Status'),
  };
}

// ─── Crons (from crons.json gateway + launchd plists) ───

const FINN_LIVE_CRONS_PATH = path.join(agentOpenClawPath('finn'), 'cron', 'jobs.json');
const KIRA_LIVE_CRONS_PATH = path.join(agentOpenClawPath('kira'), 'cron', 'jobs.json');
const FINN_WORKSPACE_CRONS_PATH = path.join(AGENTS_BASE_PATH, 'crons.json');
const LAUNCHD_PATH = path.join(SCRIPTS_PATH, 'launchd');

interface CronEntry {
  id: string;
  name: string;
  enabled: boolean;
  schedule: { kind: string; expr?: string; tz?: string; everyMs?: number };
  payload: {
    kind: string;
    message?: string;
    text?: string;
  };
  delivery?: { mode: string; channel: string; to: string; bestEffort?: boolean };
  state?: { lastRunAtMs?: number; lastStatus?: string; lastDurationMs?: number; runCount?: number; lastError?: string };
}

/** Normalize a Hermes jobs.json entry into the dashboard's CronEntry shape.
 *  OpenClaw entries (which already have payload/delivery/state nested) are passed through. */
function normalizeHermesJob(entry: any): CronEntry {
  if (entry?.payload || entry?.delivery) return entry as CronEntry; // already OpenClaw-shaped
  return {
    id: entry.id,
    name: entry.name,
    enabled: entry.enabled !== false,
    schedule: entry.schedule || { kind: 'unknown' },
    payload: {
      kind: 'agent',
      message: entry.prompt || '',
    },
    delivery: entry.deliver ? {
      mode: 'best-effort',
      channel: entry.deliver,
      to: '',
    } : undefined,
    state: {
      lastStatus: entry.last_status || undefined,
      lastRunAtMs: entry.last_run_at ? new Date(entry.last_run_at).getTime() : undefined,
      lastError: entry.last_error || undefined,
    },
  };
}

/** Read crons.json which has shape { version, jobs: CronEntry[] } (OpenClaw or Hermes). */
function readCronJobs(data: unknown): CronEntry[] {
  if (!data) return [];
  let arr: any[] = [];
  if (Array.isArray(data)) arr = data;
  else if (typeof data === 'object' && data !== null && 'jobs' in data && Array.isArray((data as any).jobs)) {
    arr = (data as any).jobs;
  }
  return arr.map(normalizeHermesJob);
}

/** Compute Finn's cron health LIVE from the Hermes jobs.json (formerly read from
 *  a stale cron-health-alerts.json that was last written 2026-03-01). Returns the
 *  shape Settings.tsx and SystemStatus.tsx render: alert, failures, zombies,
 *  stalled, never_run, message. */
async function computeFinnCronHealth(): Promise<{ alert: boolean; failures: number; zombies: number; stalled: number; never_run: number; message: string; lastUpdated: string }> {
  const data = await readJsonFile(FINN_LIVE_CRONS_PATH);
  const empty = { alert: false, failures: 0, zombies: 0, stalled: 0, never_run: 0, message: 'OK', lastUpdated: new Date().toISOString() };
  if (!data || typeof data !== 'object') return empty;
  const jobs = Array.isArray((data as any).jobs) ? (data as any).jobs : [];

  let failures = 0;
  let neverRun = 0;
  let stalled = 0;
  const nowMs = Date.now();
  for (const j of jobs) {
    if (j?.enabled === false) continue;
    const lastStatus = j?.last_status;
    const lastError = j?.last_error;
    const lastRunAt = j?.last_run_at;
    const nextRunAt = j?.next_run_at;

    if (lastError || lastStatus === 'error' || lastStatus === 'failed') {
      failures++;
    } else if (!lastRunAt) {
      neverRun++;
    }

    // Stalled: scheduled to have already run >2h ago but still pending
    if (nextRunAt) {
      const nextMs = new Date(nextRunAt).getTime();
      if (!Number.isNaN(nextMs) && nextMs < nowMs - 2 * 60 * 60 * 1000) {
        stalled++;
      }
    }
  }

  const alert = failures > 0 || stalled > 0;
  const message = alert
    ? [failures && `${failures} failing`, stalled && `${stalled} stalled`].filter(Boolean).join(', ')
    : 'OK';
  return { alert, failures, zombies: 0, stalled, never_run: neverRun, message, lastUpdated: new Date().toISOString() };
}

function everyMsToHumanReadable(ms: number): string {
  if (ms < 60000) return `Every ${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `Every ${Math.round(ms / 60000)} minutes`;
  if (ms < 86400000) return `Every ${Math.round(ms / 3600000)} hours`;
  return `Every ${Math.round(ms / 86400000)} days`;
}

function cronEntrySchedule(entry: CronEntry): { cron: string; timezone: string; humanReadable: string } {
  if (entry.schedule.kind === 'cron' && entry.schedule.expr) {
    return {
      cron: entry.schedule.expr,
      timezone: entry.schedule.tz || 'America/New_York',
      humanReadable: cronExprToHumanReadable(entry.schedule.expr),
    };
  }
  if (entry.schedule.kind === 'every' && entry.schedule.everyMs) {
    return {
      cron: `every ${entry.schedule.everyMs}ms`,
      timezone: 'UTC',
      humanReadable: everyMsToHumanReadable(entry.schedule.everyMs),
    };
  }
  return { cron: 'unknown', timezone: 'UTC', humanReadable: 'Unknown schedule' };
}

function cronExprToHumanReadable(expr: string): string {
  const parts = expr.split(' ');
  if (parts.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = parts;

  const dowMap: Record<string, string> = { '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat' };

  if (dom === '*' && mon === '*' && dow === '*') {
    if (hour === '*' && min.startsWith('*/')) return `Every ${min.replace('*/', '')} minutes`;
    if (hour === '*') return `Every hour at :${min.padStart(2, '0')}`;
    return `Daily at ${hour}:${min.padStart(2, '0')}`;
  }
  if (dom === '*' && mon === '*' && dow !== '*') {
    const days = dow.split(',').map(d => dowMap[d] || d).join(', ');
    return `${days} at ${hour}:${min.padStart(2, '0')}`;
  }
  return expr;
}

app.get('/api/agents/:agentId/crons', async (req, res) => {
  try {
    const { agentId } = req.params;
    const crons: Array<{
      id: string; agentId: string; name: string; description: string;
      schedule: { cron: string; timezone: string; humanReadable: string };
      status: string; taskGroup: string; source: string;
      delivery?: { channel: string; to: string };
      lastRunAt?: string; lastDurationMs?: number; runCount?: number; lastError?: string;
    }> = [];

    if (agentId === 'finn') {
      // Try live gateway state first, fall back to workspace crons.json
      let rawCrons = await readJsonFile(FINN_LIVE_CRONS_PATH);
      let cronSource = 'hermes';
      if (!rawCrons) {
        rawCrons = await readJsonFile(FINN_WORKSPACE_CRONS_PATH);
        cronSource = 'crons.json';
      }
      const cronJobs = readCronJobs(rawCrons);
      for (const entry of cronJobs) {
        const group = entry.payload?.kind === 'systemEvent' ? 'System' :
                      entry.delivery?.channel === 'telegram' ? 'Notifications' : 'Automation';
        crons.push({
          id: entry.id || entry.name,
          agentId: 'finn',
          name: prettyCategoryName(entry.name),
          description: (() => { const msg = entry.payload?.message || entry.payload?.text || ''; return msg.slice(0, 200) + (msg.length > 200 ? '...' : ''); })(),
          schedule: cronEntrySchedule(entry),
          status: !entry.enabled ? 'paused' :
                  entry.state?.lastStatus === 'error' ? 'error' :
                  entry.state?.lastStatus === 'ok' ? 'active' :
                  entry.state?.lastStatus === 'skipped' ? 'warning' : 'active',
          taskGroup: group,
          source: cronSource,
          delivery: entry.delivery ? {
            channel: entry.delivery.channel,
            to: entry.delivery.to,
          } : undefined,
          lastRunAt: entry.state?.lastRunAtMs ? new Date(entry.state.lastRunAtMs).toISOString() : undefined,
          lastDurationMs: entry.state?.lastDurationMs,
          runCount: entry.state?.runCount,
          lastError: entry.state?.lastError,
        });
      }

      // launchd plist parsing removed — macOS VM is decommissioned and the plists
      // are now duplicates of the Hermes crons above. The .plist files survive in
      // ~/finn/scripts/launchd/ as historical reference but are not active anywhere.
    }

    if (agentId === 'kira') {
      // Read live cron state from Kira's local jobs.json
      try {
        const kiraData = await readJsonFile(KIRA_LIVE_CRONS_PATH);
        const kiraJobs = readCronJobs(kiraData);

        for (const entry of kiraJobs) {
          const sched = cronEntrySchedule(entry);
          crons.push({
            id: entry.id || `kira-${entry.name}`,
            agentId: 'kira',
            name: prettyCategoryName(entry.name),
            description: (() => {
              const msg = entry.payload?.message || entry.payload?.text || '';
              return msg.slice(0, 200) + (msg.length > 200 ? '...' : '');
            })(),
            schedule: sched,
            status: !entry.enabled ? 'paused' :
                    entry.state?.lastStatus === 'error' ? 'error' :
                    entry.state?.lastStatus === 'ok' ? 'active' :
                    entry.state?.lastStatus === 'skipped' ? 'warning' : 'active',
            taskGroup: entry.delivery?.channel === 'discord' ? 'Discord' : 'System',
            source: 'openclaw-gateway',
            delivery: entry.delivery ? {
              channel: entry.delivery.channel,
              to: entry.delivery.to,
            } : undefined,
            lastRunAt: entry.state?.lastRunAtMs ? new Date(entry.state.lastRunAtMs).toISOString() : undefined,
            lastDurationMs: entry.state?.lastDurationMs,
            runCount: entry.state?.runCount,
            lastError: entry.state?.lastError,
          });
        }
      } catch (readError) {
        console.error('Failed to read Kira crons:', readError);
        crons.push({
          id: 'kira-error',
          agentId: 'kira',
          name: 'Error Reading Kira Crons',
          description: 'Could not read Kira cron jobs file.',
          schedule: { cron: '-', timezone: '-', humanReadable: 'N/A' },
          status: 'error',
          taskGroup: 'System',
          source: 'error',
        });
      }
    }

    res.json({ crons });
  } catch (error) {
    console.error('Crons error:', error);
    res.status(500).json({ error: 'Failed to list crons' });
  }
});

// POST /api/crons/:cronId/run -- trigger cron (Hermes for Finn, OpenClaw for Kira)
app.post('/api/crons/:cronId/run', async (req, res) => {
  try {
    const { cronId } = req.params;
    const { agentId } = req.body;
    const isKiraCron = agentId === 'kira' || cronId.startsWith('kira-');

    // Resolve cron name → UUID via the agent's jobs.json
    let cronUuid = isKiraCron ? cronId.replace('kira-', '') : cronId;
    const jobsPath = isKiraCron ? KIRA_LIVE_CRONS_PATH : FINN_LIVE_CRONS_PATH;
    try {
      const jobsData = await readJsonFile(jobsPath);
      const jobs = readCronJobs(jobsData);
      const match = jobs.find((j: any) => j.name === cronUuid || j.id === cronUuid);
      if (match) cronUuid = match.id;
    } catch { /* use cronId as-is */ }

    if (isKiraCron) {
      // Kira runs on Windows-native OpenClaw; the dashboard runs in WSL where the openclaw
      // CLI isn't installed. Need cmd.exe bridge — not yet wired.
      return res.json({
        success: false,
        cronId,
        error: 'Kira cron execution not wired from WSL dashboard yet (Kira runs on Windows-native OpenClaw)',
        method: 'kira-not-wired',
        executedAt: new Date().toISOString(),
      });
    }

    // Finn: hermes cron run <id>
    const { stdout, stderr } = await execAsync(
      `hermes cron run ${cronUuid}`,
      { timeout: 120000 }
    );
    res.json({
      success: true,
      cronId,
      method: 'hermes',
      output: stdout.substring(0, 5000),
      stderr: stderr ? stderr.substring(0, 2000) : undefined,
      executedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Cron run error:', error);
    res.json({
      success: false,
      cronId: req.params.cronId,
      error: error.message || 'Cron execution failed',
      method: 'hermes',
      executedAt: new Date().toISOString(),
    });
  }
});

// ─── Goals (from memory/goals.md) ───

function parseGoalsFile(content: string, agentId: string) {
  const goals: Array<{
    id: string; agentId: string; title: string; description: string;
    category: string; progress: number; status: string;
    milestones: Array<{ id: string; title: string; completed: boolean }>;
  }> = [];

  const sections = content.split(/\n---\n/).filter(s => s.trim());

  for (const section of sections) {
    const lines = section.trim().split('\n');

    // Extract metadata from HTML comment
    const metaMatch = section.match(/<!--\s*id:\s*(\S+)\s+.*?status:\s*(\S+)\s+progress:\s*(\d+)\s*-->/);
    const id = metaMatch?.[1] || `goal-${goals.length + 1}`;
    const status = metaMatch?.[2] || 'active';
    const progress = metaMatch ? parseInt(metaMatch[3]) : 0;

    // Extract category from ## header
    const categoryMatch = section.match(/^## (.+)$/m);
    const category = categoryMatch?.[1] || 'General';

    // Extract title from ### header
    const titleMatch = section.match(/^### (.+)$/m);
    const title = titleMatch?.[1] || '';
    if (!title) continue;

    // Extract description (first non-header, non-metadata line)
    const descLines = lines.filter(l =>
      l.trim() && !l.startsWith('#') && !l.startsWith('<!--') && !l.startsWith('**Milestones') && !l.startsWith('- [')
    );
    const description = descLines[0]?.trim() || '';

    // Extract milestones
    const milestones: Array<{ id: string; title: string; completed: boolean }> = [];
    const milestoneLines = section.match(/^- \[([ x])\] (.+)$/gm) || [];
    milestoneLines.forEach((ml, i) => {
      const m = ml.match(/^- \[([ x])\] (.+)$/);
      if (m) {
        milestones.push({
          id: `${id}-m${i + 1}`,
          title: m[2].trim(),
          completed: m[1] === 'x',
        });
      }
    });

    // Recalculate progress from milestones if we have them
    const computedProgress = milestones.length > 0
      ? Math.round((milestones.filter(m => m.completed).length / milestones.length) * 100)
      : progress;

    goals.push({
      id, agentId, title, description, category,
      progress: computedProgress, status, milestones,
    });
  }

  return goals;
}

app.get('/api/goals', async (req, res) => {
  try {
    const [finnContent, kiraContent] = await Promise.all([
      readMdFile(path.join(agentMemoryPath('finn'), 'goals.md')),
      readMdFile(path.join(agentMemoryPath('kira'), 'goals.md')),
    ]);
    const finnGoals = finnContent ? parseGoalsFile(finnContent, 'finn') : [];
    const kiraGoals = kiraContent ? parseGoalsFile(kiraContent, 'kira') : [];
    res.json({ goals: [...finnGoals, ...kiraGoals] });
  } catch (error) {
    console.error('Goals error:', error);
    res.status(500).json({ error: 'Failed to read goals' });
  }
});

// PATCH /api/goals/:goalId -- toggle milestone or update status
app.patch('/api/goals/:goalId', async (req, res) => {
  try {
    const { goalId } = req.params;
    const { action, milestoneId, status } = req.body;

    const result = await withFileMutex('goals', async () => {
      const goalsPath = path.join(MEMORY_PATH, 'goals.md');
      const content = await fs.readFile(goalsPath, 'utf-8').catch(() => '');
      const lines = content.split('\n');

      if (action === 'toggle-milestone' && milestoneId) {
        // Find the goal section, then find the milestone line
        const goals = parseGoalsFile(content, 'finn');
        const goal = goals.find(g => g.id === goalId);
        if (!goal) throw new Error('Goal not found');

        const milestone = goal.milestones.find(m => m.id === milestoneId);
        if (!milestone) throw new Error('Milestone not found');

        // Find and toggle the checkbox line matching this milestone title
        let milestoneCount = 0;
        let inGoalSection = false;
        const goalMetaPattern = new RegExp(`<!--\\s*id:\\s*${goalId}\\s`);

        for (let i = 0; i < lines.length; i++) {
          if (goalMetaPattern.test(lines[i])) inGoalSection = true;
          if (inGoalSection && lines[i].startsWith('---')) break;

          if (inGoalSection && /^- \[[ x]\] /.test(lines[i])) {
            const currentMilestoneId = `${goalId}-m${milestoneCount + 1}`;
            if (currentMilestoneId === milestoneId) {
              if (milestone.completed) {
                lines[i] = lines[i].replace('- [x] ', '- [ ] ');
              } else {
                lines[i] = lines[i].replace('- [ ] ', '- [x] ');
              }
              break;
            }
            milestoneCount++;
          }
        }

        // Update the progress in the metadata comment
        const newContent = lines.join('\n');
        const updatedGoals = parseGoalsFile(newContent, 'finn');
        const updatedGoal = updatedGoals.find(g => g.id === goalId);
        if (updatedGoal) {
          // Update progress in the HTML comment
          const progressPattern = new RegExp(`(<!--\\s*id:\\s*${goalId}\\s+status:\\s*\\S+\\s+progress:)\\s*\\d+`);
          const finalContent = newContent.replace(progressPattern, `$1 ${updatedGoal.progress}`);
          await fs.writeFile(goalsPath, finalContent, 'utf-8');
          return { fileHash: computeFileHash(finalContent), goals: parseGoalsFile(finalContent, 'finn') };
        }

        await fs.writeFile(goalsPath, newContent, 'utf-8');
        return { fileHash: computeFileHash(newContent), goals: parseGoalsFile(newContent, 'finn') };

      } else if (action === 'update-status' && status) {
        const statusPattern = new RegExp(`(<!--\\s*id:\\s*${goalId}\\s+status:)\\s*\\S+`);
        if (!statusPattern.test(content)) throw new Error('Goal not found');
        const newContent = content.replace(statusPattern, `$1 ${status}`);
        await fs.writeFile(goalsPath, newContent, 'utf-8');
        return { fileHash: computeFileHash(newContent), goals: parseGoalsFile(newContent, 'finn') };

      } else {
        throw new Error('Invalid action');
      }
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Goal update error:', error);
    res.status(error.message?.includes('not found') ? 404 : 400)
      .json({ error: error.message || 'Failed to update goal' });
  }
});

// POST /api/goals -- create a new goal
app.post('/api/goals', async (req, res) => {
  try {
    const { title, category, description } = req.body;
    if (!title || !category) {
      return res.status(400).json({ error: 'title and category are required' });
    }

    const result = await withFileMutex('goals', async () => {
      const goalsPath = path.join(MEMORY_PATH, 'goals.md');
      const content = await fs.readFile(goalsPath, 'utf-8').catch(() => '# Goals\n');

      const id = `goal-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;
      const newGoalBlock = [
        '',
        '---',
        '',
        `## ${category}`,
        `<!-- id: ${id} status: active progress: 0 -->`,
        `### ${title}`,
        description || '',
        '',
        '**Milestones:**',
        '- [ ] Define first milestone',
        '',
      ].join('\n');

      const newContent = content.trimEnd() + '\n' + newGoalBlock;
      await fs.writeFile(goalsPath, newContent, 'utf-8');
      return { fileHash: computeFileHash(newContent), goals: parseGoalsFile(newContent, 'finn') };
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Goal create error:', error);
    res.status(500).json({ error: error.message || 'Failed to create goal' });
  }
});

// ─── Missions (from memory/missions.md) ───

function parseMissionsFile(content: string, agentId: string) {
  const missions: Array<{
    id: string; agentId: string; name: string; description: string;
    status: string; progress: number; goalId: string; goalTitle: string;
    keyResults: Array<{ id: string; title: string; completed: boolean }>;
  }> = [];

  const sections = content.split(/\n---\n/).filter(s => s.trim());

  for (const section of sections) {
    // Extract metadata
    const metaMatch = section.match(/<!--\s*id:\s*(\S+)\s+goal:\s*(\S+)\s+status:\s*(\S+)\s+progress:\s*(\d+)\s*-->/);
    const id = metaMatch?.[1] || `mission-${missions.length + 1}`;
    const goalId = metaMatch?.[2] || '';
    const status = metaMatch?.[3] || 'active';
    const progress = metaMatch ? parseInt(metaMatch[4]) : 0;

    // Extract category from ## header
    const categoryMatch = section.match(/^## (.+)$/m);
    const category = categoryMatch?.[1] || '';

    // Extract title from ### header
    const titleMatch = section.match(/^### (.+)$/m);
    const name = titleMatch?.[1] || '';
    if (!name) continue;

    // Extract description (first non-header line)
    const lines = section.trim().split('\n');
    const descLines = lines.filter(l =>
      l.trim() && !l.startsWith('#') && !l.startsWith('<!--') && !l.startsWith('**') && !l.startsWith('- [')
    );
    const description = descLines[0]?.trim() || '';

    // Extract key results
    const keyResults: Array<{ id: string; title: string; completed: boolean }> = [];
    const krLines = section.match(/^- \[([ x])\] (.+)$/gm) || [];
    krLines.forEach((kl, i) => {
      const m = kl.match(/^- \[([ x])\] (.+)$/);
      if (m) {
        keyResults.push({
          id: `${id}-kr${i + 1}`,
          title: m[2].trim(),
          completed: m[1] === 'x',
        });
      }
    });

    // Extract linked goal title
    const goalLine = section.match(/\*\*Goal:\*\*\s*(.+)/);
    const goalTitle = goalLine?.[1]?.trim() || '';

    const computedProgress = keyResults.length > 0
      ? Math.round((keyResults.filter(kr => kr.completed).length / keyResults.length) * 100)
      : progress;

    missions.push({
      id, agentId, name, description, status,
      progress: computedProgress, goalId, goalTitle, keyResults,
    });
  }

  return missions;
}

app.get('/api/missions', async (req, res) => {
  try {
    const [finnContent, kiraContent] = await Promise.all([
      readMdFile(path.join(agentMemoryPath('finn'), 'missions.md')),
      readMdFile(path.join(agentMemoryPath('kira'), 'missions.md')),
    ]);
    const finnMissions = finnContent ? parseMissionsFile(finnContent, 'finn') : [];
    const kiraMissions = kiraContent ? parseMissionsFile(kiraContent, 'kira') : [];
    res.json({ missions: [...finnMissions, ...kiraMissions] });
  } catch (error) {
    console.error('Missions error:', error);
    res.status(500).json({ error: 'Failed to read missions' });
  }
});

// ─── Quick Actions (from memory/quick-actions.json) ───

app.get('/api/quick-actions', async (req, res) => {
  try {
    const data = await readJsonFile(path.join(MEMORY_PATH, 'quick-actions.json'));
    const actions = data?.actions || [];
    res.json({ actions });
  } catch (error) {
    console.error('Quick actions error:', error);
    res.status(500).json({ error: 'Failed to read quick actions' });
  }
});


// Helper: resolve a cron name to its UUID from jobs.json
async function resolveCronId(cronName: string, agent?: string): Promise<string> {
  const jobsPath = agent === 'kira' ? KIRA_LIVE_CRONS_PATH : FINN_LIVE_CRONS_PATH;
  const rawJson = await fs.readFile(jobsPath, 'utf-8');

  const data = JSON.parse(rawJson);
  const jobs = data?.jobs || [];
  const job = jobs.find((j: any) => j.name === cronName);

  if (!job || !job.id) {
    throw new Error(`Cron job '${cronName}' not found in ${agent === 'kira' ? 'Kira' : 'Finn'}'s jobs.json`);
  }

  return job.id;
}

// --- Quick Action Execution ---

app.post('/api/quick-actions/:actionId/execute', async (req, res) => {
  try {
    const { actionId } = req.params;

    const data = await readJsonFile(path.join(MEMORY_PATH, 'quick-actions.json'));
    const actions = data?.actions || [];
    const action = actions.find((a: any) => a.id === actionId);

    if (!action) {
      return res.status(404).json({ error: `Action '${actionId}' not found` });
    }

    let stdout: string;
    let stderr: string | undefined;

    if (action.type === 'cron') {
      // Trigger a cron job by UUID via openclaw CLI (resolve name -> UUID first)
      if (!action.cronName) {
        return res.status(400).json({ error: 'Cron action missing cronName' });
      }

      // Resolve cron name to UUID — required by both hermes and openclaw cron run
      const cronId = await resolveCronId(action.cronName, action.agent);

      // Fire-and-forget: spawn cron run in background, don't wait for completion
      // Finn runs on Hermes; Kira runs on Windows-native OpenClaw (kira invocation
      // from WSL dashboard not wired yet — falls through and will error)
      const isFinn = (action.agent || 'finn') === 'finn';
      const runner = isFinn ? 'hermes' : 'openclaw';
      const runArgs = isFinn ? ['cron', 'run', cronId] : ['cron', 'run', '--timeout', '300000', cronId];
      const child = spawn(runner, runArgs, {
        detached: true,
        stdio: 'ignore',
        cwd: agentBasePath(action.agent || 'finn'),
      });
      child.unref();

      // Return immediately — cron runs asynchronously
      return res.json({
        success: true,
        actionId,
        status: 'dispatched',
        cronId,
        agent: action.agent || 'finn',
        executedAt: new Date().toISOString(),
      });
    } else {
      // Script-type action
      if (!action.scriptPath) {
        return res.status(400).json({ error: 'Action has no script path' });
      }

      const actionBase = agentBasePath(action.agent || 'finn');
      const scriptFullPath = path.join(actionBase, action.scriptPath);

      // Security: verify path is within workspace
      if (!scriptFullPath.startsWith(actionBase)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      try {
        await fs.access(scriptFullPath);
      } catch {
        return res.status(404).json({ error: `Script not found: ${action.scriptPath}` });
      }

      const ext = path.extname(scriptFullPath);
      let command: string;
      let args: string[];
      if (ext === '.js') {
        command = 'node';
        args = [scriptFullPath, ...(action.args || [])];
      } else if (ext === '.py') {
        command = 'python3';
        args = [scriptFullPath, ...(action.args || [])];
      } else {
        command = 'bash';
        args = [scriptFullPath, ...(action.args || [])];
      }

      const result = await execFileAsync(command, args, {
        timeout: 60000,
        cwd: actionBase,
      });
      stdout = result.stdout;
      stderr = result.stderr || undefined;
    }

    res.json({
      success: true,
      actionId,
      output: stdout.substring(0, 5000),
      stderr: stderr ? stderr.substring(0, 2000) : undefined,
      executedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Quick action execute error:', error);
    res.json({
      success: false,
      actionId: req.params.actionId,
      error: error.message || 'Script execution failed',
      stderr: error.stderr?.substring(0, 2000),
      executedAt: new Date().toISOString(),
    });
  }
});

// ─── System Info (for Settings page) ───

app.get('/api/system-info', async (req, res) => {
  try {
    const [
      scriptEntries, skillEntries, memoryFiles, cronsData,
      healthAlerts, checkpointContent,
    ] = await Promise.all([
      fs.readdir(SCRIPTS_PATH).catch(() => []),
      fs.readdir(SKILLS_PATH, { withFileTypes: true }).catch(() => []),
      getAllMemoryFilesRecursive({ excludeArchive: true }).catch(() => []),
      readJsonFile(FINN_LIVE_CRONS_PATH).then(v => v || readJsonFile(FINN_WORKSPACE_CRONS_PATH)),
      computeFinnCronHealth(),
      readMdFile(path.join(MEMORY_PATH, 'checkpoint.md')),
    ]);

    const scriptCount = (scriptEntries as string[]).filter(f => f.endsWith('.sh') || f.endsWith('.py') || f.endsWith('.js')).length;
    const skillCount = (skillEntries as any[]).filter((e: any) => e.isDirectory?.()).length;
    const cronJobs = readCronJobs(cronsData);
    const cronCount = cronJobs.length;
    const tokenStatus = getHermesTokenStatus();

    // Check Kira connectivity — both agents are local now, check if gateway responds
    let kiraOnline = false;
    try {
      const kiraJobsExist = await fs.stat(KIRA_LIVE_CRONS_PATH).catch(() => null);
      kiraOnline = kiraJobsExist !== null;
    } catch { /* offline */ }

    // Count Kira's memory files, skills, scripts
    let kiraMemoryCount = 0;
    let kiraSkillCount = 0;
    let kiraScriptCount = 0;
    let kiraCronCount = 0;
    try {
      const kiraMemFiles = await getAllFilesRecursive(agentMemoryPath('kira'), { excludeArchive: true });
      kiraMemoryCount = kiraMemFiles.length;
    } catch { /* skip */ }
    try {
      const kiraSkillEntries = await fs.readdir(path.join(agentBasePath('kira'), 'skills'), { withFileTypes: true });
      kiraSkillCount = kiraSkillEntries.filter((e: any) => e.isDirectory?.()).length;
    } catch { /* skip */ }
    try {
      const kiraScriptEntries = await fs.readdir(path.join(agentBasePath('kira'), 'scripts'));
      kiraScriptCount = kiraScriptEntries.filter(f => f.endsWith('.ps1') || f.endsWith('.py') || f.endsWith('.sh')).length;
    } catch { /* skip */ }
    try {
      const kiraJobsData = await readJsonFile(KIRA_LIVE_CRONS_PATH);
      kiraCronCount = readCronJobs(kiraJobsData).length;
    } catch { /* skip */ }

    res.json({
      agents: [
        {
          id: 'finn',
          name: 'Finn',
          emoji: '\u{1F98A}',
          status: 'online',
          model: tokenStatus?.model || 'GPT-5.5',
          platform: 'Windows PC (RexIII)',
          features: ['chat', 'memory', 'crons', 'skills', 'health', 'location'],
          stats: { memoryFiles: memoryFiles.length, scripts: scriptCount, skills: skillCount, crons: cronCount },
        },
        {
          id: 'kira',
          name: 'Kira',
          emoji: '\u{1F989}',
          status: kiraOnline ? 'online' : 'offline',
          model: 'Kimi / Qwen 2.5 7B',
          platform: 'Windows PC (RexIII)',
          features: ['chat', 'memory', 'crons', 'skills', 'supervision'],
          stats: { crons: kiraCronCount, skills: kiraSkillCount, scripts: kiraScriptCount, memoryFiles: kiraMemoryCount },
        },
      ],
      infrastructure: {
        apiServer: { status: 'online', port: PORT, base: AGENTS_BASE_PATH },
        tailscale: { funnel: 'https://rexiii.tailf846b2.ts.net/dashboard-api' },
        deployment: { platform: 'Vercel', url: 'https://agent-dashboard-sand.vercel.app' },
        gateway: { cronsConfigured: cronCount },
      },
      integrations: [
        { name: 'Telegram', status: 'active', description: 'Primary communication channel' },
        { name: 'Discord', status: 'active', description: 'Bot-to-bot (Finn ↔ Kira)' },
        { name: 'Oura Ring', status: 'active', description: 'Health data pipeline' },
        { name: 'iCloud Find My', status: 'active', description: 'Location tracking' },
        { name: 'Gmail (gog)', status: 'active', description: 'Email monitoring' },
        { name: 'Google Calendar', status: 'active', description: 'Personal calendar sync' },
        { name: 'Outlook', status: 'active', description: 'Work calendar + email' },
        { name: 'LinkedIn', status: 'active', description: 'Job opportunity monitoring' },
        { name: 'Spotify', status: 'inactive', description: 'Music playback control' },
      ],
      cronHealth: healthAlerts,
      tokenStatus,
    });
  } catch (error) {
    console.error('System info error:', error);
    res.status(500).json({ error: 'Failed to get system info' });
  }
});

// ─── Scripts (cron-like jobs from scripts/ directory) ───

app.get('/api/scripts', async (req, res) => {
  try {
    const entries = await fs.readdir(SCRIPTS_PATH);
    const scripts = entries
      .filter(f => f.endsWith('.sh') || f.endsWith('.py') || f.endsWith('.js'))
      .sort()
      .map(name => ({
        id: name.replace(/\.(sh|py|js)$/, ''),
        name: prettyCategoryName(name.replace(/\.(sh|py|js)$/, '')),
        file: name,
        type: name.endsWith('.sh') ? 'bash' : name.endsWith('.py') ? 'python' : 'node',
      }));

    res.json({ scripts, count: scripts.length });
  } catch (error) {
    console.error('Scripts error:', error);
    res.status(500).json({ error: 'Failed to list scripts' });
  }
});

// ─── JSON file readers (safe — returns null on error) ───

async function readJsonFile(filePath: string): Promise<any> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    try {
      return JSON.parse(content);
    } catch {
      // If direct parse fails, try extracting JSON from content with leading garbage
      // (e.g. OpenClaw CLI output prepended to crons.json)
      const firstBrace = content.indexOf('{');
      const firstBracket = content.indexOf('[');
      let start = -1;
      if (firstBrace >= 0 && firstBracket >= 0) start = Math.min(firstBrace, firstBracket);
      else if (firstBrace >= 0) start = firstBrace;
      else if (firstBracket >= 0) start = firstBracket;
      if (start > 0) return JSON.parse(content.slice(start));
      return null;
    }
  } catch {
    return null;
  }
}

async function readMdFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// ─── Token Status parser ───

function parseTokenStatus(content: string) {
  const lastUpdated = content.match(/\*\*Last Updated:\*\*\s*(.+)/)?.[1]?.trim() || '';
  const dailyMatch = content.match(/Daily Budget\*\*\s*\|\s*(.+?)\s*\|/);
  const weeklyMatch = content.match(/Weekly Budget\*\*\s*\|\s*(.+?)\s*\|/);
  const contextMatch = content.match(/Context Window\*\*\s*\|\s*(.+?)\s*\|/);
  const modelMatch = content.match(/- Model:\s*(.+)/);
  const sessionMatch = content.match(/- Session:\s*(.+)/);
  const compactionsMatch = content.match(/- Compactions:\s*(\d+)/);

  return {
    lastUpdated,
    dailyRemaining: dailyMatch?.[1]?.trim() || '',
    weeklyRemaining: weeklyMatch?.[1]?.trim() || '',
    contextWindow: contextMatch?.[1]?.trim() || '',
    model: modelMatch?.[1]?.trim() || '',
    session: sessionMatch?.[1]?.trim() || '',
    compactions: compactionsMatch ? parseInt(compactionsMatch[1]) : 0,
  };
}

/** Honest token status for Finn on Hermes/GPT-5.5/Codex OAuth.
 *  ChatGPT Pro is subscription-billed, not per-token, so daily/weekly budgets
 *  and context-window usage aren't exposed by the upstream — the frontend's
 *  `|| 'N/A'` fallbacks render those gracefully. Replaces a token-status.md
 *  file the old macOS launchd job stopped writing on 2026-04-18. */
function getHermesTokenStatus() {
  return {
    lastUpdated: new Date().toISOString(),
    dailyRemaining: '',
    weeklyRemaining: '',
    contextWindow: '',
    model: 'GPT-5.5',
    provider: 'OpenAI Codex (ChatGPT Pro)',
    session: '',
    compactions: 0,
    subscription: true,
  };
}

// ─── Bills parser ───

function parseBills(content: string) {
  const bills: Array<{ provider: string; date: string; amount: string; dueDate: string; emailDate: string; subject: string }> = [];
  const entries = content.split(/\n## /).slice(1); // Skip header

  for (const entry of entries) {
    const lines = entry.trim().split('\n');
    const headerMatch = lines[0]?.match(/^(.+?)\s*-\s*(\d{4}-\d{2}-\d{2})/);
    if (!headerMatch) continue;

    const provider = headerMatch[1].trim();
    const date = headerMatch[2];
    const amount = lines.find(l => l.includes('**Amount:**'))?.match(/\*\*Amount:\*\*\s*(.+)/)?.[1]?.trim() || 'Unknown';
    const dueDate = lines.find(l => l.includes('**Due Date:**'))?.match(/\*\*Due Date:\*\*\s*(.+)/)?.[1]?.trim() || 'Unknown';
    const emailDate = lines.find(l => l.includes('**Email Date:**'))?.match(/\*\*Email Date:\*\*\s*(.+)/)?.[1]?.trim() || '';
    const subject = lines.find(l => l.includes('**Subject:**'))?.match(/\*\*Subject:\*\*\s*(.+)/)?.[1]?.trim() || '';

    bills.push({ provider, date, amount, dueDate, emailDate, subject });
  }

  return bills;
}

// ─── Friction Points parser ───

function parseFrictionPoints(content: string) {
  const points: Array<{ name: string; priority: string; status: string; issue: string }> = [];
  const sections = content.split(/\n---\n/);

  for (const section of sections) {
    // Find P1 or P2 sections
    const priorityMatch = section.match(/## Active \((P[12])/);
    if (!priorityMatch) continue;
    const priority = priorityMatch[1];

    // Find individual issues within the section
    const issues = section.split(/\n### /).slice(1);
    for (const issue of issues) {
      const lines = issue.trim().split('\n');
      const name = lines[0]?.trim() || '';
      if (!name || name.includes('FIXED')) continue;
      const statusLine = lines.find(l => l.includes('**Status:**'));
      const status = statusLine?.match(/\*\*Status:\*\*\s*(.+)/)?.[1]?.trim() || '';
      const issueLine = lines.find(l => l.includes('**Issue:**'));
      const issueText = issueLine?.match(/\*\*Issue:\*\*\s*(.+)/)?.[1]?.trim() || '';
      points.push({ name, priority, status, issue: issueText });
    }
  }

  return points;
}

// ─── Meal Plan parser ───

function parseMealPlan(content: string) {
  const titleMatch = content.match(/^# (.+)/m);
  const weekMatch = content.match(/\*\*Week of (.+?)\*\*/);
  return {
    title: titleMatch?.[1]?.trim() || 'Meal Plan',
    weekRange: weekMatch?.[1]?.trim() || '',
    content,
  };
}

// ─── Habits/Streaks transformer ───

function transformStreaks(data: Record<string, { last_date: string; streak: number }>): Array<{ name: string; last_date: string; streak: number }> {
  return Object.entries(data).map(([name, info]) => ({ name, ...info }));
}

// ─── Combined dashboard data (single request for all live data) ───

app.get('/api/dashboard', async (req, res) => {
  try {
    // Fetch EVERYTHING in parallel
    const [
      healthFiles, skillEntries, tasksContent, checkpointContent, checkpointStats,
      scriptEntries, memoryFiles,
      // New data sources
      peopleTracker, jobPipeline, calendarEvents, insightsData,
      socialBattery, streaksData, cronHealth, currentMode,
      ideasData, tokenStatusContent, billsContent,
      ouraData,
      netWorthHistory, aiCostHistory, spendingAlerts, bankBalances,
      mealPlanContent, frictionContent,
      // Crons, goals, missions, quick actions (also read below for re-use)
      , , , ,
      // Kira goals/missions (local)
      kiraGoalsContent, kiraMissionsContent,
    ] = await Promise.all([
      fs.readdir(HEALTH_PATH).catch(() => []),
      fs.readdir(SKILLS_PATH, { withFileTypes: true }).catch(() => []),
      fs.readFile(path.join(MEMORY_PATH, 'tasks.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(MEMORY_PATH, 'checkpoint.md'), 'utf-8').catch(() => ''),
      fs.stat(path.join(MEMORY_PATH, 'checkpoint.md')).catch(() => null),
      fs.readdir(SCRIPTS_PATH).catch(() => []),
      getAllMemoryFilesRecursive({ excludeArchive: true }).catch(() => []),
      // New data sources
      readJsonFile(path.join(MEMORY_PATH, 'people-tracker.json')),
      readJsonFile(path.join(MEMORY_PATH, 'job-pipeline.json')),
      readJsonFile(path.join(MEMORY_PATH, 'work-calendar-events.json')),
      readJsonFile(path.join(MEMORY_PATH, 'insights.json')),
      readJsonFile(path.join(MEMORY_PATH, 'social-battery.json')),
      readJsonFile(path.join(MEMORY_PATH, 'habits', 'streaks.json')),
      computeFinnCronHealth(),
      readJsonFile(path.join(MEMORY_PATH, 'current-mode.json')),
      readJsonFile(path.join(MEMORY_PATH, 'ideas.json')),
      Promise.resolve(null),  // tokenStatusContent — replaced by getHermesTokenStatus() below
      readJsonFile(path.join(MEMORY_PATH, 'finance', 'daily-recap.json')),
      readJsonFile(path.join(MEMORY_PATH, 'health', 'oura-data.json')),
      readJsonFile(path.join(MEMORY_PATH, 'finance', 'net-worth-history.json')),
      readJsonFile(path.join(MEMORY_PATH, 'finance', 'ai-cost-history.json')),
      readJsonFile(path.join(MEMORY_PATH, 'finance', 'spending-alerts.json')),
      readJsonFile(path.join(MEMORY_PATH, 'finance', 'bank-balances.json')),
      readMdFile(path.join(MEMORY_PATH, 'meal-plan-current.md')),
      readMdFile(path.join(MEMORY_PATH, 'friction-points.md')),
      // Crons, goals, missions, quick actions
      readJsonFile(FINN_WORKSPACE_CRONS_PATH),
      readMdFile(path.join(MEMORY_PATH, 'goals.md')),
      readMdFile(path.join(MEMORY_PATH, 'missions.md')),
      readJsonFile(path.join(MEMORY_PATH, 'quick-actions.json')),
      // Kira goals/missions (local)
      readMdFile(path.join(agentMemoryPath('kira'), 'goals.md')),
      readMdFile(path.join(agentMemoryPath('kira'), 'missions.md')),
    ]);

    // Destructure newly added items
    const cronsData = (await readJsonFile(FINN_LIVE_CRONS_PATH) || await readJsonFile(FINN_WORKSPACE_CRONS_PATH)) as CronEntry[] | null;
    const goalsContent = await readMdFile(path.join(MEMORY_PATH, 'goals.md'));
    const missionsContent = await readMdFile(path.join(MEMORY_PATH, 'missions.md'));
    const quickActionsData = await readJsonFile(path.join(MEMORY_PATH, 'quick-actions.json'));

    // Parse crons
    const cronJobs = readCronJobs(cronsData);
    const liveCrons: Array<any> = [];
    for (const entry of cronJobs) {
      const group = entry.payload.kind === 'systemEvent' ? 'System' :
                    entry.delivery?.channel === 'telegram' ? 'Notifications' : 'Automation';
      liveCrons.push({
        id: entry.name,
        agentId: 'finn',
        name: prettyCategoryName(entry.name),
        description: (entry.payload.message || entry.payload.text || '').slice(0, 200),
        schedule: cronEntrySchedule(entry),
        status: entry.enabled ? (entry.state?.lastStatus === 'error' ? 'error' : 'active') : 'paused',
        taskGroup: group,
        executionHistory: [],
      });
    }

    // Parse goals (merge Finn + Kira)
    const finnGoals = goalsContent ? parseGoalsFile(goalsContent, 'finn') : [];
    const kiraGoals = kiraGoalsContent ? parseGoalsFile(kiraGoalsContent, 'kira') : [];
    const goals = [...finnGoals, ...kiraGoals];

    // Parse missions (merge Finn + Kira)
    const finnMissions = missionsContent ? parseMissionsFile(missionsContent, 'finn') : [];
    const kiraMissions = kiraMissionsContent ? parseMissionsFile(kiraMissionsContent, 'kira') : [];
    const missions = [...finnMissions, ...kiraMissions];

    // Quick actions
    const quickActions = quickActionsData?.actions || [];

    // Parse health — prefer the record with the MOST data (highest sum of scores)
    const healthMdFiles = (healthFiles as string[]).filter(f => f.endsWith('.md')).sort().reverse();
    const healthData = await Promise.all(
      healthMdFiles.map(async (file) => {
        const content = await fs.readFile(path.join(HEALTH_PATH, file), 'utf-8');
        return parseHealthFile(file, content);
      })
    );

    // Parse skills
    const skillDirs = (skillEntries as any[]).filter((e: any) => e.isDirectory?.());
    const skills = await Promise.all(
      skillDirs.map(async (dir: any) => {
        const skillPath = path.join(SKILLS_PATH, dir.name);
        let description = '';
        let name = prettyCategoryName(dir.name);
        for (const docFile of ['SKILL.md', 'README.md']) {
          try {
            const content = await fs.readFile(path.join(skillPath, docFile), 'utf-8');
            const firstLine = content.split('\n').find((l: string) => l.startsWith('#'));
            if (firstLine) name = firstLine.replace(/^#+\s*/, '').trim();
            const descLine = content.split('\n').find((l: string) => l.trim() && !l.startsWith('#') && !l.startsWith('---'));
            if (descLine) description = descLine.trim();
            break;
          } catch { /* skip */ }
        }
        return {
          id: dir.name,
          agentId: 'finn',
          name,
          description: description || `${name} skill`,
          icon: guessSkillIcon(dir.name),
          category: guessSkillCategory(dir.name),
          enabled: true,
          commands: [],
        };
      })
    );

    // Parse tasks — fixed regex to not require em-dash
    const tasks = tasksContent ? parseTasksFile(tasksContent) : [];

    // Parse checkpoint
    const checkpoint = checkpointContent ? {
      content: checkpointContent,
      lastModified: checkpointStats?.mtime ?? new Date(),
      parsed: parseCheckpoint(checkpointContent),
    } : null;

    // Scripts count
    const scriptFiles = (scriptEntries as string[]).filter(f => f.endsWith('.sh') || f.endsWith('.py') || f.endsWith('.js'));

    // Parse markdown data sources
    void tokenStatusContent; // legacy, unused — see getHermesTokenStatus()
    const tokenStatus = getHermesTokenStatus();
    // Transform finance recap into bills format for FinanceWidget
    const bills = (() => {
      if (!billsContent) return [];
      const financeData = billsContent as any;
      const result: Array<{ provider: string; amount: string; dueDate: string }> = [];
      // Add upcoming bills
      if (financeData.bills?.upcoming) {
        result.push(...financeData.bills.upcoming);
      }
      // Add overdue bills (marked for visibility)
      if (financeData.bills?.overdue) {
        result.push(...financeData.bills.overdue.map((b: any) => ({
          ...b,
          provider: `⚠️ ${b.provider}` // Mark overdue
        })));
      }
      // Add subscriptions as recurring "bills" for visibility
      if (financeData.subscriptions?.items) {
        financeData.subscriptions.items.slice(0, 5).forEach((sub: any) => {
          result.push({
            provider: `💳 ${sub.name}`,
            amount: `$${sub.amount}/${sub.frequency === 'monthly' ? 'mo' : sub.frequency}`,
            dueDate: 'Recurring'
          });
        });
      }
      return result;
    })();
    const mealPlan = mealPlanContent ? parseMealPlan(mealPlanContent) : null;
    const frictionPoints = frictionContent ? parseFrictionPoints(frictionContent) : [];
    const habitStreaks = streaksData ? transformStreaks(streaksData) : [];

    // For insights, only send summary + top insights (full file is huge)
    const insightsSummary = insightsData ? {
      generated_at: insightsData.generated_at,
      observation_count: insightsData.observation_count,
      insights: (insightsData.insights || []).slice(0, 20), // Top 20 only
    } : null;

    res.json({
      health: healthData,
      skills,
      tasks,
      checkpoint,
      stats: {
        memoryCount: memoryFiles.length,
        skillCount: skillDirs.length,
        scriptCount: scriptFiles.length,
        cronCount: liveCrons.length,
      },
      // All new data sources
      peopleTracker: peopleTracker || null,
      jobPipeline: jobPipeline || [],
      calendarEvents: (() => {
        const raw = Array.isArray(calendarEvents) ? calendarEvents : ((calendarEvents as any)?.events || []);
        return raw.map((e: any) => ({
          subject: e.subject || e.title || 'Untitled',
          start: e.start?.includes('T') ? e.start : (e.date ? e.date + 'T' + (e.start || '00:00') + ':00' : e.start),
          end: e.end?.includes('T') ? e.end : (e.date ? e.date + 'T' + (e.end || '23:59') + ':00' : e.end),
        }));
      })(),
      insights: insightsSummary,
      socialBattery: socialBattery || null,
      habitStreaks,
      cronHealth: cronHealth || null,
      currentMode: currentMode || null,
      ideas: ideasData?.ideas || [],
      tokenStatus,
      bills,
      financeSummary: billsContent ? {
        weeklySpend: (billsContent as any).summary?.weeklySpend || 0,
        monthlyProjection: (billsContent as any).summary?.monthlyProjection || 0,
        subscriptionsBurn: (billsContent as any).summary?.subscriptionsBurn || 0,
        aiCostsWeek: (billsContent as any).summary?.aiCostsWeek || 0,
        generated: (billsContent as any).generated || null,
      } : null,
      financeExtended: {
        netWorthHistory: (() => {
          const history = (netWorthHistory as any)?.history || (netWorthHistory as any)?.entries || [];
          const current = (netWorthHistory as any)?.current;
          if (current?.total && (netWorthHistory as any)?.lastUpdated) {
            const date = ((netWorthHistory as any).lastUpdated as string).slice(0, 10);
            if (!history.find((h: any) => h.date === date)) {
              return [...history, { date, netWorth: current.total }];
            }
          }
          return history;
        })(),
        creditCard: bankBalances ? (() => {
          const accounts = (bankBalances as any)?.accounts || [];
          const creditBalance = accounts
            .filter((a: any) => a.type === 'credit')
            .reduce((sum: number, a: any) => sum + (a.balance || 0), 0);
          return creditBalance < 0 ? {
            balance: creditBalance,
            minPayment: 0,
            dueDate: '',
            creditScore: 0,
          } : null;
        })() : null,
        subscriptionsByCategory: (billsContent as any)?.subscriptions?.byCategory || {},
        aiCosts: (aiCostHistory as any)?.entries?.[0] ? {
          weekTotal: (aiCostHistory as any).entries[0].weeklyTotal || 0,
          monthTotal: (aiCostHistory as any).entries[0].monthlyTotal || 0,
          byModel: (aiCostHistory as any).entries[0].byModel || {},
        } : null,
        alerts: (spendingAlerts as any)?.alerts || [],
      },
      healthExtended: (() => {
        if (!ouraData) return null;
        const data = ouraData as any;
        const dailyData = data.dailyData || {};
        const dates = Object.keys(dailyData).sort();
        const last7 = dates.slice(-7);
        
        // Extract score trends
        const scoreTrends = {
          sleep: last7.map(d => dailyData[d]?.sleep?.score || 0).filter(s => s > 0),
          readiness: last7.map(d => dailyData[d]?.readiness?.score || 0).filter(s => s > 0),
          activity: last7.map(d => dailyData[d]?.activity?.score || 0).filter(s => s > 0),
        };
        
        // Latest scores
        const latestDate = dates[dates.length - 1];
        const prevDate = dates.length > 1 ? dates[dates.length - 2] : null;
        const latest = dailyData[latestDate] || dailyData[prevDate] || {};
        const latestScores = {
          sleep: latest.sleep?.score || (prevDate ? dailyData[prevDate]?.sleep?.score : 0) || 0,
          readiness: latest.readiness?.score || (prevDate ? dailyData[prevDate]?.readiness?.score : 0) || 0,
          activity: latest.activity?.score || (prevDate ? dailyData[prevDate]?.activity?.score : 0) || 0,
        };
        
        // Sleep architecture from latest sleep session
        const latestWithSleep = [...dates].reverse().find(d => dailyData[d]?.sleepSessions?.length > 0);
        const sleepSessions = latestWithSleep ? dailyData[latestWithSleep].sleepSessions : [];
        const mainSleep = sleepSessions.find((s: any) => s.totalSleepDuration?.totalMinutes > 60) || sleepSessions[0];
        const sleepArchitecture = mainSleep ? {
          deep: mainSleep.deepSleepDuration?.totalMinutes || 0,
          rem: mainSleep.remSleepDuration?.totalMinutes || 0,
          light: mainSleep.lightSleepDuration?.totalMinutes || 0,
          total: mainSleep.totalSleepDuration?.totalMinutes || 0,
        } : null;
        
        // Sleep debt (8hr target = 480min per day)
        const targetPerDay = 480;
        const sleepDebt = last7.reduce((debt, d) => {
          const sessions = dailyData[d]?.sleepSessions || [];
          const totalSlept = sessions.reduce((t: number, s: any) => t + (s.totalSleepDuration?.totalMinutes || 0), 0);
          return debt + (targetPerDay - totalSlept);
        }, 0);
        
        // HRV trend
        const hrvTrend = last7
          .map(d => {
            const sessions = dailyData[d]?.sleepSessions || [];
            const mainSession = sessions.find((s: any) => s.averageHrv > 0);
            return mainSession ? { date: d, hrv: mainSession.averageHrv } : null;
          })
          .filter((x): x is { date: string; hrv: number } => x !== null);
        
        // Stress balance from yesterday
        const latestWithStress = [...dates].reverse().find(d => dailyData[d]?.stress?.daySummary);
        const stress = latestWithStress ? dailyData[latestWithStress].stress : null;
        const stressBalance = stress ? {
          stressMinutes: stress.stressHighMinutes || 0,
          recoveryMinutes: stress.recoveryHighMinutes || 0,
          daySummary: stress.daySummary || 'unknown',
        } : null;
        
        // Steps progress
        const latestWithSteps = [...dates].reverse().find(d => dailyData[d]?.activity?.steps > 0);
        const todaySteps = latestWithSteps ? dailyData[latestWithSteps].activity.steps : 0;
        const weeklySteps = last7.reduce((t, d) => t + (dailyData[d]?.activity?.steps || 0), 0);
        const prevWeekDates = dates.slice(-14, -7);
        const lastWeekSteps = prevWeekDates.reduce((t, d) => t + (dailyData[d]?.activity?.steps || 0), 0);
        const stepsProgress = {
          today: todaySteps,
          target: 7000,
          weeklyTotal: weeklySteps,
          lastWeekTotal: lastWeekSteps,
        };
        
        // Weekly comparison
        const currentWeekAvg = {
          sleep: Math.round(scoreTrends.sleep.reduce((a, b) => a + b, 0) / (scoreTrends.sleep.length || 1)),
          readiness: Math.round(scoreTrends.readiness.reduce((a, b) => a + b, 0) / (scoreTrends.readiness.length || 1)),
          activity: Math.round(scoreTrends.activity.reduce((a, b) => a + b, 0) / (scoreTrends.activity.length || 1)),
          steps: weeklySteps,
        };
        const prev7 = dates.slice(-14, -7);
        const prevWeekAvg = {
          sleep: Math.round(prev7.map(d => dailyData[d]?.sleep?.score || 0).filter(s => s > 0).reduce((a, b) => a + b, 0) / (prev7.length || 1)),
          readiness: Math.round(prev7.map(d => dailyData[d]?.readiness?.score || 0).filter(s => s > 0).reduce((a, b) => a + b, 0) / (prev7.length || 1)),
          activity: Math.round(prev7.map(d => dailyData[d]?.activity?.score || 0).filter(s => s > 0).reduce((a, b) => a + b, 0) / (prev7.length || 1)),
          steps: lastWeekSteps,
        };
        
        // Generate insights
        const insights: Array<{ type: string; message: string; severity: string }> = [];
        
        // Check for consecutive stress days
        const stressDays = last7.filter(d => dailyData[d]?.stress?.daySummary === 'stressful').length;
        if (stressDays >= 2) {
          insights.push({
            type: 'stress',
            message: `${stressDays} high-stress days this week — prioritize recovery`,
            severity: 'warning',
          });
        }
        
        // Check for low deep sleep
        if (sleepArchitecture && sleepArchitecture.deep < 60) {
          insights.push({
            type: 'sleep',
            message: 'Deep sleep below target (<1hr) — avoid caffeine/alcohol',
            severity: 'warning',
          });
        }
        
        // Check HRV trend
        if (hrvTrend.length >= 3) {
          const recentHRV = hrvTrend.slice(-3);
          const avgRecent = recentHRV.reduce((a, b) => a + b.hrv, 0) / recentHRV.length;
          const olderHRV = hrvTrend.slice(0, -3);
          if (olderHRV.length > 0) {
            const avgOlder = olderHRV.reduce((a, b) => a + b.hrv, 0) / olderHRV.length;
            if (avgRecent < avgOlder - 5) {
              insights.push({
                type: 'hrv',
                message: 'HRV declining — possible overtraining or illness',
                severity: 'warning',
              });
            }
          }
        }
        
        // Check late bedtimes correlating with low sleep
        const lateBedtimes = last7.filter(d => {
          const sessions = dailyData[d]?.sleepSessions || [];
          const main = sessions.find((s: any) => s.totalSleepDuration?.totalMinutes > 60);
          if (!main) return false;
          const bedtime = new Date(main.bedtimeStart);
          return bedtime.getHours() >= 1 && bedtime.getHours() < 12; // After 1am
        }).length;
        if (lateBedtimes >= 3) {
          insights.push({
            type: 'pattern',
            message: `${lateBedtimes} late nights this week — earlier bedtimes could help`,
            severity: 'info',
          });
        }
        
        return {
          lastUpdated: data.lastUpdated,
          latestScores,
          scoreTrends,
          sleepArchitecture,
          sleepDebt,
          hrvTrend,
          stressBalance,
          stepsProgress,
          weeklyComparison: { current: currentWeekAvg, previous: prevWeekAvg },
          insights,
        };
      })(),
      mealPlan,
      frictionPoints,
      // New live data
      crons: liveCrons,
      goals,
      missions,
      quickActions,
    });
  } catch (error) {
    console.error('Dashboard data error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// ─── Kira Dashboard Data (via SSH) ───

app.get('/api/dashboard/kira', async (req, res) => {
  try {
    const kiraBase = agentBasePath('kira');
    const kiraMemory = agentMemoryPath('kira');

    // ── Dynamic file discovery: latest daily reflection & P0 alert ──
    let latestReflection: string | null = null;
    let latestP0: string | null = null;
    try {
      const reflectionList = (await fs.readdir(path.join(kiraMemory, 'daily-reflections')).catch(() => []))
        .filter(f => f.endsWith('.md')).sort();
      latestReflection = reflectionList.length > 0 ? reflectionList[reflectionList.length - 1] : null;
    } catch { /* skip */ }
    try {
      const allMemFiles = await fs.readdir(kiraMemory).catch(() => []);
      const p0List = allMemFiles.filter(f => f.startsWith('p0-alert-') && f.endsWith('.md')).sort();
      latestP0 = p0List.length > 0 ? p0List[p0List.length - 1] : null;
    } catch { /* skip */ }

    /** Read a file from Kira's local workspace */
    async function readKiraFile(relativePath: string): Promise<string | null> {
      try {
        const content = await fs.readFile(path.join(kiraBase, relativePath), 'utf-8');
        return content.trim() || null;
      } catch {
        return null;
      }
    }

    // Read ALL key files from Kira's local workspace in parallel
    const [
      checkpointRaw, tasksRaw, performanceRaw, cronReportRaw,
      syncStatusRaw, healthLogRaw, morningCheckRaw,
      finnMoodRaw, finnCronHealthRaw, workloadRaw,
      qaLogRaw, dreamsRaw, dailyReflectionRaw,
      finnTrackingRaw, p0AlertRaw, allMemoryFiles,
      skillEntriesRaw, scriptEntriesRaw,
    ] = await Promise.all([
      readKiraFile('memory/checkpoint.md'),
      readKiraFile('memory/tasks.md'),
      readKiraFile('memory/kira-performance.md'),
      readKiraFile('memory/cron-report.md'),
      readKiraFile('memory/sync-status.md'),
      readKiraFile('memory/health-log.md'),
      readKiraFile('memory/morning-systems-check.md'),
      readKiraFile('memory/finn-mood.md'),
      readKiraFile('memory/finn-cron-health.md'),
      readKiraFile('memory/workload.md'),
      readKiraFile('memory/qa-log.md'),
      readKiraFile('memory/dreams.md'),
      latestReflection ? readKiraFile(`memory/daily-reflections/${latestReflection}`) : Promise.resolve(null),
      readKiraFile('memory/finn-tracking/performance-dashboard.md'),
      latestP0 ? readKiraFile(`memory/${latestP0}`) : Promise.resolve(null),
      getKiraLocalMemoryFiles().catch(() => []),
      fs.readdir(path.join(kiraBase, 'skills'), { withFileTypes: true }).catch(() => []),
      fs.readdir(path.join(kiraBase, 'scripts')).catch(() => []),
    ]);
    const skillEntries = skillEntriesRaw;
    const scriptEntries = scriptEntriesRaw;

    // Parse Kira's checkpoint
    const checkpoint = checkpointRaw ? {
      content: checkpointRaw,
      lastModified: new Date().toISOString(),
      parsed: parseKiraCheckpoint(checkpointRaw),
    } : null;

    // Parse Kira's tasks
    const tasks = tasksRaw ? parseKiraTasks(tasksRaw) : [];

    // Parse cron health from performance metrics
    const cronHealth = performanceRaw ? parseKiraPerformance(performanceRaw) : null;

    // ── Build Kira's skill list from skill directories ──
    const skillDirNames = Array.isArray(skillEntries)
      ? (skillEntries as any[]).filter((e: any) => e.isDirectory?.()).map((e: any) => e.name)
      : [];
    const scriptFiles = Array.isArray(scriptEntries)
      ? (scriptEntries as string[]).filter(f => f.endsWith('.ps1') || f.endsWith('.py') || f.endsWith('.sh'))
      : [];
    const skillCount = skillDirNames.length;
    const scriptCount = scriptFiles.length;

    // Read SKILL.md from each skill directory
    const skillDocs = await Promise.all(
      skillDirNames.map(name =>
        readKiraFile(`skills/${name}/SKILL.md`).catch(() => null)
      )
    );

    const skills = skillDirNames.map((dirName, i) => {
      const doc = skillDocs[i];
      let name = prettyCategoryName(dirName);
      let description = `${name} skill`;

      if (doc) {
        // Extract name from YAML frontmatter or first heading
        const nameMatch = doc.match(/^name:\s*(.+)/m) || doc.match(/^#\s+(.+)/m);
        if (nameMatch) name = nameMatch[1].trim();
        // Extract description from frontmatter or first non-header line
        const descMatch = doc.match(/^description:\s*(.+)/m);
        if (descMatch) {
          description = descMatch[1].trim();
        } else {
          const lines = doc.split('\n');
          const descLine = lines.find(l => l.trim() && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('name:') && !l.startsWith('description:'));
          if (descLine) description = descLine.trim();
        }
      }

      return {
        id: dirName,
        agentId: 'kira',
        name,
        description,
        icon: guessSkillIcon(dirName),
        category: guessSkillCategory(dirName),
        enabled: true,
        commands: [],
      };
    });

    // ── Finn Supervision data ──
    const finnSupervision = {
      mood: finnMoodRaw ? parseKiraFinnMood(finnMoodRaw) : null,
      workload: workloadRaw ? parseKiraWorkload(workloadRaw) : null,
      cronHealth: finnCronHealthRaw || null,
      qaVerdict: qaLogRaw ? parseKiraQALog(qaLogRaw) : null,
      tracking: finnTrackingRaw ? parseKiraFinnTracking(finnTrackingRaw) : null,
    };

    // ── System monitoring data ──
    const systemMonitoring = {
      morningCheck: morningCheckRaw ? parseKiraMorningCheck(morningCheckRaw) : null,
      p0Alert: p0AlertRaw ? parseKiraP0Alert(p0AlertRaw) : null,
      cronReport: cronReportRaw ? parseKiraCronReport(cronReportRaw) : null,
      syncStatus: syncStatusRaw ? parseKiraSyncStatus(syncStatusRaw) : null,
      healthLog: healthLogRaw || null,
    };

    // ── Kira's own reflections ──
    const kiraReflections = {
      dailyReflection: dailyReflectionRaw ? parseKiraDailyReflection(dailyReflectionRaw) : null,
      dreams: dreamsRaw || null,
    };

    // Build Kira's known cron list
    const kiraCronList = [
      { name: 'discord-monitor', schedule: '*/5 * * * *', group: 'Core Monitoring', desc: 'Watch Discord for messages from Adam/Finn' },
      { name: 'sys-health', schedule: '0 * * * *', group: 'Core Monitoring', desc: 'Gateway, SSH, disk, Tailscale health check' },
      { name: 'finn-activity-monitor', schedule: '*/15 * * * *', group: 'Finn Supervision', desc: 'Track Finn checkpoint freshness and activity' },
      { name: 'finn-token-watch', schedule: '30 * * * *', group: 'Finn Supervision', desc: 'Monitor Finn token burn rate' },
      { name: 'finn-check', schedule: '0 */2 * * *', group: 'Finn Supervision', desc: 'Finn status and responsiveness check' },
      { name: 'finn-context-backup', schedule: '30 */2 * * *', group: 'Finn Supervision', desc: 'Checkpoint freshness verification' },
      { name: 'finn-output-audit', schedule: '0 14 * * *', group: 'QA & Supervision', desc: 'Deep audit of Finn outputs, mood, and workload' },
      { name: 'evening-summary', schedule: '0 21 * * *', group: 'Reporting', desc: 'Daily summary with performance tracking' },
      { name: 'early-morning-review', schedule: '0 6 * * *', group: 'Core Monitoring', desc: 'Early morning systems review' },
      { name: 'failure-post-mortem', schedule: '0 10 * * *', group: 'Core Monitoring', desc: 'Review and learn from recent failures' },
      { name: 'overnight-watch', schedule: '0 0,3 * * *', group: 'Core Monitoring', desc: 'Overnight monitoring sweep' },
      { name: 'api-health-check', schedule: '*/30 * * * *', group: 'Core Monitoring', desc: 'API endpoint health verification' },
      { name: 'error-log-scan', schedule: '0 */4 * * *', group: 'Core Monitoring', desc: 'Scan logs for errors and anomalies' },
      { name: 'backup-verification', schedule: '0 5 * * *', group: 'Maintenance', desc: 'Verify backup integrity' },
      { name: 'cron-efficiency-audit', schedule: '0 3 * * *', group: 'Maintenance', desc: 'Audit cron execution efficiency' },
      { name: 'learn-from-finn', schedule: '0 23 * * *', group: 'Learning', desc: 'Extract learnings, write daily reflection' },
      { name: 'launch-gate-monitor', schedule: '0 12 * * *', group: 'Projects', desc: 'Teach Charlie go/no-go metrics' },
      { name: 'mission-staleness-check', schedule: '0 9 * * *', group: 'Projects', desc: 'Check for stale goals and blocked tasks' },
    ].map(kc => ({
      id: `kira-${kc.name}`,
      agentId: 'kira',
      name: prettyCategoryName(kc.name),
      description: kc.desc,
      schedule: { cron: kc.schedule, timezone: 'America/New_York', humanReadable: cronExprToHumanReadable(kc.schedule) },
      status: 'active',
      taskGroup: kc.group,
      executionHistory: [],
    }));

    res.json({
      health: [],
      skills,
      tasks,
      checkpoint,
      stats: {
        memoryCount: allMemoryFiles.length,
        skillCount,
        scriptCount,
      },
      // Standard fields (empty for Kira)
      peopleTracker: null,
      jobPipeline: [],
      calendarEvents: [],
      insights: null,
      socialBattery: null,
      habitStreaks: [],
      cronHealth,
      currentMode: { current_mode: 'supervision', set_at: '', auto_detected: true, mode_history: [], stats: {} },
      ideas: [],
      tokenStatus: null,
      bills: [],
      mealPlan: null,
      frictionPoints: [],
      // Live data
      crons: kiraCronList,
      goals: [],
      missions: [],
      quickActions: [],
      // Kira-specific structured data
      finnSupervision,
      systemMonitoring,
      kiraReflections,
    });
  } catch (error) {
    console.error('Kira dashboard error:', error);
    res.status(500).json({ error: 'Failed to load Kira dashboard data' });
  }
});


/** Parse Kira's checkpoint markdown */
function parseKiraCheckpoint(content: string) {
  const getSection = (header: string): string[] => {
    const regex = new RegExp(`##\\s*[^\\n]*${header}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |\\n---|\$)`, 'i');
    const match = content.match(regex);
    if (!match) return [];
    return match[1].trim().split('\n').filter(l => l.startsWith('- ') || l.startsWith('**')).map(l => l.replace(/^-\s*/, '').replace(/\*\*/g, ''));
  };

  return {
    sessionState: getSection('Current State'),
    todayActivity: getSection('Key Events'),
    pendingTasks: getSection('Overnight'),
    systems: getSection('Status|State'),
    tokenStatus: [],
  };
}

/** Parse Kira's task board */
function parseKiraTasks(content: string) {
  const tasks: Array<{
    id: string; agentId: string; title: string;
    completed: boolean; priority: 'high' | 'medium' | 'low';
    category: string; createdAt: Date;
  }> = [];
  let idx = 0;

  for (const line of content.split('\n')) {
    const taskMatch = line.match(/^-\s*\[([ x~])\]\s*(.+)$/);
    if (taskMatch) {
      idx++;
      tasks.push({
        id: `kira-task-${idx}`,
        agentId: 'kira',
        title: taskMatch[2].trim(),
        completed: taskMatch[1] === 'x',
        priority: 'medium',
        category: 'Operations',
        createdAt: new Date(),
      });
    }
    // Also capture table-format active cron jobs
    const tableMatch = line.match(/^\|\s*`(.+?)`\s*\|.+?\|\s*(.+?)\s*\|/);
    if (tableMatch && !line.includes('Job') && !line.includes('---')) {
      idx++;
      tasks.push({
        id: `kira-cron-${idx}`,
        agentId: 'kira',
        title: `${tableMatch[1]} — ${tableMatch[2].trim()}`,
        completed: false,
        priority: 'low',
        category: 'Active Crons',
        createdAt: new Date(),
      });
    }
  }

  return tasks;
}

/** Parse Kira's performance metrics into cron health shape */
function parseKiraPerformance(content: string): { alert: boolean; failures: number; zombies: number; stalled: number; never_run: number; message: string } {
  const totalMatch = content.match(/Total Active Crons:\*\*\s*(\d+)/);
  const avgMatch = content.match(/Average Execution Time:\*\*\s*~?(\d+)/);
  const statusMatch = content.match(/Current Status:\s*(\w+)/i);

  const healthy = statusMatch ? statusMatch[1].toUpperCase() === 'HEALTHY' : true;

  return {
    alert: !healthy,
    failures: 0,
    zombies: 0,
    stalled: 0,
    never_run: 0,
    message: `${totalMatch?.[1] || '?'} crons, avg ${avgMatch?.[1] || '?'}ms — ${healthy ? 'HEALTHY' : 'DEGRADED'}`,
  };
}

// ─── Kira-specific parsers ───

function parseKiraFinnMood(content: string) {
  const stressMatch = content.match(/Stress Level\s*\|\s*(\d+)\/10/);
  const clarityMatch = content.match(/Clarity\s*\|\s*(\d+)\/10/);
  const engagementMatch = content.match(/Engagement\s*\|\s*(\d+)\/10/);
  const confidenceMatch = content.match(/Confidence\s*\|\s*(\d+)\/10/);
  const verdictMatch = content.match(/\*\*Status:\*\*\s*(.+?)(?:\s*\||\n)/);
  const actionMatch = content.match(/\*\*Action Required:\*\*\s*(.+)/);
  const dateMatch = content.match(/## (\d{4}-\d{2}-\d{2}T[\d:]+Z)/);
  return {
    date: dateMatch?.[1] || '',
    stress: stressMatch ? parseInt(stressMatch[1]) : null,
    clarity: clarityMatch ? parseInt(clarityMatch[1]) : null,
    engagement: engagementMatch ? parseInt(engagementMatch[1]) : null,
    confidence: confidenceMatch ? parseInt(confidenceMatch[1]) : null,
    verdict: verdictMatch?.[1]?.trim() || 'Unknown',
    actionRequired: actionMatch?.[1]?.trim() || 'None',
  };
}

function parseKiraWorkload(content: string) {
  const verdictMatch = content.match(/\*\*Verdict:\*\*\s*(.+)/);
  const riskMatch = content.match(/\*\*Risk Level:\*\*\s*(.+)/);
  const dateMatch = content.match(/\*\*Date:\*\*\s*(.+)/);
  const confidenceMatch = content.match(/\*\*Confidence:\*\*\s*(\d+)%/);

  // Extract indicators table
  const indicators: Array<{ metric: string; status: string }> = [];
  const tableRegex = /\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/g;
  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    if (match[1].includes('Metric') || match[1].includes('---')) continue;
    indicators.push({ metric: match[1].trim(), status: match[3].trim() });
  }

  return {
    date: dateMatch?.[1]?.trim() || '',
    verdict: verdictMatch?.[1]?.trim() || 'Unknown',
    riskLevel: riskMatch?.[1]?.trim() || 'Unknown',
    confidence: confidenceMatch ? parseInt(confidenceMatch[1]) : null,
    indicators,
  };
}

function parseKiraQALog(content: string) {
  // Get the most recent QA entry (first one after split, since newest is at top)
  const entries = content.split(/\n---/).filter(e => e.includes('QA Check'));
  const latest = entries[0] || '';
  const dateMatch = latest.match(/##\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s*ET)/);
  // Match verdict line: **✅ PASS** or **❌ FAIL** or similar
  const verdictMatch = latest.match(/\*\*.*(PASS|FAIL|WARNING).*\*\*.*(?:—|$)/m);
  const issueLines = latest.split('\n').filter(l => /^\d+\./.test(l.trim()));
  return {
    date: dateMatch?.[1] || '',
    verdict: verdictMatch?.[1]?.trim() || (latest.includes('PASS') ? 'PASS' : latest.includes('FAIL') ? 'FAIL' : 'Unknown'),
    passed: latest.includes('PASS'),
    issues: issueLines.map(l => l.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').trim()),
  };
}

function parseKiraFinnTracking(content: string) {
  const strengths: string[] = [];
  const opportunities: string[] = [];
  const lines = content.split('\n');
  let section = '';
  for (const line of lines) {
    if (line.includes('Collaboration Strengths')) section = 'strengths';
    else if (line.includes('Development Opportunities')) section = 'opportunities';
    else if (line.startsWith('##')) section = '';
    else if (section === 'strengths' && line.startsWith('- ')) strengths.push(line.replace(/^-\s*/, ''));
    else if (section === 'opportunities' && line.startsWith('- ')) opportunities.push(line.replace(/^-\s*/, ''));
  }
  const lastCheckMatch = content.match(/Last Check-in:\*\*\s*(.+)/);
  return {
    lastCheckIn: lastCheckMatch?.[1]?.trim() || '',
    strengths: strengths.slice(0, 5),
    opportunities: opportunities.slice(0, 3),
  };
}

function parseKiraMorningCheck(content: string) {
  const components: Array<{ name: string; status: string; severity: string }> = [];
  const tableRegex = /\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/g;
  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    if (match[1].includes('Component') || match[1].includes('---')) continue;
    components.push({
      name: match[1].trim(),
      status: match[2].replace(/\*\*/g, '').trim(),
      severity: match[4].replace(/\*\*/g, '').trim(),
    });
  }
  const dateMatch = content.match(/\*\*Date:\*\*\s*(.+)/);
  return {
    date: dateMatch?.[1]?.trim() || '',
    components,
  };
}

function parseKiraP0Alert(content: string) {
  const timeMatch = content.match(/\*\*Time:\*\*\s*(.+)/);
  const alertMatch = content.match(/\*\*Alert:\*\*\s*(.+)/);
  const statusMatch = content.match(/## Status\s*\n\*\*(.+?)\*\*/);
  const systems: Array<{ name: string; status: string }> = [];
  const sysRegex = /\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|/g;
  let match;
  while ((match = sysRegex.exec(content)) !== null) {
    if (match[1].includes('System')) continue;
    systems.push({ name: match[1].trim(), status: match[2].trim() });
  }
  return {
    time: timeMatch?.[1]?.trim() || '',
    alert: alertMatch?.[1]?.trim() || '',
    status: statusMatch?.[1]?.trim() || 'Unknown',
    systems,
    resolved: content.includes('RESOLVED') || content.includes('Recovery confirmed'),
  };
}

function parseKiraCronReport(content: string) {
  const generatedMatch = content.match(/\*\*Generated:\*\*\s*(.+)/);
  const periodMatch = content.match(/\*\*Period:\*\*\s*(.+)/);
  const vmStatusMatch = content.match(/\*\*VM Status:\*\*\s*(.+)/);
  const recoveryMatch = content.match(/\*\*Recovery Time:\*\*\s*(.+)/);
  const affectedCrons: Array<{ name: string; status: string }> = [];
  const cronRegex = /\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/g;
  let match;
  while ((match = cronRegex.exec(content)) !== null) {
    if (match[1].includes('Cron')) continue;
    affectedCrons.push({ name: match[1].trim(), status: match[3].trim() });
  }
  return {
    generated: generatedMatch?.[1]?.trim() || '',
    period: periodMatch?.[1]?.trim() || '',
    vmStatus: vmStatusMatch?.[1]?.trim() || '',
    recoveryTime: recoveryMatch?.[1]?.trim() || '',
    affectedCrons,
  };
}

function parseKiraSyncStatus(content: string) {
  const timeMatch = content.match(/\*\*Time:\*\*\s*(.+)/);
  const statusMatch = content.match(/\*\*Status:\*\*\s*(.+)/);
  const kiraOnly: string[] = [];
  const finnOnly: string[] = [];
  let section = '';
  for (const line of content.split('\n')) {
    if (line.includes('Kira-Only')) section = 'kira';
    else if (line.includes('Finn-Only')) section = 'finn';
    else if (line.startsWith('###')) section = '';
    else if (section === 'kira' && line.startsWith('- ')) kiraOnly.push(line.replace(/^-\s*/, ''));
    else if (section === 'finn' && line.startsWith('- ')) finnOnly.push(line.replace(/^-\s*/, ''));
  }
  return {
    time: timeMatch?.[1]?.trim() || '',
    status: statusMatch?.[1]?.trim() || '',
    kiraOnlyContext: kiraOnly,
    finnOnlyContext: finnOnly,
  };
}

function parseKiraDailyReflection(content: string) {
  const dateMatch = content.match(/Daily Reflection \| (.+?) \|/);
  const learnings: string[] = [];
  const focus: string[] = [];
  const summaryMatch = content.match(/\*\*Overall:\*\*\s*(.+)/);
  let section = '';
  for (const line of content.split('\n')) {
    // Check named sections BEFORE the generic ## reset
    if (line.includes('What I Learned')) { section = 'learn'; continue; }
    if (line.includes("Tomorrow's Focus")) { section = 'focus'; continue; }
    if (line.includes('## Summary')) { section = 'summary'; continue; }
    // Other ## headers (What I Applied, Mistakes, etc.) reset
    if (line.startsWith('## ')) { section = ''; continue; }
    if (section === 'learn' && line.startsWith('### ')) learnings.push(line.replace(/^###\s*\d+\.\s*/, '').trim());
    else if (section === 'focus' && line.startsWith('- ')) focus.push(line.replace(/^-\s*/, '').trim());
  }
  return {
    date: dateMatch?.[1]?.trim() || '',
    learnings,
    tomorrowsFocus: focus,
    summary: summaryMatch?.[1]?.trim() || '',
  };
}

// ─── Existing endpoints ───

// List memory files for an agent
app.get('/api/agents/:agentId/memory', async (req, res) => {
  try {
    const { agentId } = req.params;
    if (agentId === 'kira') {
      const files = await getKiraLocalMemoryCategories();
      return res.json({ files });
    }
    const files = await getAgentMemoryFiles(agentId);
    res.json({ files });
  } catch (error) {
    console.error('Memory endpoint error:', error);
    res.status(500).json({ error: 'Failed to list memory files' });
  }
});

// Get file content
app.get('/api/files/{*filePath}', async (req, res) => {
  try {
    const segments = req.params.filePath;
    const filePath = Array.isArray(segments) ? segments.join('/') : segments;

    // Route kira-remote/ paths to Kira's local workspace
    if (filePath.startsWith('kira-remote/')) {
      const relPath = filePath.replace(/^kira-remote\//, '');
      const fullPath = path.join(agentBasePath('kira'), relPath);

      // Security: ensure path is within Kira's workspace
      if (!fullPath.startsWith(agentBasePath('kira'))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const stats = await fs.stat(fullPath);
        return res.json({
          path: filePath,
          content,
          lastModified: stats.mtime,
          size: stats.size,
        });
      } catch {
        return res.status(404).json({ error: 'File not found' });
      }
    }

    const fullPath = path.join(AGENTS_BASE_PATH, filePath);

    // Security: ensure path is within allowed directory
    if (!fullPath.startsWith(AGENTS_BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    const stats = await fs.stat(fullPath);

    res.json({
      path: filePath,
      content,
      lastModified: stats.mtime,
      size: stats.size,
    });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'File not found' });
    } else {
      res.status(500).json({ error: 'Failed to read file' });
    }
  }
});

// Update file content
app.put('/api/files/{*filePath}', async (req, res) => {
  try {
    const segments = req.params.filePath;
    const filePath = Array.isArray(segments) ? segments.join('/') : segments;
    const fullPath = path.join(AGENTS_BASE_PATH, filePath);
    const { content } = req.body;

    // Security: ensure path is within allowed directory
    if (!fullPath.startsWith(AGENTS_BASE_PATH)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only allow .md files to be edited
    if (!fullPath.endsWith('.md')) {
      return res.status(403).json({ error: 'Only markdown files can be edited' });
    }

    await fs.writeFile(fullPath, content, 'utf-8');
    const stats = await fs.stat(fullPath);

    res.json({
      path: filePath,
      lastModified: stats.mtime,
      size: stats.size,
      success: true,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to write file' });
  }
});

// Get DNA files (root-level .md files)
app.get('/api/dna', async (req, res) => {
  try {
    const agent = req.query.agent as string | undefined;

    if (agent === 'kira') {
      const kiraFiles = await getKiraLocalDNAFiles();
      return res.json({ files: kiraFiles });
    }

    const entries = await fs.readdir(AGENTS_BASE_PATH, { withFileTypes: true });
    const mdFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md'));

    const dnaFiles = await Promise.all(
      mdFiles.map(async (entry) => {
        const fullPath = path.join(AGENTS_BASE_PATH, entry.name);
        const stats = await fs.stat(fullPath);
        return {
          id: entry.name.replace('.md', '').toLowerCase(),
          name: entry.name,
          path: entry.name,
          lastModified: stats.mtime,
          size: stats.size,
        };
      })
    );

    res.json({ files: dnaFiles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list DNA files' });
  }
});

// Get agent stats (computed from actual files)
app.get('/api/agents/:agentId/stats', async (req, res) => {
  try {
    const { agentId } = req.params;
    if (agentId === 'kira') {
      const kiraFiles = await getKiraLocalMemoryFiles();
      return res.json({
        memoryCount: kiraFiles.length,
        cronCount: 0,
        skillCount: 0,
      });
    }

    const [allFiles, skillEntries, rawCrons] = await Promise.all([
      getAllMemoryFilesRecursive({ excludeArchive: true }),
      fs.readdir(SKILLS_PATH, { withFileTypes: true }).catch(() => []),
      readJsonFile(FINN_LIVE_CRONS_PATH).then(v => v || readJsonFile(FINN_WORKSPACE_CRONS_PATH)),
    ]);

    const skillCount = (skillEntries as any[]).filter((e: any) => e.isDirectory?.()).length;
    const cronJobs = readCronJobs(rawCrons);

    res.json({
      memoryCount: allFiles.length,
      cronCount: cronJobs.length,
      skillCount,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get agent stats' });
  }
});

// ─── Kira local file helpers ───

async function getKiraLocalMemoryFiles(): Promise<string[]> {
  const kiraMemory = agentMemoryPath('kira');
  const results: string[] = [];
  await walkKiraDir(kiraMemory, 'kira-remote/memory', results);
  return results;
}

async function walkKiraDir(dir: string, relPrefix: string, results: string[]): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = `${relPrefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === '_archive') continue;
        await walkKiraDir(path.join(dir, entry.name), relPath, results);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(relPath);
      }
    }
  } catch { /* skip */ }
}

async function getKiraLocalDNAFiles(): Promise<Array<{ id: string; name: string; path: string; lastModified: Date; size: number }>> {
  const kiraBase = agentBasePath('kira');
  try {
    const entries = await fs.readdir(kiraBase, { withFileTypes: true });
    const mdFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md'));
    return Promise.all(mdFiles.map(async (entry) => {
      const fullPath = path.join(kiraBase, entry.name);
      const stats = await fs.stat(fullPath);
      return {
        id: `kira-dna-${entry.name.replace('.md', '').toLowerCase()}`,
        name: entry.name,
        path: `kira-remote/${entry.name}`,
        lastModified: stats.mtime,
        size: stats.size,
      };
    }));
  } catch {
    return [];
  }
}

// ─── Kira local memory categories ───

async function getKiraLocalMemoryCategories() {
  const allFiles = await getKiraLocalMemoryFiles();

  const groups: Record<string, string[]> = {};
  for (const f of allFiles) {
    const rel = f.replace(/^kira-remote\/memory\//, '');
    const slashIdx = rel.lastIndexOf('/');
    const dir = slashIdx === -1 ? '' : rel.substring(0, slashIdx);
    const groupKey = dir || '_root';
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(f);
  }

  const categories: any[] = [];
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === '_root') return -1;
    if (b === '_root') return 1;
    return a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    const categoryName = key === '_root' ? 'Root' : prettyCategoryName(key.split('/').pop()!);
    const categoryId = key === '_root' ? 'kira-root' : `kira-${key.replace(/\//g, '-')}`;
    const type = key === '_root' ? 'long-term' : 'reference';

    const files = await Promise.all(groups[key].map(async (filePath) => {
      const relPath = filePath.replace(/^kira-remote\//, '');
      const fullPath = path.join(agentBasePath('kira'), relPath);
      let size = 0;
      let lastModified = new Date();
      try {
        const stats = await fs.stat(fullPath);
        size = stats.size;
        lastModified = stats.mtime;
      } catch { /* skip */ }
      return {
        id: filePath.replace(/[\/\\.]/g, '-'),
        path: filePath,
        name: path.basename(filePath),
        type,
        size,
        lastModified,
      };
    }));

    if (files.length > 0) {
      categories.push({ id: categoryId, name: categoryName, type, count: files.length, files });
    }
  }

  return categories;
}

// ─── Recursive file discovery ───

const VIEWABLE_EXTENSIONS = new Set(['.md', '.json', '.txt', '.jsonl', '.log']);

async function getAllMemoryFilesRecursive(opts?: { excludeArchive?: boolean }): Promise<string[]> {
  const results: string[] = [];
  await walkDir(MEMORY_PATH, 'memory', results, opts);
  return results.sort();
}

/** Generic recursive file listing for any directory */
async function getAllFilesRecursive(dir: string, opts?: { excludeArchive?: boolean }): Promise<string[]> {
  const results: string[] = [];
  await walkDir(dir, '', results, opts);
  return results;
}

async function walkDir(dir: string, relPrefix: string, results: string[], opts?: { excludeArchive?: boolean }): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = `${relPrefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (opts?.excludeArchive && entry.name === '_archive') continue;
        await walkDir(path.join(dir, entry.name), relPath, results, opts);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VIEWABLE_EXTENSIONS.has(ext)) {
          results.push(relPath);
        }
      }
    }
  } catch {
    // Skip unreadable directories
  }
}

// ─── Pretty category names ───

function prettyCategoryName(dirName: string): string {
  return dirName
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Build memory categories for an agent ───

async function getAgentMemoryFiles(agentId: string) {
  const allFiles = await getAllMemoryFilesRecursive({ excludeArchive: true });

  const groups: Record<string, string[]> = {};
  for (const f of allFiles) {
    const rel = f.replace(/^memory\//, '');
    const slashIdx = rel.lastIndexOf('/');
    const dir = slashIdx === -1 ? '' : rel.substring(0, slashIdx);
    const groupKey = dir || '_root';
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(f);
  }

  const categories: any[] = [];
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === '_root') return -1;
    if (b === '_root') return 1;
    return a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    const leafName = key.split('/').pop()!;
    const categoryName = key === '_root' ? 'Root' : prettyCategoryName(leafName);
    const categoryId = key === '_root' ? `${agentId}-root` : `${agentId}-${key.replace(/\//g, '-')}`;
    const type = key === '_root' ? 'long-term' : 'reference';
    const cat = await buildCategory(categoryId, categoryName, type, groups[key]);
    if (cat.files.length > 0) {
      categories.push(cat);
    }
  }

  return categories;
}

async function buildCategory(id: string, name: string, type: string, filePaths: string[]) {
  const files = await Promise.all(
    filePaths.map(async (filePath) => {
      const fullPath = path.join(AGENTS_BASE_PATH, filePath);
      try {
        const stats = await fs.stat(fullPath);
        return {
          id: filePath.replace(/[\/\.]/g, '-'),
          path: filePath,
          name: path.basename(filePath),
          type,
          size: stats.size,
          lastModified: stats.mtime,
        };
      } catch {
        return null;
      }
    })
  );

  const validFiles = files.filter(Boolean);
  return {
    id,
    name,
    type,
    count: validFiles.length,
    files: validFiles,
  };
}

// ─── Visual Reports (HTML diagrams) ───
const VISUAL_REPORTS_PATH = path.join(os.homedir(), '.agent', 'diagrams');

// Serve visual reports as static files
app.use('/reports', express.static(VISUAL_REPORTS_PATH));

// List available visual reports
app.get('/api/visual-reports', async (req, res) => {
  try {
    await fs.mkdir(VISUAL_REPORTS_PATH, { recursive: true });
    const files = await fs.readdir(VISUAL_REPORTS_PATH);
    const reports = await Promise.all(
      files.filter(f => f.endsWith('.html')).map(async (file) => {
        const stats = await fs.stat(path.join(VISUAL_REPORTS_PATH, file));
        const nameMatch = file.match(/finn-weekly-(\d{4}-\d{2}-\d{2})\.html/);
        return {
          id: file.replace('.html', ''),
          name: nameMatch ? `Weekly Report - ${nameMatch[1]}` : file.replace('.html', ''),
          filename: file,
          url: `/reports/${file}`,
          createdAt: stats.mtime,
          size: stats.size,
        };
      })
    );
    res.json({ 
      reports: reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      baseUrl: `http://localhost:${PORT}/reports`,
    });
  } catch (error) {
    console.error('Visual reports error:', error);
    res.status(500).json({ error: 'Failed to list visual reports' });
  }
});

// ─── Reports API ───
const REPORTS_PATH = path.join(MEMORY_PATH, 'reports');

// Reports / daily-recap files stopped writing 2026-04-18 when Finn moved off the
// macOS VM. Without an active producer, surfacing months-old reports as "recent"
// is misleading — return an empty list past this threshold.
const REPORTS_STALE_DAYS = 30;

app.get('/api/reports', async (req, res) => {
  try {
    const files = await fs.readdir(REPORTS_PATH).catch(() => []);
    const reports = await Promise.all(
      files.filter(f => f.endsWith('.json')).map(async (file) => {
        try {
          const content = await fs.readFile(path.join(REPORTS_PATH, file), 'utf-8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      })
    );
    const sorted = reports.filter(Boolean).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const latestMs = sorted[0]?.createdAt ? new Date(sorted[0].createdAt).getTime() : 0;
    const ageDays = latestMs ? Math.floor((Date.now() - latestMs) / (24 * 60 * 60 * 1000)) : null;
    const stale = ageDays !== null && ageDays > REPORTS_STALE_DAYS;
    if (stale) return res.json([]);
    res.json(sorted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

app.get('/api/reports/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    const files = await fs.readdir(REPORTS_PATH).catch(() => []);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(REPORTS_PATH, file), 'utf-8');
        const report = JSON.parse(content);
        if (report.id === reportId) {
          return res.json(report);
        }
      }
    }
    res.status(404).json({ error: 'Report not found' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

app.post('/api/reports', async (req, res) => {
  try {
    const { title, type, prompt, schedule } = req.body;
    const id = `report-${Date.now()}`;
    const report = {
      id,
      title,
      type: type || 'adhoc',
      status: 'pending',
      createdAt: new Date().toISOString(),
      schedule,
      prompt,
      summary: 'Processing...',
    };
    await fs.mkdir(REPORTS_PATH, { recursive: true });
    await fs.writeFile(
      path.join(REPORTS_PATH, `${id}.json`),
      JSON.stringify(report, null, 2)
    );
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create report' });
  }
});

// ─── Build log + friction queue ───

app.get('/api/agents/:agentId/build-log', async (req, res) => {
  const { agentId } = req.params;
  const memPath = agentMemoryPath(agentId);
  try {
    const [buildLogRaw, frictionRaw] = await Promise.allSettled([
      fs.readFile(path.join(memPath, 'build-log.md'), 'utf-8'),
      fs.readFile(path.join(memPath, 'friction-points.md'), 'utf-8'),
    ]);

    let lastBuild: { date: string; friction: string; solution: string; status: string } | null = null;
    if (buildLogRaw.status === 'fulfilled') {
      const match = buildLogRaw.value.match(/## (\d{4}-\d{2}-\d{2}[^\n]*)\n([\s\S]*?)(?=\n## |\n---|\s*$)/);
      if (match) {
        const sectionText = match[2];
        const getField = (field: string) => {
          const m = sectionText.match(new RegExp(`\\|\\s*\\*\\*${field}\\*\\*\\s*\\|\\s*([^|\\n]+)`));
          return m ? m[1].trim() : '';
        };
        lastBuild = {
          date: getField('Date') || match[1].trim(),
          friction: getField('Friction'),
          solution: getField('Solution'),
          status: getField('Status'),
        };
      }
    }

    const frictionCount = frictionRaw.status === 'fulfilled'
      ? (frictionRaw.value.match(/^### /gm) || []).length
      : 0;

    res.json({ lastBuild, frictionCount });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read build log' });
  }
});

// ─── Hermes CLI endpoints (curator, insights, doctor, logs, files) ───

const stripAnsi = (s: string) =>
  s.replace(/\x1b\[[0-9;]*[mGKHF]/g, '').replace(/[─-╿│╭-╯║-╩╔╗╚╝]/g, '');

// 5-minute cache for slow hermes commands (insights, doctor)
const hermesInsightsCache = new Map<string, { data: unknown; ts: number }>();
const hermesDoctorCache = new Map<string, { data: unknown; ts: number }>();
const HERMES_CACHE_TTL = 5 * 60_000;

// GET /api/agents/:agentId/curator
app.get('/api/agents/:agentId/curator', async (req, res) => {
  const { agentId } = req.params;
  if (agentId !== 'finn') {
    return res.status(404).json({ error: 'curator not available' });
  }
  try {
    const { stdout } = await execAsync('hermes curator status', { timeout: 30000 });
    const text = stripAnsi(stdout);

    const getBool  = (key: string) => new RegExp(`${key}:\\s*(ENABLED|DISABLED)`, 'i').exec(text)?.[1]?.toUpperCase() === 'ENABLED';
    const getStr   = (key: string) => new RegExp(`${key}:\\s*(.+)`).exec(text)?.[1]?.trim() ?? null;
    const getInt   = (key: string) => { const m = new RegExp(`${key}\\s+(\\d+)`).exec(text); return m ? parseInt(m[1], 10) : 0; };

    // Skills block
    const totalM    = /agent-created skills:\s*(\d+)/.exec(text);
    const activeM   = /active\s+(\d+)/.exec(text);
    const staleM    = /stale\s+(\d+)/.exec(text);
    const archivedM = /archived\s+(\d+)/.exec(text);

    // Parse skill rows from sections
    const parseSkillRows = (sectionLabel: string) => {
      const sectionRe = new RegExp(`${sectionLabel}[\\s\\S]*?(?=\\n\\S|$)`);
      const section = sectionRe.exec(text)?.[0] ?? '';
      const rowRe = /^\s+(\S+)\s+activity=\s*(\d+)\s+use=\s*(\d+)\s+view=\s*(\d+)\s+patches=\s*(\d+)\s+last_activity=(\S+)/gm;
      const rows: Array<{ name: string; activity: number; use: number; view: number; patches: number; lastActivity: string }> = [];
      let m: RegExpExecArray | null;
      while ((m = rowRe.exec(section)) !== null) {
        rows.push({ name: m[1], activity: parseInt(m[2], 10), use: parseInt(m[3], 10), view: parseInt(m[4], 10), patches: parseInt(m[5], 10), lastActivity: m[6] });
      }
      return rows;
    };

    res.json({
      enabled:      getBool('curator'),
      runs:         getInt('runs:'),
      lastRun:      getStr('last run:'),
      lastSummary:  getStr('last summary:'),
      interval:     getStr('interval:'),
      staleAfter:   getStr('stale after:'),
      archiveAfter: getStr('archive after:'),
      skills: {
        total:    totalM    ? parseInt(totalM[1], 10) : 0,
        active:   activeM   ? parseInt(activeM[1], 10) : 0,
        stale:    staleM    ? parseInt(staleM[1], 10) : 0,
        archived: archivedM ? parseInt(archivedM[1], 10) : 0,
      },
      leastActive: parseSkillRows('least recently active'),
      mostActive:  parseSkillRows('most active'),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? 'Failed to run hermes curator status' });
  }
});

// GET /api/agents/:agentId/insights?days=30
app.get('/api/agents/:agentId/insights', async (req, res) => {
  const { agentId } = req.params;
  if (agentId !== 'finn') {
    return res.status(404).json({ error: 'insights not available' });
  }
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? '30'), 10) || 30, 1), 365);
  const cacheKey = `${agentId}-${days}`;
  const cached = hermesInsightsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < HERMES_CACHE_TTL) {
    return res.json(cached.data);
  }
  try {
    const { stdout } = await execAsync(`hermes insights --days ${days}`, { timeout: 30000 });
    const text = stripAnsi(stdout).replace(/[^\x20-\x7E\n]/g, '');

    const noComma = (s: string) => s.replace(/,/g, '');
    const num     = (s: string) => parseInt(noComma(s), 10);
    const flt     = (s: string) => parseFloat(noComma(s));

    // Period
    const period = /Period:\s*(.+)/.exec(text)?.[1]?.trim() ?? '';

    // Overview block — grab all key:value pairs from the stats table area
    const ov = {
      sessions:          num(/Sessions:\s*([\d,]+)/.exec(text)?.[1] ?? '0'),
      messages:          num(/Messages:\s*([\d,]+)/.exec(text)?.[1] ?? '0'),
      toolCalls:         num(/Tool calls:\s*([\d,]+)/.exec(text)?.[1] ?? '0'),
      userMessages:      num(/User messages:\s*([\d,]+)/.exec(text)?.[1] ?? '0'),
      inputTokens:       num(/Input tokens:\s*([\d,]+)/.exec(text)?.[1] ?? '0'),
      outputTokens:      num(/Output tokens:\s*([\d,]+)/.exec(text)?.[1] ?? '0'),
      totalTokens:       num(/Total tokens:\s*([\d,]+)/.exec(text)?.[1] ?? '0'),
      activeTime:        /Active time:\s*(\S+)/.exec(text)?.[1] ?? '',
      avgSession:        /Avg session:\s*(\S+)/.exec(text)?.[1] ?? '',
      avgMsgsPerSession: flt(/Avg msgs\/session:\s*([\d.]+)/.exec(text)?.[1] ?? '0'),
    };

    // Models Used section
    const modelsSection = /Models Used\s*\n([\s\S]*?)(?=\n[A-Z][a-z]|\n\n[A-Z]|$)/.exec(text)?.[1] ?? '';
    const models: Array<{ name: string; sessions: number; tokens: number }> = [];
    const modelRowRe = /^(\S+)\s+([\d,]+)\s+([\d,]+)/gm;
    let mr: RegExpExecArray | null;
    while ((mr = modelRowRe.exec(modelsSection)) !== null) {
      models.push({ name: mr[1], sessions: num(mr[2]), tokens: num(mr[3]) });
    }

    // Platforms section
    const platSection = /Platforms\s*\n([\s\S]*?)(?=\n[A-Z][a-z]|\n\n[A-Z]|$)/.exec(text)?.[1] ?? '';
    const platforms: Array<{ name: string; sessions: number; messages: number; tokens: number }> = [];
    const platRowRe = /^(\S+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/gm;
    let pr: RegExpExecArray | null;
    while ((pr = platRowRe.exec(platSection)) !== null) {
      platforms.push({ name: pr[1], sessions: num(pr[2]), messages: num(pr[3]), tokens: num(pr[4]) });
    }

    // Top Tools section
    const toolsSection = /Top Tools\s*\n([\s\S]*?)(?=\nActivity Patterns|$)/.exec(text)?.[1] ?? '';
    const topTools: Array<{ name: string; calls: number; errors: number; lastUsed: string }> = [];
    const toolRowRe = /^(\S+)\s+([\d,]+)\s+([\d,]+)\s+(\S+)/gm;
    let tr: RegExpExecArray | null;
    while ((tr = toolRowRe.exec(toolsSection)) !== null) {
      topTools.push({ name: tr[1], calls: num(tr[2]), errors: num(tr[3]), lastUsed: tr[4] });
    }

    // Activity Patterns section
    const actSection = /Activity Patterns\s*\n([\s\S]*?)(?=\nNotable Sessions|Peak hours:|$)/.exec(text)?.[1] ?? '';
    const activityByDay: Record<string, number> = {};
    const dayRe = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([\d,]+)/gm;
    let dr: RegExpExecArray | null;
    while ((dr = dayRe.exec(actSection)) !== null) {
      activityByDay[dr[1]] = num(dr[2]);
    }

    const peakHoursRaw = /Peak hours?:\s*(.+)/.exec(text)?.[1]?.trim() ?? '';
    const peakHours = peakHoursRaw ? peakHoursRaw.split(/,\s*/) : [];
    const activeDays = num(/Active days:\s*([\d,]+)/.exec(text)?.[1] ?? '0');
    const bestStreak = num(/Best streak:\s*([\d,]+)/.exec(text)?.[1] ?? '0');

    // Notable Sessions section
    const longestM     = /Longest session\s+([\d]+h\s*[\d]+m|[\d]+m)\s+\(([^,]+),\s*(\S+)\)/.exec(text);
    const mostMsgsM    = /Most messages\s+([\d,]+)\s*msgs?\s+\(([^,]+),\s*(\S+)\)/.exec(text);
    const mostToksM    = /Most tokens\s+([\d,]+)\s*tokens?\s+\(([^,]+),\s*(\S+)\)/.exec(text);
    const mostToolsM   = /Most tool calls\s+([\d,]+)\s*calls?\s+\(([^,]+),\s*(\S+)\)/.exec(text);

    const notableSessions = {
      longest:       longestM   ? { duration: longestM[1].trim(), date: longestM[2].trim(),   id: longestM[3].trim()   } : null,
      mostMessages:  mostMsgsM  ? { count: num(mostMsgsM[1]),     date: mostMsgsM[2].trim(),  id: mostMsgsM[3].trim()  } : null,
      mostTokens:    mostToksM  ? { count: num(mostToksM[1]),     date: mostToksM[2].trim(),  id: mostToksM[3].trim()  } : null,
      mostToolCalls: mostToolsM ? { count: num(mostToolsM[1]),    date: mostToolsM[2].trim(), id: mostToolsM[3].trim() } : null,
    };

    const data = { period, overview: ov, models, platforms, topTools, activityByDay, peakHours, activeDays, bestStreak, notableSessions };
    hermesInsightsCache.set(cacheKey, { data, ts: Date.now() });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? 'Failed to run hermes insights' });
  }
});

// GET /api/agents/:agentId/doctor
app.get('/api/agents/:agentId/doctor', async (req, res) => {
  const { agentId } = req.params;
  if (agentId !== 'finn') {
    return res.status(404).json({ error: 'doctor not available' });
  }
  const cacheKey = agentId;
  const cached = hermesDoctorCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < HERMES_CACHE_TTL) {
    return res.json(cached.data);
  }
  try {
    const { stdout } = await execAsync('hermes doctor', { timeout: 30000 });
    const text = stripAnsi(stdout);

    type CheckItem = { status: 'pass' | 'warn' | 'fail'; label: string };
    type Category  = { name: string; items: CheckItem[] };

    const categories: Category[] = [];
    let currentCat: Category | null = null;

    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      // Category header: lines starting with the ◆ bullet that hermes doctor uses
      if (/^◆/.test(line)) {
        currentCat = { name: line.replace(/^◆\s*/, '').trim(), items: [] };
        categories.push(currentCat);
        continue;
      }
      if (!currentCat) continue;
      if (/^✓/.test(line)) {
        currentCat.items.push({ status: 'pass', label: line.replace(/^✓\s*/, '').trim() });
      } else if (/^⚠/.test(line)) {
        currentCat.items.push({ status: 'warn', label: line.replace(/^⚠\s*/, '').trim() });
      } else if (/^✗/.test(line)) {
        currentCat.items.push({ status: 'fail', label: line.replace(/^✗\s*/, '').trim() });
      }
    }

    const allItems = categories.flatMap(c => c.items);
    const summary = {
      pass: allItems.filter(i => i.status === 'pass').length,
      warn: allItems.filter(i => i.status === 'warn').length,
      fail: allItems.filter(i => i.status === 'fail').length,
    };

    const data = { categories, summary };
    hermesDoctorCache.set(cacheKey, { data, ts: Date.now() });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? 'Failed to run hermes doctor' });
  }
});

// GET /api/agents/:agentId/logs?log=agent&lines=100&level=INFO&since=1h&component=gateway
app.get('/api/agents/:agentId/logs', async (req, res) => {
  const { agentId } = req.params;
  if (agentId !== 'finn') {
    return res.status(404).json({ error: 'logs not available' });
  }
  const VALID_LOGS = new Set(['agent', 'errors', 'gateway']);
  const logName   = VALID_LOGS.has(String(req.query.log ?? '')) ? String(req.query.log) : 'agent';
  const lines     = Math.min(Math.max(parseInt(String(req.query.lines ?? '100'), 10) || 100, 1), 500);
  const level     = req.query.level     ? String(req.query.level)     : null;
  const since     = req.query.since     ? String(req.query.since)     : null;
  const component = req.query.component ? String(req.query.component) : null;

  // Validate level/since/component values to prevent injection (allow word chars, digits, /, .)
  const safe = (v: string | null) => v && /^[\w./-]+$/.test(v) ? v : null;

  let cmd = `hermes logs ${logName} -n ${lines}`;
  if (safe(level))     cmd += ` --level ${level}`;
  if (safe(since))     cmd += ` --since ${since}`;
  if (safe(component)) cmd += ` --component ${component}`;

  try {
    const { stdout } = await execAsync(cmd, { timeout: 30000 });
    const cleaned = stripAnsi(stdout);
    const logLines = cleaned.split('\n').filter(l => l.trim().length > 0);
    res.json({ log: logName, lines: logLines, count: logLines.length });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? 'Failed to run hermes logs' });
  }
});

// Shared security helper: resolve a user-supplied path relative to ~/.hermes and
// ensure it stays within that directory (no path traversal).
const HERMES_BASE = path.join(os.homedir(), '.hermes');
function resolveHermesPath(userPath: string): string | null {
  // Normalise: strip leading slash so it's always relative
  const rel = String(userPath ?? '').replace(/^\/+/, '') || '.';
  const resolved = path.resolve(HERMES_BASE, rel);
  return resolved.startsWith(HERMES_BASE) ? resolved : null;
}

// GET /api/agents/:agentId/files?path=/
app.get('/api/agents/:agentId/files', async (req, res) => {
  const { agentId } = req.params;
  const safePath = resolveHermesPath(String(req.query.path ?? '/'));
  if (!safePath) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  try {
    const entries = await fs.readdir(safePath, { withFileTypes: true });
    const result = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(safePath, entry.name);
        const stat = await fs.stat(fullPath).catch(() => null);
        return {
          name:     entry.name,
          type:     entry.isDirectory() ? 'dir' : 'file',
          size:     stat?.size ?? 0,
          modified: stat?.mtime?.toISOString() ?? null,
        };
      })
    );
    const relDisplay = '/' + path.relative(HERMES_BASE, safePath).replace(/\\/g, '/');
    res.json({ path: relDisplay === '/.' ? '/' : relDisplay, entries: result });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? 'Failed to list directory' });
  }
});

// GET /api/agents/:agentId/files/content?path=config.yaml
app.get('/api/agents/:agentId/files/content', async (req, res) => {
  const { agentId } = req.params;
  const safePath = resolveHermesPath(String(req.query.path ?? ''));
  if (!safePath) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  try {
    const [content, stat] = await Promise.all([
      fs.readFile(safePath, 'utf-8'),
      fs.stat(safePath),
    ]);
    const relDisplay = path.relative(HERMES_BASE, safePath).replace(/\\/g, '/');
    res.json({ path: relDisplay, content, size: stat.size });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? 'Failed to read file' });
  }
});

// PUT /api/agents/:agentId/files/content?path=config.yaml
app.put('/api/agents/:agentId/files/content', async (req, res) => {
  const { agentId } = req.params;
  const safePath = resolveHermesPath(String(req.query.path ?? ''));
  if (!safePath) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  const { content } = req.body as { content?: string };
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content must be a string' });
  }
  try {
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, 'utf-8');
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? 'Failed to write file' });
  }
});

// ─── Reflections (evening reflections, daily logs) ───

app.get('/api/agents/:agentId/reflections', async (req, res) => {
  const { agentId } = req.params;
  const reflectionsPath = path.join(agentMemoryPath(agentId), 'reflections');
  try {
    const files = await fs.readdir(reflectionsPath).catch(() => []);
    const mdFiles = (files as string[])
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, 30);

    const entries = await Promise.all(
      mdFiles.map(async (file) => {
        const content = await fs.readFile(path.join(reflectionsPath, file), 'utf-8').catch(() => '');
        const firstLines = content.split('\n').filter(Boolean).slice(0, 5).join('\n');
        const isWeekly = file.startsWith('weekly-');
        const isLearnings = file.startsWith('learnings-');
        const dateStr = file.replace('weekly-', '').replace('learnings-', '').replace('.md', '');
        return {
          id: file.replace('.md', ''),
          filename: file,
          date: dateStr,
          type: isWeekly ? 'weekly' : isLearnings ? 'learnings' : 'evening',
          title: isWeekly ? `Weekly Review — ${dateStr}` : isLearnings ? `Learnings — ${dateStr}` : `Evening Reflection — ${dateStr}`,
          excerpt: firstLines.slice(0, 250),
        };
      })
    );

    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read reflections' });
  }
});

app.get('/api/agents/:agentId/reflections/:id', async (req, res) => {
  const { agentId, id } = req.params;
  const reflectionsPath = path.join(agentMemoryPath(agentId), 'reflections');
  try {
    const content = await fs.readFile(path.join(reflectionsPath, `${id}.md`), 'utf-8');
    res.json({ id, content });
  } catch (error) {
    res.status(404).json({ error: 'Reflection not found' });
  }
});

// ─── YNAB live finance snapshot ───

const YNAB_SCRIPT = path.join(os.homedir(), 'finn', 'agent-dashboard', 'server', 'ynab_dashboard.py');
const ynabCache = new Map<string, { data: unknown; ts: number }>();
const YNAB_CACHE_TTL = 5 * 60_000;

app.get('/api/agents/:agentId/ynab', async (req, res) => {
  const { agentId } = req.params;
  if (agentId !== 'finn') return res.status(404).json({ error: 'YNAB only available for finn' });
  const cached = ynabCache.get('finn');
  if (cached && Date.now() - cached.ts < YNAB_CACHE_TTL) return res.json(cached.data);
  try {
    const { stdout } = await execAsync(`python3 ${YNAB_SCRIPT}`, { timeout: 30000 });
    const data = JSON.parse(stdout.trim());
    if (data.error) return res.status(500).json({ error: data.error });
    ynabCache.set('finn', { data, ts: Date.now() });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to fetch YNAB data' });
  }
});

// ─── Hermes Kanban (native agent task board via kanban.db) ───

const KANBAN_QUERY_SCRIPT = path.join(os.homedir(), 'finn', 'agent-dashboard', 'server', 'kanban_query.py');

app.get('/api/agents/:agentId/kanban', async (req, res) => {
  const { agentId } = req.params;
  if (agentId !== 'finn') {
    return res.json({ tasks: [], stats: { total: 0, running: 0, blocked: 0, done: 0 } });
  }
  try {
    const { stdout } = await execAsync(`python3 ${KANBAN_QUERY_SCRIPT}`);
    const parsed = JSON.parse(stdout.trim());
    if (parsed.error) {
      return res.status(500).json({ error: parsed.error });
    }
    const tasks = parsed as Array<{
      id: string; title: string; assignee: string; status: string;
      priority: number; created_at: number; completed_at: number | null;
      run_count: number; spawn_failures: number; last_spawn_error: string | null;
    }>;
    const stats = {
      total: tasks.length,
      triage: tasks.filter(t => t.status === 'triage').length,
      todo: tasks.filter(t => t.status === 'todo').length,
      ready: tasks.filter(t => t.status === 'ready').length,
      running: tasks.filter(t => t.status === 'running').length,
      blocked: tasks.filter(t => t.status === 'blocked').length,
      done: tasks.filter(t => t.status === 'done').length,
    };
    res.json({ tasks, stats });
  } catch (error) {
    console.error('Kanban query error:', error);
    res.status(500).json({ error: 'Failed to read kanban.db' });
  }
});

// ─── Monitoring routes (costs, health, SSE, heatmap, services) ───
app.use(monitoringRouter);

// SPA fallback: any non-/api GET serves index.html so React Router can handle the route.
// Must come AFTER all /api/* routes so they aren't shadowed.
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(DIST_PATH, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Agent Dashboard API running on http://localhost:${PORT}`);
  console.log(`  Base path: ${AGENTS_BASE_PATH}`);
  console.log(`  Memory path: ${MEMORY_PATH}`);
  console.log(`  Skills path: ${SKILLS_PATH}`);
  console.log(`  Health path: ${HEALTH_PATH}`);
});
