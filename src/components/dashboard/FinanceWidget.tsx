import { useAtom } from 'jotai';
import { DollarSign, Receipt, Calendar } from 'lucide-react';
import { billsAtom } from '@/store/atoms';

export function FinanceWidget() {
  const [bills] = useAtom(billsAtom);

  if (!bills || bills.length === 0) {
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

  const sortedBills = [...bills].sort((a, b) => {
    if (a.dueDate === 'Unknown' && b.dueDate === 'Unknown') return 0;
    if (a.dueDate === 'Unknown') return 1;
    if (b.dueDate === 'Unknown') return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const now = new Date();
  const upcomingBills = sortedBills.filter(b => {
    if (b.dueDate === 'Unknown') return false;
    const due = new Date(b.dueDate);
    const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil >= 0 && daysUntil <= 7;
  });

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
        <DollarSign className="w-4 h-4 text-signal-primary" />
        Finance
        <span className="ml-auto text-[10px] text-text-dim telemetry-value">{bills.length} bills</span>
      </h2>

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
    </div>
  );
}
