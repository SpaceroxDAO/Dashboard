import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import monitoringRouter from './monitoring.js';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const app = express();
const PORT = process.env.API_PORT || 3001;

// Base paths for agent files
const AGENTS_BASE_PATH = '/Users/lume/clawd';
const MEMORY_PATH = path.join(AGENTS_BASE_PATH, 'memory');
const SKILLS_PATH = path.join(AGENTS_BASE_PATH, 'skills');
const SCRIPTS_PATH = path.join(AGENTS_BASE_PATH, 'scripts');
const HEALTH_PATH = path.join(MEMORY_PATH, 'health');

// Kira's remote config (Windows PC via Tailscale)
const KIRA_SSH_HOST = 'adami@100.117.33.89';
const KIRA_BASE_PATH = 'C:\\Users\\adami\\kira';
const KIRA_MEMORY_PATH = `${KIRA_BASE_PATH}\\memory`;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Health Data (Oura) ───

app.get('/api/health-data', async (req, res) => {
  try {
    const files = await fs.readdir(HEALTH_PATH);
    const mdFiles = files.filter(f => f.endsWith('.md')).sort().reverse();

    const healthRecords = await Promise.all(
      mdFiles.map(async (file) => {
        const content = await fs.readFile(path.join(HEALTH_PATH, file), 'utf-8');
        return parseHealthFile(file, content);
      })
    );

    res.json({ data: healthRecords });
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

const SKILL_STATES_PATH = path.join(MEMORY_PATH, 'system', 'skill-states.json');

async function readSkillStates(): Promise<Record<string, boolean>> {
  try {
    const content = await fs.readFile(SKILL_STATES_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
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
  if (agentId === 'kira') {
    const content = await sshReadFile('memory/tasks.md');
    return content || '';
  }
  return fs.readFile(path.join(MEMORY_PATH, 'tasks.md'), 'utf-8').catch(() => '');
}

/** Write tasks file content for an agent */
async function writeTasksFile(agentId: string, content: string): Promise<void> {
  if (agentId === 'kira') {
    await sshWriteFile('memory/tasks.md', content);
    return;
  }
  await fs.writeFile(path.join(MEMORY_PATH, 'tasks.md'), content, 'utf-8');
}

/** Write a file to Kira's machine via SSH */
async function sshWriteFile(relativePath: string, content: string): Promise<void> {
  const winPath = `${KIRA_BASE_PATH}\\${relativePath.replace(/\//g, '\\\\')}`;
  // Use PowerShell to write content via stdin pipe
  const escaped = content.replace(/'/g, "''");
  await sshExec(`powershell -Command "Set-Content -Path '${winPath}' -Value '${escaped}' -Encoding UTF8"`);
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

const FINN_LIVE_CRONS_PATH = path.join(os.homedir(), '.openclaw', 'cron', 'jobs.json');
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

/** Read crons.json which has shape { version, jobs: CronEntry[] } */
function readCronJobs(data: unknown): CronEntry[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object' && data !== null && 'jobs' in data && Array.isArray((data as any).jobs)) {
    return (data as any).jobs;
  }
  return [];
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
      let cronSource = 'openclaw-gateway';
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

      // Parse launchd plists
      try {
        const plistFiles = await fs.readdir(LAUNCHD_PATH);
        for (const file of plistFiles.filter(f => f.endsWith('.plist'))) {
          const content = await fs.readFile(path.join(LAUNCHD_PATH, file), 'utf-8');
          const labelMatch = content.match(/<key>Label<\/key>\s*<string>(.+?)<\/string>/);
          const hourMatch = content.match(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/);
          const minuteMatch = content.match(/<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/);
          const scriptMatch = content.match(/<string>(\/[^<]+\.(sh|py|js))<\/string>/);
          const label = labelMatch?.[1] || file.replace('.plist', '');
          const name = label.replace('com.finn.', '');

          // Skip if already in crons.json
          if (crons.some(c => c.id === name)) continue;

          const hour = hourMatch?.[1] || '0';
          const minute = minuteMatch?.[1] || '0';
          crons.push({
            id: name,
            agentId: 'finn',
            name: prettyCategoryName(name),
            description: scriptMatch ? `Runs ${path.basename(scriptMatch[1])}` : 'launchd scheduled task',
            schedule: {
              cron: `${minute} ${hour} * * *`,
              timezone: 'America/New_York',
              humanReadable: `Daily at ${hour}:${minute.padStart(2, '0')}`,
            },
            status: 'active',
            taskGroup: 'launchd',
            source: 'launchd',
          });
        }
      } catch { /* no launchd directory */ }
    }

    if (agentId === 'kira') {
      // Read live cron state from Kira's gateway via SSH
      try {
        const { stdout } = await execAsync(
          'ssh adami@100.117.33.89 "type C:\\Users\\adami\\.openclaw\\cron\\jobs.json"',
          { timeout: 15000 }
        );

        // Parse the SSH output (Windows 'type' command outputs the file content)
        const kiraData = JSON.parse(stdout.trim());
        const kiraJobs = Array.isArray(kiraData) ? kiraData : (kiraData.jobs || []);

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
      } catch (sshError) {
        console.error('Failed to read Kira crons via SSH, using fallback:', sshError);
        // Fallback: return empty list with error note
        crons.push({
          id: 'kira-error',
          agentId: 'kira',
          name: 'Error Reading Kira Crons',
          description: 'Could not connect to Kira via SSH. Check Tailscale connection.',
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

// POST /api/crons/:cronId/run -- trigger cron via OpenClaw gateway
app.post('/api/crons/:cronId/run', async (req, res) => {
  try {
    const { cronId } = req.params;
    const { agentId } = req.body; // Optional: 'finn' or 'kira'

    // Determine which agent this cron belongs to
    const isKiraCron = agentId === 'kira' || cronId.startsWith('kira-');

    if (isKiraCron) {
      // Trigger Kira cron via SSH
      const cronUuid = cronId.replace('kira-', '');
      const { stdout, stderr } = await execAsync(
        `ssh adami@100.117.33.89 "openclaw cron run ${cronUuid}"`,
        { timeout: 30000 }
      );

      res.json({
        success: true,
        cronId,
        method: 'openclaw-gateway-ssh',
        output: stdout.substring(0, 5000),
        stderr: stderr ? stderr.substring(0, 2000) : undefined,
        executedAt: new Date().toISOString(),
      });
    } else {
      // Trigger Finn cron via local OpenClaw gateway
      // First, find the UUID for this cron name from jobs.json
      let cronUuid = cronId;

      try {
        const jobsData = await readJsonFile(FINN_LIVE_CRONS_PATH);
        const jobs = readCronJobs(jobsData);
        const match = jobs.find((j: any) => j.name === cronId || j.id === cronId);
        if (match) {
          cronUuid = match.id;
        }
      } catch { /* use cronId as-is, might already be a UUID */ }

      const { stdout, stderr } = await execAsync(
        `export PATH="/Users/lume/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH" && openclaw cron run ${cronUuid}`,
        { timeout: 120000 }
      );

      res.json({
        success: true,
        cronId,
        method: 'openclaw-gateway',
        output: stdout.substring(0, 5000),
        stderr: stderr ? stderr.substring(0, 2000) : undefined,
        executedAt: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.error('Cron run error:', error);
    res.json({
      success: false,
      cronId: req.params.cronId,
      error: error.message || 'Cron execution failed',
      method: 'openclaw-gateway',
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
      readMdFile(path.join(MEMORY_PATH, 'goals.md')),
      sshReadFile('memory/goals.md').catch(() => null),
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
      readMdFile(path.join(MEMORY_PATH, 'missions.md')),
      sshReadFile('memory/missions.md').catch(() => null),
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

// ─── Quick Action Execution ───

app.post('/api/quick-actions/:actionId/execute', async (req, res) => {
  try {
    const { actionId } = req.params;

    const data = await readJsonFile(path.join(MEMORY_PATH, 'quick-actions.json'));
    const actions = data?.actions || [];
    const action = actions.find((a: any) => a.id === actionId);

    if (!action) {
      return res.status(404).json({ error: `Action '${actionId}' not found` });
    }

    if (!action.scriptPath) {
      return res.status(400).json({ error: 'Action has no script path' });
    }

    const scriptFullPath = path.join(AGENTS_BASE_PATH, action.scriptPath);

    // Security: verify path is within workspace
    if (!scriptFullPath.startsWith(AGENTS_BASE_PATH)) {
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

    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: 60000,
      cwd: AGENTS_BASE_PATH,
      env: { ...process.env, HOME: process.env.HOME || '/Users/lume' },
    });

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
      healthAlerts, tokenStatusContent, checkpointContent,
    ] = await Promise.all([
      fs.readdir(SCRIPTS_PATH).catch(() => []),
      fs.readdir(SKILLS_PATH, { withFileTypes: true }).catch(() => []),
      getAllMemoryFilesRecursive({ excludeArchive: true }).catch(() => []),
      readJsonFile(FINN_WORKSPACE_CRONS_PATH),
      readJsonFile(path.join(MEMORY_PATH, 'cron-health-alerts.json')),
      readMdFile(path.join(MEMORY_PATH, 'token-status.md')),
      readMdFile(path.join(MEMORY_PATH, 'checkpoint.md')),
    ]);

    const scriptCount = (scriptEntries as string[]).filter(f => f.endsWith('.sh') || f.endsWith('.py') || f.endsWith('.js')).length;
    const skillCount = (skillEntries as any[]).filter((e: any) => e.isDirectory?.()).length;
    const cronJobs = readCronJobs(cronsData);
    const cronCount = cronJobs.length;
    const tokenStatus = tokenStatusContent ? parseTokenStatus(tokenStatusContent) : null;

    // Check Kira connectivity
    let kiraOnline = false;
    try {
      const kiraTest = await sshExec('echo ok');
      kiraOnline = kiraTest.trim() === 'ok';
    } catch { /* offline */ }

    res.json({
      agents: [
        {
          id: 'finn',
          name: 'Finn',
          emoji: '\u{1F98A}',
          status: 'online',
          model: tokenStatus?.model || 'Claude Opus 4.5',
          platform: 'macOS (Tailscale VM)',
          features: ['chat', 'memory', 'crons', 'skills', 'health', 'location'],
          stats: { memoryFiles: memoryFiles.length, scripts: scriptCount, skills: skillCount, crons: cronCount },
        },
        {
          id: 'kira',
          name: 'Kira',
          emoji: '\u{1F989}',
          status: kiraOnline ? 'online' : 'offline',
          model: 'Kimi / Qwen 2.5 7B',
          platform: 'Windows PC (Tailscale)',
          features: ['chat', 'memory', 'crons', 'skills', 'supervision'],
          stats: { crons: 18, skills: 0, scripts: 0, memoryFiles: 0 },
        },
      ],
      infrastructure: {
        apiServer: { status: 'online', port: PORT, base: AGENTS_BASE_PATH },
        tailscale: { funnel: 'https://lumes-virtual-machine.tailf846b2.ts.net/dashboard-api' },
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
        { name: 'Plaid', status: 'active', description: 'Financial transaction sync' },
        { name: 'LinkedIn', status: 'active', description: 'Job opportunity monitoring' },
        { name: 'Spotify', status: 'inactive', description: 'Music playback control' },
      ],
      cronHealth: healthAlerts || { alert: false, failures: 0, zombies: 0, stalled: 0, never_run: 0, message: 'OK' },
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
      mealPlanContent, frictionContent,
      // Crons, goals, missions, quick actions (also read below for re-use)
      , , , ,
      // Kira goals/missions via SSH
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
      readJsonFile(path.join(MEMORY_PATH, 'cron-health-alerts.json')),
      readJsonFile(path.join(MEMORY_PATH, 'current-mode.json')),
      readJsonFile(path.join(MEMORY_PATH, 'ideas.json')),
      readMdFile(path.join(MEMORY_PATH, 'token-status.md')),
      readMdFile(path.join(MEMORY_PATH, 'bills.md')),
      readMdFile(path.join(MEMORY_PATH, 'meal-plan-current.md')),
      readMdFile(path.join(MEMORY_PATH, 'friction-points.md')),
      // Crons, goals, missions, quick actions
      readJsonFile(FINN_WORKSPACE_CRONS_PATH),
      readMdFile(path.join(MEMORY_PATH, 'goals.md')),
      readMdFile(path.join(MEMORY_PATH, 'missions.md')),
      readJsonFile(path.join(MEMORY_PATH, 'quick-actions.json')),
      // Kira goals/missions via SSH
      sshReadFile('memory/goals.md').catch(() => null),
      sshReadFile('memory/missions.md').catch(() => null),
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
    const tokenStatus = tokenStatusContent ? parseTokenStatus(tokenStatusContent) : null;
    const bills = billsContent ? parseBills(billsContent) : [];
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
      calendarEvents: calendarEvents || [],
      insights: insightsSummary,
      socialBattery: socialBattery || null,
      habitStreaks,
      cronHealth: cronHealth || null,
      currentMode: currentMode || null,
      ideas: ideasData?.ideas || [],
      tokenStatus,
      bills,
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
    // ── Dynamic file discovery: latest daily reflection & P0 alert ──
    const [reflectionFiles, p0Files] = await Promise.all([
      sshExec('dir /b "C:\\Users\\adami\\kira\\memory\\daily-reflections"').catch(() => ''),
      sshExec('dir /b "C:\\Users\\adami\\kira\\memory\\p0-alert-*"').catch(() => ''),
    ]);

    // Find latest daily reflection (sorted alphabetically = chronologically with YYYY-MM-DD names)
    const reflectionList = reflectionFiles.trim().split(/\r?\n/).filter(f => f.endsWith('.md')).sort();
    const latestReflection = reflectionList.length > 0 ? reflectionList[reflectionList.length - 1] : null;

    // Find latest P0 alert
    const p0List = p0Files.trim().split(/\r?\n/).filter(f => f.endsWith('.md')).sort();
    const latestP0 = p0List.length > 0 ? p0List[p0List.length - 1] : null;

    // Read ALL key files from Kira's machine in parallel
    const [
      checkpointRaw, tasksRaw, performanceRaw, cronReportRaw,
      syncStatusRaw, healthLogRaw, morningCheckRaw,
      finnMoodRaw, finnCronHealthRaw, workloadRaw,
      qaLogRaw, dreamsRaw, dailyReflectionRaw,
      finnTrackingRaw, p0AlertRaw, allMemoryFiles,
      skillEntries, scriptEntries,
    ] = await Promise.all([
      sshReadFile('memory/checkpoint.md'),
      sshReadFile('memory/tasks.md'),
      sshReadFile('memory/kira-performance.md'),
      sshReadFile('memory/cron-report.md'),
      sshReadFile('memory/sync-status.md'),
      sshReadFile('memory/health-log.md'),
      sshReadFile('memory/morning-systems-check.md'),
      sshReadFile('memory/finn-mood.md'),
      sshReadFile('memory/finn-cron-health.md'),
      sshReadFile('memory/workload.md'),
      sshReadFile('memory/qa-log.md'),
      sshReadFile('memory/dreams.md'),
      latestReflection ? sshReadFile(`memory/daily-reflections/${latestReflection}`) : Promise.resolve(null),
      sshReadFile('memory/finn-tracking/performance-dashboard.md'),
      latestP0 ? sshReadFile(`memory/${latestP0}`) : Promise.resolve(null),
      getKiraRemoteMemoryFiles().catch(() => []),
      sshExec('dir /b "C:\\Users\\adami\\kira\\skills"').catch(() => ''),
      sshExec('dir /b "C:\\Users\\adami\\kira\\scripts"').catch(() => ''),
    ]);

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
    const skillDirNames = skillEntries ? skillEntries.trim().split(/\r?\n/).filter(Boolean) : [];
    const scriptFiles = scriptEntries ? scriptEntries.trim().split(/\r?\n/).filter(f => f.endsWith('.ps1') || f.endsWith('.py') || f.endsWith('.sh')) : [];
    const skillCount = skillDirNames.length;
    const scriptCount = scriptFiles.length;

    // Read SKILL.md from each skill directory
    const skillDocs = await Promise.all(
      skillDirNames.map(name =>
        sshReadFile(`skills/${name}/SKILL.md`).catch(() => null)
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
      { name: 'discord-monitor', schedule: '*/5 * * * *', group: 'Core Monitoring', desc: 'Watch for Discord messages' },
      { name: 'sys-health', schedule: '0 * * * *', group: 'Core Monitoring', desc: 'Gateway/system health check' },
      { name: 'afternoon-check', schedule: '0 15 * * *', group: 'Core Monitoring', desc: 'Deadline warnings' },
      { name: 'evening-summary', schedule: '0 21 * * *', group: 'Core Monitoring', desc: 'Day recap' },
      { name: 'morning-check', schedule: '0 8 * * *', group: 'Core Monitoring', desc: 'Morning systems check' },
      { name: 'midnight-sweep', schedule: '0 0 * * *', group: 'Core Monitoring', desc: 'Midnight maintenance sweep' },
      { name: 'finn-qa-check', schedule: '*/30 * * * *', group: 'QA & Supervision', desc: 'QA review of Finn outputs' },
      { name: 'finn-check', schedule: '0 */2 * * *', group: 'QA & Supervision', desc: 'Finn status check' },
      { name: 'finn-context-backup', schedule: '0 */2 * * *', group: 'QA & Supervision', desc: 'Checkpoint freshness check' },
      { name: 'finn-mood-check', schedule: '0 12,18 * * *', group: 'QA & Supervision', desc: 'Finn mood assessment' },
      { name: 'workload-check', schedule: '0 10,14,17 * * *', group: 'QA & Supervision', desc: 'Workload analysis' },
      { name: 'cron-audit', schedule: '0 3 * * *', group: 'QA & Supervision', desc: 'Audit cron job inventory' },
      { name: 'learn-from-finn', schedule: '0 13 * * *', group: 'Learning', desc: 'Extract learnings from Finn' },
      { name: 'daily-reflection', schedule: '0 23 * * *', group: 'Learning', desc: 'Daily meta-reflection' },
      { name: 'dream-cycle', schedule: '0 4 * * *', group: 'Learning', desc: 'Creative dream processing' },
      { name: 'sync-check', schedule: '0 6,14,22 * * *', group: 'Maintenance', desc: 'Cross-agent sync status' },
      { name: 'p0-monitor', schedule: '*/15 * * * *', group: 'Maintenance', desc: 'P0 alert monitoring' },
      { name: 'memory-cleanup', schedule: '0 5 * * *', group: 'Maintenance', desc: 'Memory file cleanup' },
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

/** Read a single file from Kira's machine via SSH */
async function sshReadFile(relativePath: string): Promise<string | null> {
  const winPath = `${KIRA_BASE_PATH}\\${relativePath.replace(/\//g, '\\\\')}`;
  const raw = await sshExec(`type "${winPath}"`);
  // Normalize Windows CRLF to Unix LF for parser compatibility
  const content = raw.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
  return content.trim() || null;
}

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
      const files = await getKiraRemoteMemoryCategories();
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

    // Route kira-remote/ paths to Windows PC via SSH
    if (filePath.startsWith('kira-remote/')) {
      const remote = await readKiraRemoteFile(filePath);
      if (!remote.content) {
        return res.status(404).json({ error: 'File not found on remote' });
      }
      return res.json({
        path: filePath,
        content: remote.content,
        lastModified: remote.lastModified,
        size: remote.size,
      });
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
      const kiraFiles = await getKiraRemoteDNAFiles();
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
      const kiraFiles = await getKiraRemoteMemoryFiles();
      return res.json({
        memoryCount: kiraFiles.length,
        cronCount: 0,
        skillCount: 0,
      });
    }

    const [allFiles, skillEntries, rawCrons] = await Promise.all([
      getAllMemoryFilesRecursive({ excludeArchive: true }),
      fs.readdir(SKILLS_PATH, { withFileTypes: true }).catch(() => []),
      readJsonFile(FINN_WORKSPACE_CRONS_PATH),
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

// ─── SSH helpers for Kira's remote files ───

async function sshExec(command: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('ssh', [
      '-o', 'ConnectTimeout=5',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'BatchMode=yes',
      KIRA_SSH_HOST,
      command,
    ], { timeout: 10000 });
    return stdout;
  } catch {
    return '';
  }
}

async function getKiraRemoteMemoryFiles(): Promise<string[]> {
  const output = await sshExec(`dir /s /b "${KIRA_MEMORY_PATH}\\*.md"`);
  if (!output.trim()) return [];
  return output.trim().split('\r\n').filter(Boolean).map(line => {
    const rel = line.replace(/\\/g, '/').replace(/^.*?kira\//, '');
    return `kira-remote/${rel}`;
  });
}

async function getKiraRemoteDNAFiles(): Promise<Array<{ id: string; name: string; path: string; lastModified: Date; size: number }>> {
  const output = await sshExec(`dir /b "${KIRA_BASE_PATH}\\*.md"`);
  if (!output.trim()) return [];
  const fileNames = output.trim().split('\r\n').filter(Boolean);
  const files = await Promise.all(fileNames.map(async (name) => {
    const sizeOutput = await sshExec(`for %I in ("${KIRA_BASE_PATH}\\${name}") do @echo %~zI|%~tI`);
    const parts = sizeOutput.trim().split('|');
    const size = parseInt(parts[0]) || 0;
    return {
      id: `kira-dna-${name.replace('.md', '').toLowerCase()}`,
      name,
      path: `kira-remote/${name}`,
      lastModified: new Date(),
      size,
    };
  }));
  return files;
}

async function readKiraRemoteFile(remotePath: string): Promise<{ content: string; size: number; lastModified: Date }> {
  const relPath = remotePath.replace(/^kira-remote\//, '');
  const winPath = `${KIRA_BASE_PATH}\\${relPath.replace(/\//g, '\\\\')}`;
  const content = await sshExec(`type "${winPath}"`);
  return { content, size: Buffer.byteLength(content, 'utf-8'), lastModified: new Date() };
}

// ─── Kira remote memory categories ───

async function getKiraRemoteMemoryCategories() {
  const allFiles = await getKiraRemoteMemoryFiles();

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
    const files = groups[key].map(filePath => ({
      id: filePath.replace(/[\/\\.]/g, '-'),
      path: filePath,
      name: path.basename(filePath),
      type,
      size: 0,
      lastModified: new Date(),
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

// ─── Monitoring routes (costs, health, SSE, heatmap, services) ───
app.use(monitoringRouter);

app.listen(PORT, () => {
  console.log(`Agent Dashboard API running on http://localhost:${PORT}`);
  console.log(`  Base path: ${AGENTS_BASE_PATH}`);
  console.log(`  Memory path: ${MEMORY_PATH}`);
  console.log(`  Skills path: ${SKILLS_PATH}`);
  console.log(`  Health path: ${HEALTH_PATH}`);
});
