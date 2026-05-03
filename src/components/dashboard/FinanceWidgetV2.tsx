import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import {
  DollarSign, CreditCard,
  Landmark, PiggyBank, BarChart2, Loader2, RefreshCw
} from 'lucide-react';
import { activeAgentAtom } from '@/store/atoms';
import { API_BASE } from '@/services/api';

function fmt(n: number): string {
  const abs = Math.abs(n);
  const str = abs >= 1000
    ? `$${(abs / 1000).toFixed(1)}k`
    : `$${abs.toFixed(0)}`;
  return n < 0 ? `-${str}` : str;
}

function fmtFull(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

const ACCOUNT_ICON: Record<string, typeof DollarSign> = {
  savings: PiggyBank,
  checking: Landmark,
  creditCard: CreditCard,
  otherAsset: BarChart2,
};

interface YnabData {
  accounts: { id: string; name: string; balance: number; type: string }[];
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  transactions: { date: string; amount: number; payee: string; category: string; approved: boolean }[];
  categorySpend: { name: string; spent: number; budgeted: number; group: string }[];
  unapproved: number;
  asOf: string;
}

export function FinanceWidgetV2() {
  const [activeAgent] = useAtom(activeAgentAtom);
  const agentId = activeAgent?.id || 'finn';
  const [data, setData] = useState<YnabData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (bustCache = false) => {
    try {
      const url = `${API_BASE}/api/agents/${agentId}/ynab${bustCache ? `?t=${Date.now()}` : ''}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setData(d);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    }
  };

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [agentId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="bg-surface-elevated rounded-xl p-3 panel-glow flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-text-dim" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
        <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 text-signal-primary" /> Finance
        </h2>
        <p className="text-xs text-signal-alert text-center py-3">{error || 'No data'}</p>
      </div>
    );
  }

  const assets = data.accounts.filter(a => a.balance >= 0);
  const liabilities = data.accounts.filter(a => a.balance < 0);
  const asOfDate = new Date(data.asOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-text-bright flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 text-signal-primary" />
          Finance
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-dim">YNAB · {asOfDate}</span>
          <button onClick={handleRefresh} disabled={refreshing} className="text-text-dim hover:text-text-bright transition-colors">
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Net worth */}
      <div className="mb-3 p-2.5 bg-surface-base/50 rounded-lg flex items-center justify-between">
        <div>
          <div className="text-[10px] text-text-dim mb-0.5">Net Worth</div>
          <div className="text-xl font-bold text-text-bright">{fmtFull(data.netWorth)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-text-dim mb-0.5">Assets / Liabilities</div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-signal-online">{fmt(data.totalAssets)}</span>
            <span className="text-text-dim text-[10px]">/</span>
            <span className="text-xs text-signal-alert">{fmt(data.totalLiabilities)}</span>
          </div>
        </div>
      </div>

      {/* Accounts */}
      <div className="space-y-1 mb-3">
        {assets.length > 0 && (
          <div className="text-[9px] text-text-dim uppercase tracking-wider mb-1">Assets</div>
        )}
        {assets.map(a => {
          const Icon = ACCOUNT_ICON[a.type] ?? DollarSign;
          return (
            <div key={a.id} className="flex items-center gap-2 py-0.5">
              <Icon className="w-3 h-3 text-signal-online flex-shrink-0" />
              <span className="text-[11px] text-text-muted flex-1 truncate">{a.name}</span>
              <span className="text-[11px] font-medium text-signal-online">{fmtFull(a.balance)}</span>
            </div>
          );
        })}

        {liabilities.length > 0 && (
          <div className="text-[9px] text-text-dim uppercase tracking-wider mt-2 mb-1">Liabilities</div>
        )}
        {liabilities.map(a => {
          const Icon = ACCOUNT_ICON[a.type] ?? CreditCard;
          return (
            <div key={a.id} className="flex items-center gap-2 py-0.5">
              <Icon className="w-3 h-3 text-signal-alert flex-shrink-0" />
              <span className="text-[11px] text-text-muted flex-1 truncate">{a.name}</span>
              <span className="text-[11px] font-medium text-signal-alert">{fmtFull(a.balance)}</span>
            </div>
          );
        })}
      </div>

      {/* Recent transactions */}
      {data.transactions.length > 0 && (
        <div>
          <div className="text-[9px] text-text-dim uppercase tracking-wider mb-1.5">Recent</div>
          <div className="space-y-0.5">
            {data.transactions.slice(0, 5).map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-2 py-0.5">
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] text-text-bright truncate block">{t.payee || t.category}</span>
                  <span className="text-[9px] text-text-dim">{t.date} · {t.category}</span>
                </div>
                <span className={`text-[11px] font-medium flex-shrink-0 ${t.amount < 0 ? 'text-signal-alert' : 'text-signal-online'}`}>
                  {t.amount < 0 ? '-' : '+'}{fmtFull(Math.abs(t.amount))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category spend */}
      {data.categorySpend.length > 0 && (
        <div className="mt-3">
          <div className="text-[9px] text-text-dim uppercase tracking-wider mb-1.5">This Month</div>
          <div className="space-y-0.5">
            {data.categorySpend.slice(0, 5).map((c, i) => {
              const pct = c.budgeted > 0 ? Math.min((c.spent / c.budgeted) * 100, 100) : 0;
              const over = c.budgeted > 0 && c.spent > c.budgeted;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-[10px] mb-0.5">
                    <span className="text-text-muted truncate">{c.name}</span>
                    <span className={over ? 'text-signal-alert' : 'text-text-dim'}>
                      {fmtFull(c.spent)}{c.budgeted > 0 ? ` / ${fmtFull(c.budgeted)}` : ''}
                    </span>
                  </div>
                  {c.budgeted > 0 && (
                    <div className="h-0.5 bg-surface-hover rounded-full overflow-hidden mb-1">
                      <div
                        className={`h-full rounded-full ${over ? 'bg-signal-alert' : 'bg-signal-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.unapproved > 0 && (
        <div className="mt-2 text-[10px] text-signal-caution text-center">
          {data.unapproved} unapproved transaction{data.unapproved > 1 ? 's' : ''} pending
        </div>
      )}
    </div>
  );
}
