import { useEffect, useRef } from 'react';
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
  if (evt.type === 'tool_call') return { module: 'tools', kind: 'ripple', start: now, duration: 1800 };
  if (evt.type === 'tool_result') {
    if (evt.toolStatus === 'error') return { module: 'tools', kind: 'shatter', start: now, duration: 2000 };
    return { module: 'tools', kind: 'ripple', start: now, duration: 800 };
  }
  if (evt.type === 'compaction') return { module: 'memory', kind: 'pulse', start: now, duration: 2500 };
  if (evt.type === 'model_change') return { module: 'model', kind: 'pulse', start: now, duration: 2500 };
  return null;
}

// Cellular-cortex palette: base/accent/bright/soft are cyan/green/white/magenta.
// Returns a CSS color for hue-cycling pixels.
function hueColor(v: number, phase: number, alpha: number, isError = false): string {
  if (isError) {
    // palette_shift to red/yellow on error
    const hue = 10 + phase * 40;
    return `hsla(${hue}, 90%, ${30 + v * 50}%, ${alpha})`;
  }
  // Cyan (180) → green (140) → magenta (300) cycle
  const tiers = [180, 150, 0, 300]; // cyan / green / white-ish / magenta
  const s = (v + phase) % 1;
  let hue: number;
  let lightness = 30 + v * 40;
  let sat = 70;
  if (s > 0.72)      { hue = tiers[2]; lightness = 75; sat = 5; }   // bright/white
  else if (s > 0.48) { hue = tiers[1]; }                             // accent/green
  else if (s > 0.24) { hue = tiers[3]; sat = 60; }                  // soft/magenta
  else               { hue = tiers[0]; lightness = 25; }             // base/cyan dim
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

  // SSE: collect events as cortex reactions
  useEffect(() => {
    const es = new EventSource(getSSEUrl(agentId));
    es.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        const r = reactionFor(data);
        if (r) {
          reactionsRef.current.push(r);
          // Cap reactions list so it doesn't grow unbounded
          if (reactionsRef.current.length > 200) {
            reactionsRef.current = reactionsRef.current.slice(-100);
          }
        }
      } catch { /* skip */ }
    });
    return () => es.close();
  }, [agentId]);

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

      // Clear with deep-cyan background (cellular-cortex base)
      ctx.fillStyle = '#02060a';
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
          const act = moduleActivity[owning];
          const activity = act?.intensity || 0;
          const isError = act?.isError || false;

          if (edgeDist < 0.025) {
            // Border cell — pulses with frame + cell-pair index
            const pulse = Math.abs(Math.sin(f * 0.08 + i1 * 0.7));
            const phase = (f * 0.005 + (i1 + i2) * 0.17) % 1;
            ctx.fillStyle = hueColor(0.5 + 0.5 * pulse, phase, 0.55 + 0.45 * activity, isError);
            ctx.fillRect(x, y, STEP, STEP);
          } else {
            const dCenter = Math.sqrt(d1);
            const ripple = (Math.sin(dCenter * 18 - f * 0.05) + 1) / 2;
            const visible = ripple > 0.25 || activity > 0.1;
            if (visible) {
              const v = Math.max(ripple * 0.7, activity);
              const phase = (f * 0.004 + i1 * 0.16 + dCenter * 0.1) % 1;
              ctx.fillStyle = hueColor(v, phase, 0.25 + 0.65 * Math.max(ripple - 0.25, activity), isError);
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
        const pulse = 0.4 + 0.6 * Math.abs(Math.sin(f * 0.06 + i * 0.7));
        const act = moduleActivity[m.name];
        const activity = act?.intensity || 0;
        const isError = act?.isError || false;

        // Activity ring expands outward as the reaction fades
        if (activity > 0) {
          ctx.beginPath();
          const ringRadius = 14 + (1 - activity) * 60;
          ctx.arc(px, py, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = isError
            ? `rgba(255, 80, 80, ${activity})`
            : `rgba(120, 255, 220, ${activity})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        const label = m.icon + ' ' + m.name;
        // Subtle drop-shadow so labels read against the cell color
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillText(label, px + 1, py + 1);
        ctx.fillStyle = activity > 0.4
          ? (isError ? '#ffb0b0' : '#ffffff')
          : `rgba(220, 240, 255, ${0.6 + 0.4 * pulse})`;
        ctx.fillText(label, px, py);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={wrapRef} style={{ height }} className="w-full relative overflow-hidden rounded">
      <canvas ref={canvasRef} className="block" />
      <div className="absolute top-1 right-2 text-[9px] text-text-dim font-mono opacity-50 pointer-events-none">
        cellular-cortex
      </div>
    </div>
  );
}
