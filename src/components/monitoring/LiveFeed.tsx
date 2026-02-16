import { useState, useEffect, useRef, useCallback } from 'react';
import { useAtom } from 'jotai';
import {
  Radio, User, Bot, Pause, Play, Wrench, Check, X,
  Brain, ArrowDownUp, Minimize2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Badge, Button } from '@/components/ui';
import { getSSEUrl } from '@/services/api';
import { activeAgentIdAtom } from '@/store/atoms';

// ─── Types ───

type FeedEventType = 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'compaction' | 'model_change';
type ChannelType = 'discord' | 'telegram' | 'cron' | 'system' | 'chat';

interface FeedMessage {
  id: string;
  type: FeedEventType;
  timestamp: string;
  sessionId?: string;
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
  toolStatus?: 'completed' | 'error';
  toolDuration?: number;
  toolError?: string;
  tokensBefore?: number;
  provider?: string;
  modelId?: string;
}

const MAX_MESSAGES = 100;

// ─── Sub-components ───

function CostTag({ cost }: { cost?: number }) {
  if (!cost || cost < 0.001) return null;
  return (
    <span className="text-[10px] text-amber-400/80 flex-shrink-0 font-medium">
      ${cost < 0.01 ? cost.toFixed(3) : cost.toFixed(2)}
    </span>
  );
}

function FeedRow({ msg, formatTime }: { msg: FeedMessage; formatTime: (ts: string) => string }) {
  switch (msg.type) {
    case 'user':
      return (
        <div className="flex items-start gap-2 py-0.5 px-1 rounded hover:bg-surface-hover/50">
          <span className="text-text-dim flex-shrink-0 w-16">{formatTime(msg.timestamp)}</span>
          <User className="w-3 h-3 text-signal-secondary flex-shrink-0 mt-0.5" />
          {msg.sender && <span className="text-signal-secondary font-medium flex-shrink-0">{msg.sender}:</span>}
          <span className="text-text-bright flex-1 min-w-0 truncate">{msg.text || `[${msg.type}]`}</span>
        </div>
      );

    case 'assistant':
      return (
        <div className="flex items-start gap-2 py-0.5 px-1 rounded hover:bg-surface-hover/50">
          <span className="text-text-dim flex-shrink-0 w-16">{formatTime(msg.timestamp)}</span>
          <Bot className="w-3 h-3 text-signal-primary flex-shrink-0 mt-0.5" />
          {msg.hasThinking && <Brain className="w-3 h-3 text-violet-400 flex-shrink-0 mt-0.5" />}
          <span className="text-text-bright flex-1 min-w-0 truncate">{msg.text || (msg.usage ? `[${msg.usage.outputTokens} tokens]` : `[${msg.type}]`)}</span>
          <CostTag cost={msg.cost} />
        </div>
      );

    case 'tool_call':
      return (
        <div className="flex items-start gap-2 py-0.5 px-1 rounded hover:bg-surface-hover/50 opacity-60">
          <span className="text-text-dim flex-shrink-0 w-16">{formatTime(msg.timestamp)}</span>
          <Wrench className="w-3 h-3 text-orange-400 flex-shrink-0 mt-0.5" />
          <span className="text-orange-300 font-medium flex-shrink-0">{msg.toolName}</span>
          {msg.toolArgs && <span className="text-text-dim flex-1 min-w-0 truncate">{msg.toolArgs}</span>}
        </div>
      );

    case 'tool_result':
      return (
        <div className="flex items-start gap-2 py-0.5 px-1 rounded hover:bg-surface-hover/50 opacity-60">
          <span className="text-text-dim flex-shrink-0 w-16">{formatTime(msg.timestamp)}</span>
          {msg.toolStatus === 'error'
            ? <X className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
            : <Check className="w-3 h-3 text-green-400 flex-shrink-0 mt-0.5" />
          }
          <span className={`font-medium flex-shrink-0 ${msg.toolStatus === 'error' ? 'text-red-300' : 'text-green-300'}`}>
            {msg.toolName}
          </span>
          {msg.toolDuration !== undefined && (
            <span className="text-text-dim flex-shrink-0">{msg.toolDuration}ms</span>
          )}
          {msg.toolError && <span className="text-red-400 flex-1 min-w-0 truncate">{msg.toolError}</span>}
        </div>
      );

    case 'compaction':
      return (
        <div className="flex items-start gap-2 py-0.5 px-1 rounded hover:bg-surface-hover/50 opacity-75">
          <span className="text-text-dim flex-shrink-0 w-16">{formatTime(msg.timestamp)}</span>
          <Minimize2 className="w-3 h-3 text-cyan-400 flex-shrink-0 mt-0.5" />
          <span className="text-cyan-300 italic">
            Context compacted{msg.tokensBefore ? `: ${(msg.tokensBefore / 1000).toFixed(0)}K tokens` : ''}
          </span>
        </div>
      );

    case 'model_change':
      return (
        <div className="flex items-start gap-2 py-0.5 px-1 rounded hover:bg-surface-hover/50 opacity-75">
          <span className="text-text-dim flex-shrink-0 w-16">{formatTime(msg.timestamp)}</span>
          <ArrowDownUp className="w-3 h-3 text-purple-400 flex-shrink-0 mt-0.5" />
          <span className="text-purple-300">Model: {msg.modelId}</span>
        </div>
      );

    default:
      return null;
  }
}

