import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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
          enabled: true,
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
      const [, status, title] = taskMatch;
      idx++;
      tasks.push({
        id: `task-${idx}`,
        agentId: 'finn',
        title: title.replace(/\*\*/g, '').trim(),
        completed: status === 'x',
        priority: currentPriority,
        category: currentSection,
        createdAt: new Date(),
      });
    }
  }

  return tasks;
}

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
    return JSON.parse(content);
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
    ] = await Promise.all([
      fs.readdir(HEALTH_PATH).catch(() => []),
      fs.readdir(SKILLS_PATH, { withFileTypes: true }).catch(() => []),
      fs.readFile(path.join(MEMORY_PATH, 'tasks.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(MEMORY_PATH, 'checkpoint.md'), 'utf-8').catch(() => ''),
      fs.stat(path.join(MEMORY_PATH, 'checkpoint.md')).catch(() => null),
      fs.readdir(SCRIPTS_PATH).catch(() => []),
      getAllMemoryFilesRecursive().catch(() => []),
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
    ]);

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
    });
  } catch (error) {
    console.error('Dashboard data error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// ─── Kira Dashboard Data (via SSH) ───

app.get('/api/dashboard/kira', async (req, res) => {
  try {
    // Read all key files from Kira's machine in parallel
    const [checkpointRaw, tasksRaw, performanceRaw, cronReportRaw, syncStatusRaw, healthLogRaw, overnightRaw, allMemoryFiles] = await Promise.all([
      sshReadFile('memory/checkpoint.md'),
      sshReadFile('memory/tasks.md'),
      sshReadFile('memory/kira-performance.md'),
      sshReadFile('memory/cron-report.md'),
      sshReadFile('memory/sync-status.md'),
      sshReadFile('memory/health-log.md'),
      sshReadFile('memory/overnight-log.md'),
      getKiraRemoteMemoryFiles().catch(() => []),
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

    // Kira's active cron count from task board
    const cronCountMatch = tasksRaw?.match(/\((\d+) total\)/);
    const cronCount = cronCountMatch ? parseInt(cronCountMatch[1]) : 0;

    // Recent activity from overnight/sync logs
    const recentActivity: string[] = [];
    if (syncStatusRaw) {
      const timeMatch = syncStatusRaw.match(/\*\*Time:\*\*\s*(.+)/);
      if (timeMatch) recentActivity.push(`Sync: ${timeMatch[1].trim()}`);
      const statusMatch = syncStatusRaw.match(/\*\*Status:\*\*\s*(.+)/);
      if (statusMatch) recentActivity.push(statusMatch[1].trim());
    }
    if (overnightRaw) {
      const lines = overnightRaw.split('\n').filter(l => l.startsWith('- ')).slice(0, 3);
      recentActivity.push(...lines.map(l => l.replace(/^-\s*/, '')));
    }

    res.json({
      health: [],
      skills: [],
      tasks,
      checkpoint,
      stats: {
        memoryCount: allMemoryFiles.length,
        skillCount: 0,
        scriptCount: cronCount,
      },
      // Kira doesn't have these data sources, send empty/null
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
      // Kira-specific data
      recentActivity,
      syncStatus: syncStatusRaw || null,
    });
  } catch (error) {
    console.error('Kira dashboard error:', error);
    res.status(500).json({ error: 'Failed to load Kira dashboard data' });
  }
});

/** Read a single file from Kira's machine via SSH */
async function sshReadFile(relativePath: string): Promise<string | null> {
  const winPath = `${KIRA_BASE_PATH}\\${relativePath.replace(/\//g, '\\\\')}`;
  const content = await sshExec(`type "${winPath}"`);
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

    const [allFiles, skillEntries, scriptEntries] = await Promise.all([
      getAllMemoryFilesRecursive(),
      fs.readdir(SKILLS_PATH, { withFileTypes: true }).catch(() => []),
      fs.readdir(SCRIPTS_PATH).catch(() => []),
    ]);

    const skillCount = (skillEntries as any[]).filter((e: any) => e.isDirectory?.()).length;
    const scriptCount = (scriptEntries as string[]).filter(f => f.endsWith('.sh') || f.endsWith('.py') || f.endsWith('.js')).length;

    res.json({
      memoryCount: allFiles.length,
      cronCount: scriptCount,
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

async function getAllMemoryFilesRecursive(): Promise<string[]> {
  const results: string[] = [];
  await walkDir(MEMORY_PATH, 'memory', results);
  return results.sort();
}

async function walkDir(dir: string, relPrefix: string, results: string[]): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = `${relPrefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await walkDir(path.join(dir, entry.name), relPath, results);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(relPath);
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
  const allFiles = await getAllMemoryFilesRecursive();
  const agentFiles = allFiles;

  const groups: Record<string, string[]> = {};
  for (const f of agentFiles) {
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
    const categoryName = key === '_root' ? 'Root' : prettyCategoryName(key.split('/').pop()!);
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

app.listen(PORT, () => {
  console.log(`Agent Dashboard API running on http://localhost:${PORT}`);
  console.log(`  Base path: ${AGENTS_BASE_PATH}`);
  console.log(`  Memory path: ${MEMORY_PATH}`);
  console.log(`  Skills path: ${SKILLS_PATH}`);
  console.log(`  Health path: ${HEALTH_PATH}`);
});
