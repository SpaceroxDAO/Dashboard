import { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, User, Bot, Pause, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Badge, Button } from '@/components/ui';
import { getSSEUrl } from '@/services/api';

interface FeedMessage {
  id: string;
  type: 'user' | 'assistant';
  timestamp: string;
  text?: string;
  model?: string;
  sessionId?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

const MAX_MESSAGES = 50;

export function LiveFeed() {
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(getSSEUrl());
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      setConnected(true);
    });

    es.addEventListener('message', (event) => {
      if (paused) return;
      try {
        const data = JSON.parse(event.data);
        const msg: FeedMessage = {
          id: `${data.timestamp}-${Math.random().toString(36).slice(2, 6)}`,
          type: data.type,
          timestamp: data.timestamp,
          text: data.text,
          model: data.model,
          sessionId: data.sessionId?.slice(0, 8),
          usage: data.usage,
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
      setTimeout(connect, 5000);
    };
  }, [paused]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);

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

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text-muted flex items-center gap-2">
          <Radio className="w-4 h-4" /> Live Feed
          {connected && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal-online opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-signal-online"></span>
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant={connected ? 'success' : 'error'}>
            {connected ? 'Connected' : 'Disconnected'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            icon={paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            onClick={() => setPaused(!paused)}
          />
        </div>
      </div>

      <div
        ref={scrollRef}
        className="h-48 overflow-y-auto space-y-0.5 font-mono text-xs scrollbar-thin"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-dim text-sm">
            Waiting for activity...
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map(msg => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-2 py-0.5 px-1 rounded hover:bg-surface-hover/50"
              >
                <span className="text-text-dim flex-shrink-0 w-16">{formatTime(msg.timestamp)}</span>
                <span className="flex-shrink-0">
                  {msg.type === 'user' ? (
                    <User className="w-3 h-3 text-signal-secondary" />
                  ) : (
                    <Bot className="w-3 h-3 text-signal-primary" />
                  )}
                </span>
                <span className="text-text-bright flex-1 min-w-0 truncate">
                  {msg.text || (msg.usage ? `[${msg.usage.outputTokens} tokens]` : `[${msg.type}]`)}
                </span>
                {msg.sessionId && (
                  <span className="text-text-dim flex-shrink-0">{msg.sessionId}</span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </Card>
  );
}