// ─── Main component ───

export function LiveFeed() {
  const [agentId] = useAtom(activeAgentIdAtom);
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [showTools, setShowTools] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const connect = useCallback((agent: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnected(false);
    setUnavailable(false);
    setMessages([]);

    const es = new EventSource(getSSEUrl(agent));
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      setConnected(true);
    });

    es.addEventListener('unavailable', () => {
      setUnavailable(true);
    });

    es.addEventListener('message', (event) => {
      if (pausedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        const msg: FeedMessage = {
          id: `${data.timestamp}-${Math.random().toString(36).slice(2, 6)}`,
          type: data.type,
          timestamp: data.timestamp,
          text: data.text,
          model: data.model,
          sessionId: data.sessionId,
          usage: data.usage,
          cost: data.cost,
          stopReason: data.stopReason,
          hasThinking: data.hasThinking,
          channel: data.channel,
          channelName: data.channelName,
          sender: data.sender,
          toolName: data.toolName,
          toolArgs: data.toolArgs,
          toolStatus: data.toolStatus,
          toolDuration: data.toolDuration,
          toolError: data.toolError,
          tokensBefore: data.tokensBefore,
          provider: data.provider,
          modelId: data.modelId,
        };
        setMessages(prev => {
          const updated = [...prev, msg];
          return updated.slice(-MAX_MESSAGES);
        });
      } catch { /* skip */ }
    });

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Reconnect after 5 seconds
      setTimeout(() => connect(agent), 5000);
    };
  }, []);

  // Reconnect when agent changes
  useEffect(() => {
    connect(agentId);
    return () => {
      eventSourceRef.current?.close();
    };
  }, [agentId, connect]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, paused]);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  const displayMessages = showTools
    ? messages
    : messages.filter(m => m.type !== 'tool_call' && m.type !== 'tool_result');

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text-muted flex items-center gap-2">
          <Radio className="w-4 h-4" /> Live Feed
          {connected && !unavailable && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal-online opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-signal-online"></span>
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant={unavailable ? 'default' : connected ? 'success' : 'error'}>
            {unavailable ? 'Unavailable' : connected ? 'Connected' : 'Disconnected'}
          </Badge>
          {!unavailable && (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={<Wrench className={`w-3.5 h-3.5 ${showTools ? 'text-orange-400' : 'text-text-dim'}`} />}
                onClick={() => setShowTools(!showTools)}
              />
              <Button
                variant="ghost"
                size="sm"
                icon={paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                onClick={() => setPaused(!paused)}
              />
            </>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="h-48 overflow-y-auto space-y-0.5 font-mono text-xs scrollbar-thin"
      >
        {unavailable ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim text-sm">
            <Radio className="w-6 h-6 mb-2 opacity-30" />
            <p>Kira uses Kimi API</p>
            <p className="text-xs mt-1">No live session feed available</p>
          </div>
        ) : displayMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-dim text-sm">
            Waiting for activity...
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {displayMessages.map(msg => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <FeedRow msg={msg} formatTime={formatTime} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </Card>
  );
}
