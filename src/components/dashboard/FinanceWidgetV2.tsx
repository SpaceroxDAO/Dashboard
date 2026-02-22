import { useAtom } from 'jotai';
import { 
  DollarSign, Receipt, Calendar, Cpu, TrendingUp, TrendingDown, 
  CreditCard, AlertTriangle, PieChart, Clock
} from 'lucide-react';
import { billsAtom, financeSummaryAtom, financeExtendedAtom } from '@/store/atoms';

function fmt(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

function fmtFull(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function daysUntil(dateStr: string): number {
  const due = new Date(dateStr);
  const now = new Date();
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// Donut chart component for subscription breakdown
function SubscriptionDonut({ categories }: { categories: Record<string, number> }) {
  const total = Object.values(categories).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  
  const colors: Record<string, string> = {
    ai_tools: '#8B5CF6',    // purple
    food: '#F59E0B',        // amber
    phone: '#3B82F6',       // blue
    streaming: '#EC4899',   // pink
    cloud: '#10B981',       // emerald
    finance: '#6366F1',     // indigo
    other: '#6B7280',       // gray
  };
  
  let cumulative = 0;
  const segments = Object.entries(categories).map(([cat, amount]) => {
    const pct = (amount / total) * 100;
    const start = cumulative;
    cumulative += pct;
    return { cat, amount, pct, start, color: colors[cat] || colors.other };
  });

  // Create conic gradient
  const gradient = segments
    .map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`)
    .join(', ');

  return (
    <div className="flex items-center gap-3">
      <div 
        className="w-16 h-16 rounded-full relative"
        style={{ background: `conic-gradient(${gradient})` }}
      >
        <div className="absolute inset-2 bg-surface-elevated rounded-full flex items-center justify-center">
          <span className="text-[10px] font-bold text-text-bright">{fmt(total)}</span>
        </div>
      </div>
      <div className="flex-1 space-y-0.5">
        {segments.slice(0, 4).map(s => (
          <div key={s.cat} className="flex items-center gap-1.5 text-[10px]">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-text-muted capitalize">{s.cat.replace('_', ' ')}</span>
            <span className="text-text-dim ml-auto">{s.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Credit card payoff widget
function CreditCardWidget({ balance, minPayment, dueDate, creditScore }: {
  balance: number;
  minPayment: number;
  dueDate: string;
  creditScore: number;
}) {
  const days = daysUntil(dueDate);
  const urgency = days <= 3 ? 'text-signal-danger' : days <= 7 ? 'text-signal-caution' : 'text-text-muted';
  
  return (
    <div className="bg-surface-base/50 rounded-lg p-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <CreditCard className="w-3.5 h-3.5 text-signal-primary" />
        <span className="text-[11px] font-medium text-text-bright">Credit Card</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-[9px] text-text-dim">Balance</div>
          <div className="text-xs font-semibold text-signal-danger telemetry-value">
            {fmtFull(Math.abs(balance))}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-text-dim">Min Due</div>
          <div className="text-xs font-semibold text-text-bright telemetry-value">
            {fmtFull(minPayment)}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-text-dim">Due In</div>
          <div className={`text-xs font-semibold telemetry-value ${urgency}`}>
            {days}d
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[9px] text-text-dim">FICO Score</span>
        <span className="text-[11px] font-semibold text-signal-primary">{creditScore}</span>
      </div>
    </div>
  );
}

// Net worth trend mini-chart
function NetWorthTrend({ history }: { history: Array<{ date: string; netWorth: number }> }) {
  if (history.length < 2) return null;
  
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];
  const change = latest.netWorth - previous.netWorth;
  const pctChange = ((change / previous.netWorth) * 100).toFixed(1);
  const isUp = change >= 0;
  
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <div className="text-[9px] text-text-dim">Net Worth</div>
        <div className="text-sm font-bold text-text-bright telemetry-value">
          {fmtFull(latest.netWorth)}
        </div>
      </div>
      <div className={`flex items-center gap-0.5 ${isUp ? 'text-signal-success' : 'text-signal-danger'}`}>
        {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        <span className="text-[10px] font-medium">{isUp ? '+' : ''}{pctChange}%</span>
      </div>
    </div>
  );
}

// Spending alerts banner
function AlertsBanner({ alerts }: { alerts: Array<{ id: string; severity: string; title: string; monthlyImpact: number }> }) {
  const warnings = alerts.filter(a => a.severity === 'warning');
  if (warnings.length === 0) return null;
  
  return (
    <div className="bg-signal-caution/10 border border-signal-caution/20 rounded-lg p-2 mb-2">
      <div className="flex items-center gap-1.5 mb-1">
        <AlertTriangle className="w-3 h-3 text-signal-caution" />
        <span className="text-[10px] font-semibold text-signal-caution uppercase tracking-wider">
          {warnings.length} Alert{warnings.length > 1 ? 's' : ''}
        </span>
      </div>
      {warnings.map(alert => (
        <div key={alert.id} className="text-[11px] text-text-muted">
          {alert.title} <span className="text-signal-caution">(-{fmt(alert.monthlyImpact)}/mo)</span>
        </div>
      ))}
    </div>
  );
}

// AI costs breakdown
function AICostBreakdown({ byModel, weekTotal }: { byModel: Record<string, number>; weekTotal: number }) {
  const models = Object.entries(byModel).sort((a, b) => b[1] - a[1]);
  
  return (
    <div className="bg-surface-base/50 rounded-lg p-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-signal-primary" />
          <span className="text-[11px] font-medium text-text-bright">AI Costs</span>
        </div>
        <span className="text-xs font-semibold text-signal-primary telemetry-value">${weekTotal.toFixed(2)}/wk</span>
      </div>
      <div className="space-y-0.5">
        {models.slice(0, 3).map(([model, cost]) => (
          <div key={model} className="flex items-center justify-between text-[10px]">
            <span className="text-text-muted truncate max-w-[120px]">{model}</span>
            <span className="text-text-dim">${cost.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinanceWidgetV2() {
  const [bills] = useAtom(billsAtom);
  const [summary] = useAtom(financeSummaryAtom);
  const [extended] = useAtom(financeExtendedAtom);

  const hasSummary = summary && (summary.weeklySpend > 0 || summary.subscriptionsBurn > 0);
  const hasExtended = extended && (extended.netWorthHistory?.length > 0 || extended.alerts?.length > 0);

  if (!hasSummary && !hasExtended) {
    return (
      <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
        <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 text-signal-primary" />
          Finance
        </h2>
        <div className="text-center py-3">
          <p className="text-xs text-text-dim">No financial data yet</p>
        </div>
      </div>
    );
  }

  const upcomingBills = bills?.filter(b => {
    if (b.dueDate === 'Unknown' || b.dueDate === 'Recurring') return false;
    const days = daysUntil(b.dueDate);
    return days >= 0 && days <= 7;
  }).slice(0, 3) || [];

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
        <DollarSign className="w-4 h-4 text-signal-primary" />
        Finance
        {summary?.generated && (
          <span className="ml-auto text-[10px] text-text-dim telemetry-value">
            {new Date(summary.generated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </h2>

      {/* Alerts Banner */}
      {extended?.alerts && <AlertsBanner alerts={extended.alerts} />}

      {/* Net Worth Trend */}
      {extended?.netWorthHistory && extended.netWorthHistory.length > 0 && (
        <div className="mb-2 p-2 bg-surface-base/50 rounded-lg">
          <NetWorthTrend history={extended.netWorthHistory} />
        </div>
      )}

      {/* Summary metrics row */}
      {hasSummary && (
        <div className="grid grid-cols-4 gap-1.5 mb-2">
          <div className="bg-surface-base/50 rounded px-1.5 py-1 text-center">
            <div className="text-[10px] text-text-dim flex items-center justify-center gap-0.5">
              <TrendingUp className="w-2.5 h-2.5" />
              <span>Week</span>
            </div>
            <div className="text-xs font-semibold text-text-bright telemetry-value">{fmt(summary.weeklySpend)}</div>
          </div>
          <div className="bg-surface-base/50 rounded px-1.5 py-1 text-center">
            <div className="text-[10px] text-text-dim flex items-center justify-center gap-0.5">
              <Calendar className="w-2.5 h-2.5" />
              <span>Mo.</span>
            </div>
            <div className="text-xs font-semibold text-text-bright telemetry-value">{fmt(summary.monthlyProjection)}</div>
          </div>
          <div className="bg-surface-base/50 rounded px-1.5 py-1 text-center">
            <div className="text-[10px] text-text-dim flex items-center justify-center gap-0.5">
              <Receipt className="w-2.5 h-2.5" />
              <span>Subs</span>
            </div>
            <div className="text-xs font-semibold text-signal-caution telemetry-value">{fmt(summary.subscriptionsBurn)}</div>
          </div>
          <div className="bg-surface-base/50 rounded px-1.5 py-1 text-center">
            <div className="text-[10px] text-text-dim flex items-center justify-center gap-0.5">
              <Cpu className="w-2.5 h-2.5" />
              <span>AI</span>
            </div>
            <div className="text-xs font-semibold text-signal-primary telemetry-value">${summary.aiCostsWeek.toFixed(0)}</div>
          </div>
        </div>
      )}

      {/* Two-column layout for credit card and subscriptions */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        {/* Credit Card Widget */}
        {extended?.creditCard && (
          <CreditCardWidget 
            balance={extended.creditCard.balance}
            minPayment={extended.creditCard.minPayment}
            dueDate={extended.creditCard.dueDate}
            creditScore={extended.creditCard.creditScore}
          />
        )}

        {/* Subscription Donut */}
        {extended?.subscriptionsByCategory && (
          <div className="bg-surface-base/50 rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <PieChart className="w-3.5 h-3.5 text-signal-primary" />
              <span className="text-[11px] font-medium text-text-bright">Subscriptions</span>
            </div>
            <SubscriptionDonut categories={extended.subscriptionsByCategory} />
          </div>
        )}
      </div>

      {/* AI Cost Breakdown */}
      {extended?.aiCosts && (
        <div className="mb-2">
          <AICostBreakdown byModel={extended.aiCosts.byModel} weekTotal={extended.aiCosts.weekTotal} />
        </div>
      )}

      {/* Due soon banner */}
      {upcomingBills.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] font-medium text-signal-caution uppercase tracking-wider mb-1 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            Due Soon
          </div>
          <div className="space-y-0.5">
            {upcomingBills.map((bill, i) => (
              <div key={`upcoming-${i}`} className="flex items-center justify-between text-[11px] bg-signal-caution/5 rounded px-2 py-1 border border-signal-caution/10">
                <span className="text-text-bright">{bill.provider}</span>
                <div className="flex items-center gap-2">
                  <span className="text-signal-primary telemetry-value">{bill.amount}</span>
                  <span className="text-text-dim">{bill.dueDate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
