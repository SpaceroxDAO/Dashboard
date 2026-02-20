import { useAtom } from 'jotai';
import { DollarSign, Receipt, Calendar, Cpu, TrendingUp, CreditCard } from 'lucide-react';
import { billsAtom, financeSummaryAtom } from '@/store/atoms';

function fmt(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

export function FinanceWidget() {
  const [bills] = useAtom(billsAtom);
  const [summary] = useAtom(financeSummaryAtom);

  const hasBills = bills && bills.length > 0;
  const hasSummary = summary && (summary.weeklySpend > 0 || summary.subscriptionsBurn > 0 || summary.aiCostsWeek > 0);

  if (!hasBills && !hasSummary) {
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

  const now = new Date();
  const sortedBills = hasBills
    ? [...bills].sort((a, b) => {
        if (a.dueDate === 'Unknown' && b.dueDate === 'Unknown') return 0;
        if (a.dueDate === 'Unknown') return 1;
        if (b.dueDate === 'Unknown') return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      })
    : [];

  const upcomingBills = sortedBills.filter(b => {
    if (b.dueDate === 'Unknown' || b.dueDate === 'Recurring') return false;
    const due = new Date(b.dueDate);
    const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil >= 0 && daysUntil <= 7;
  });

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
        <DollarSign className="w-4 h-4 text-signal-primary" />
        Finance
        {hasSummary && summary.generated && (
          <span className="ml-auto text-[10px] text-text-dim telemetry-value">
            {new Date(summary.generated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </h2>

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
              <CreditCard className="w-2.5 h-2.5" />
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

      {/* Due soon banner */}
      {upcomingBills.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] font-medium text-signal-caution uppercase tracking-wider mb-1 flex items-center gap-1">
            <Calendar className="w-2.5 h-2.5" />
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

      {/* Bills list */}
      {sortedBills.length > 0 && (
        <div className="space-y-0.5">
          {sortedBills.slice(0, 8).map((bill, i) => (
            <div key={`bill-${i}`} className="flex items-center justify-between text-[11px] py-0.5">
              <div className="flex items-center gap-1.5">
                <Receipt className="w-2.5 h-2.5 text-text-dim" />
                <span className="text-text-muted">{bill.provider}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-text-bright telemetry-value">{bill.amount}</span>
                <span className="text-text-dim">{bill.dueDate !== 'Unknown' ? bill.dueDate : '\u2014'}</span>
              </div>
            </div>
          ))}
          {sortedBills.length > 8 && (
            <div className="text-[10px] text-text-dim text-center pt-0.5">+{sortedBills.length - 8} more</div>
          )}
        </div>
      )}
    </div>
  );
}
