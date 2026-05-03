import { useEffect, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { activeAgentIdAtom } from '@/store/atoms';
import { getSSEUrl } from '@/services/api';

// Mirrors the 6 module nodes from Hermes' cellular-cortex theme
// (theme_plugins/ascii_fields.py CellularCortexPlugin._MODULES).
const MODULES = [
  { name: 'memory', x: 0.18, y: 0.30, icon: '∿' }, // ∿
  { name: 'model',  x: 0.50, y: 0.22, icon: '☿' }, // ☿
  { name: 'tools',  x: 0.82, y: 0.30, icon: '⚙' }, // ⚙
  { name: 'cron',   x: 0.22, y: 0.75, icon: '⏱' }, // ⏱
  { name: 'core',   x: 0.50, y: 0.55, icon: '◎' }, // ◎
  { name: 'aegis',  x: 0.78, y: 0.75, icon: '⚡' }, // ⚡
];

type ReactionKind = 'pulse' | 'ripple' | 'shatter';

interface Reaction {
  module: string;
  kind: ReactionKind;
  start: number;
  duration: number;
}

// Map dashboard FeedEvent → cellular-cortex react() entry.
// The Hermes plugin reacts to (memory_save → memory bloom), (tool_call → tools
// ripple), (tool_error → tools shatter/red), (llm_chunk → model stream),
// (agent_start → core pulse), (cron_tick → cron orbit). The dashboard SSE
// surfaces user/assistant/tool_call/tool_result/compaction/model_change.
function reactionFor(evt: { type: string; channel?: string; toolStatus?: string }): Reaction | null {
  const now = Date.now();
  if (evt.type === 'user') {
    if (evt.channel === 'cron') return { module: 'cron', kind: 'ripple', start: now, duration: 3000 };
    return { module: 'core', kind: 'pulse', start: now, duration: 2500 };
  }
  if (evt.type === 'assistant') return { module: 'model', kind: 'pulse', start: now, duration: 1800 };
  // Tool calls linger longer — Hermes often fires several in quick succession
  // within one agent:step, and a too-short ripple makes the burst feel like a
  // strobe. ~4s lets adjacent reactions blend into a sustained "tools active"
  // state instead of a flicker.
  if (evt.type === 'tool_call') return { module: 'tools', kind: 'ripple', start: now, duration: 4000 };
  if (evt.type === 'tool_result') {
    if (evt.toolStatus === 'error') return { module: 'tools', kind: 'shatter', start: now, duration: 3000 };
    return { module: 'tools', kind: 'ripple', start: now, duration: 2000 };
  }
  if (evt.type === 'compaction') return { module: 'memory', kind: 'pulse', start: now, duration: 2500 };
  if (evt.type === 'model_change') return { module: 'model', kind: 'pulse', start: now, duration: 2500 };
  return null;
}

// Palette mapped to the dashboard's warm amber theme.
// Reference CSS vars (src/index.css):
//   surface-base   #1a1510  warm-dark-brown   →  background
//   signal-primary #e07832  orange   ≈ hsl(22°, 75%, 53%) →  accent ring
//   signal-secondary #d4a04a amber   ≈ hsl(38°, 60%, 56%) →  soft tier
//   text-bright    #faf3e8  cream    ≈ hsl(35°, 50%, 95%) →  bright tier
//   text-dim       #7a6e5a  tan      ≈ hsl(35°, 15%, 42%) →  base tier
//   signal-alert   #ef4444  red                            →  error palette
function hueColor(v: number, phase: number, alpha: number, isError = false): string {
  if (isError) {
    // palette_shift to red/yellow on error (matches dashboard signal-alert)
    const hue = 5 + phase * 45;
    return `hsla(${hue}, 85%, ${30 + v * 50}%, ${alpha})`;
  }
  // Warm amber spectrum: tan (35°) → amber (38°) → orange (22°) → cream (35°)
  const s = (v + phase) % 1;
  let hue: number;
  let lightness: number;
  let sat: number;
  if (s > 0.72)      { hue = 35; lightness = 88; sat = 45; }       // bright/cream
  else if (s > 0.48) { hue = 22; lightness = 50 + v * 10; sat = 75; } // accent/orange
  else if (s > 0.24) { hue = 38; lightness = 48; sat = 60; }       // soft/amber
  else               { hue = 30; lightness = 22; sat = 35; }       // base/dim tan
  return `hsla(${hue}, ${sat}%, ${lightness}%, ${alpha})`;
}

interface NeurovisualizerProps {
  height?: number;
}

export function Neurovisualizer({ height = 192 }: NeurovisualizerProps) {
  const [agentId] = useAtom(activeAgentIdAtom);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reactionsRef = useRef<Reaction[]>([]);
  const frameRef = useRef(0);

  // Live-event meter — proves the visualizer is reacting to real Hermes events
  // beyond just the on-connect backfill. Counts events received since mount and
  // tracks the timestamp of the most recent one so the user can see the
  // heartbeat even when no module is currently pulsing.
  const [eventCount, setEventCount] = useState(0);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [, setTick] = useState(0); // re-render every second to update "Xs ago"
  // Mirror lastEventAt into a ref so the render loop's stale closure can read it
  const lastEventAtRef = useRef<number | null>(null);

  // SSE: collect events as cortex reactions. The /api/live endpoint sends a
  // backfill burst on connect (~80 historical events from the last hour) — we
  // discard those for visualization, otherwise the cortex looks active when
  // Finn isn't actually doing anything. Only events whose own `timestamp` is
  // within LIVE_WINDOW_MS of "now" trigger a reaction. The eventCount /
  // lastEventAt meter follows the same rule so it stays honest.
  const LIVE_WINDOW_MS = 30_000;
  useEffect(() => {
    const es = new EventSource(getSSEUrl(agentId));
    es.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        // Reject backfill / historical replays
        const eventMs = data.timestamp ? new Date(data.timestamp).getTime() : 0;
        if (!eventMs || Date.now() - eventMs > LIVE_WINDOW_MS) return;
        const r = reactionFor(data);
        if (r) {
          reactionsRef.current.push(r);
          if (reactionsRef.current.length > 200) {
            reactionsRef.current = reactionsRef.current.slice(-100);
          }
          setEventCount(c => c + 1);
          const t = Date.now();
          setLastEventAt(t);
          lastEventAtRef.current = t;
        }
      } catch { /* skip */ }
    });
    return () => es.close();
  }, [agentId]);

  // Tick once per second so the "Xs ago" indicator updates smoothly
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Resize canvas to container
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current;
      const w = wrapRef.current;
      if (!c || !w) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.floor(w.clientWidth * dpr);
      c.height = Math.floor(w.clientHeight * dpr);
      c.style.width = w.clientWidth + 'px';
      c.style.height = w.clientHeight + 'px';
      const ctx = c.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Render loop
  useEffect(() => {
    let raf = 0;
    const STEP = 6; // grid resolution — smaller = prettier but slower

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = c.width / dpr;
      const h = c.height / dpr;
      const f = ++frameRef.current;
      const now = Date.now();

      // Background: dashboard surface-base warm-dark-brown
      ctx.fillStyle = '#1a1510';
      ctx.fillRect(0, 0, w, h);

      // Active reactions per module
      const moduleActivity: Record<string, { intensity: number; isError: boolean }> = {};
      reactionsRef.current = reactionsRef.current.filter(r => now - r.start < r.duration);
      for (const r of reactionsRef.current) {
        const elapsed = (now - r.start) / r.duration;
        const intensity = Math.max(0, 1 - elapsed);
        const cur = moduleActivity[r.module];
        const isError = r.kind === 'shatter';
        if (!cur || cur.intensity < intensity) {
          moduleActivity[r.module] = { intensity, isError: isError || cur?.isError || false };
        }
      }

      // Per-module activity is the only thing that brightens cells. We
      // deliberately do NOT use global aliveness for cell brightness — that
      // caused every module's region to light up together (cron looked active
      // when only tools was firing). Background stays at a constant faint
      // baseline; only a module's *own* recent reactions raise its cells.
      const STATIC_BASELINE = 0.08; // very faint constant glow so cortex isn't pitch-black

      // Voronoi-cell tessellation
      for (let y = 0; y < h; y += STEP) {
        for (let x = 0; x < w; x += STEP) {
          const nx = x / w;
          const ny = y / h;

          // Find nearest two modules (anisotropy 1.5 matches the terminal layout)
          let d1 = Infinity, d2 = Infinity, i1 = 0, i2 = 0;
          for (let i = 0; i < MODULES.length; i++) {
            const m = MODULES[i];
            const ddx = (nx - m.x) * 1.5;
            const ddy = ny - m.y;
            const d = ddx * ddx + ddy * ddy;
            if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; }
            else if (d < d2) { d2 = d; i2 = i; }
          }
          const edgeDist = Math.sqrt(d2) - Math.sqrt(d1);

          const owning = MODULES[i1].name;
          const neighbour = MODULES[i2].name;
          const act = moduleActivity[owning];
          const activity = act?.intensity || 0;
          const isError = act?.isError || false;
          // Border between two modules — glows if EITHER side is reacting,
          // since a border belongs to both.
          const neighAct = moduleActivity[neighbour];
          const borderActivity = Math.max(activity, neighAct?.intensity || 0);
          const borderError = isError || (neighAct?.isError ?? false);

          if (edgeDist < 0.025) {
            // Border cell — flickers in proportion to the modules it separates
            const cellLife = STATIC_BASELINE + borderActivity * 0.92;
            const pulse = cellLife * Math.abs(Math.sin(f * 0.08 + i1 * 0.7));
            const phase = (f * 0.005 + (i1 + i2) * 0.17) % 1;
            const alpha = 0.20 + 0.55 * cellLife;
            ctx.fillStyle = hueColor(0.3 * cellLife + 0.55 * pulse, phase, alpha, borderError);
            ctx.fillRect(x, y, STEP, STEP);
          } else {
            // Interior cell — only ripples when its own module is reacting
            const cellLife = STATIC_BASELINE + activity * 0.92;
            const dCenter = Math.sqrt(d1);
            const rippleSpeed = 0.05 * (0.2 + 0.8 * cellLife);
            const ripple = ((Math.sin(dCenter * 18 - f * rippleSpeed) + 1) / 2) * cellLife;
            const visible = ripple > 0.18 || activity > 0.05;
            if (visible) {
              const v = Math.max(ripple * 0.75, activity);
              const phase = (f * 0.004 + i1 * 0.16 + dCenter * 0.1) % 1;
              ctx.fillStyle = hueColor(v, phase, 0.15 * cellLife + 0.55 * Math.max(ripple - 0.18, activity), isError);
              ctx.fillRect(x, y, STEP, STEP);
            }
          }
        }
      }

      // Module icons + labels at center positions
      ctx.font = 'bold 13px ui-monospace, "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < MODULES.length; i++) {
        const m = MODULES[i];
        const px = m.x * w;
        const py = m.y * h;
        const act = moduleActivity[m.name];
        const activity = act?.intensity || 0;
        const isError = act?.isError || false;

        // Activity ring expands outward as the reaction fades. Capped well
        // inside the module's Voronoi cell so it doesn't visually invade
        // adjacent modules and create the impression they're firing too.
        // Normal: signal-primary orange #e07832 / Error: signal-alert red #ef4444
        if (activity > 0) {
          ctx.beginPath();
          const ringRadius = 10 + (1 - activity) * 28;
          ctx.arc(px, py, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = isError
            ? `rgba(239, 68, 68, ${activity})`
            : `rgba(224, 120, 50, ${activity})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        const label = m.icon + ' ' + m.name;
        // Drop shadow against the warm background
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillText(label, px + 1, py + 1);
        // Labels: bright cream when this module is actively reacting, otherwise
        // a static dim warm tan. No time-driven pulse — that gave the false
        // impression of constant activity.
        ctx.fillStyle = activity > 0.4
          ? (isError ? '#fca5a5' : '#faf3e8')
          : 'rgba(176, 160, 138, 0.55)';
        ctx.fillText(label, px, py);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const ageSec = lastEventAt ? Math.floor((Date.now() - lastEventAt) / 1000) : null;
  const ageLabel = ageSec === null
    ? 'awaiting…'
    : ageSec < 2 ? 'just now'
    : ageSec < 60 ? `${ageSec}s ago`
    : ageSec < 3600 ? `${Math.floor(ageSec / 60)}m ago`
    : `${Math.floor(ageSec / 3600)}h ago`;
  // Pulse the dot for ~1s after each event
  const livePulse = ageSec !== null && ageSec < 1;

  return (
    <div ref={wrapRef} style={{ height }} className="w-full relative overflow-hidden rounded">
      <canvas ref={canvasRef} className="block" />
      <div className="absolute top-1 left-2 text-[9px] font-mono pointer-events-none flex items-center gap-1.5">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${livePulse ? 'bg-signal-primary animate-ping' : 'bg-signal-primary/60'}`} />
        <span className="text-text-muted">{eventCount} events · last {ageLabel}</span>
      </div>
      <div className="absolute top-1 right-2 text-[9px] text-text-dim font-mono opacity-50 pointer-events-none">
        cellular-cortex
      </div>
    </div>
  );
}
