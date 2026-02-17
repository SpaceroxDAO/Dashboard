import { useAtom } from 'jotai';
import { DollarSign, Receipt, Calendar } from 'lucide-react';
import { billsAtom } from '@/store/atoms';

export function FinanceWidget() {
  const [bills] = useAtom(billsAtom);

  if (!bills || bills.length === 0) {
    return (
      <div className="bg-surface-elevated rounded-xl p-4 lg:p-6 panel-glow">
        <h2 className="text-lg font-semibold text-text-bright mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-signal-primary" />
          Finance
        </h2>
        <div className="text-center py-6">
          <DollarSign className="w-8 h-8 text-text-dim/30 mx-auto mb-2" />
          <p className="text-sm text-text-dim">No financial data yet</p>
          <p className="text-xs text-text-muted mt-1">Bills and expenses will appear here when tracked</p>
        </div>
      </div>
    );
  }

  // Sort bills by due date (soonest first)
  const sortedBills = [...bills].sort((a, b) => {
    if (a.dueDate === 'Unknown' && b.dueDate === 'Unknown') return 0;
    if (a.dueDate === 'Unknown') return 1;
    if (b.dueDate === 'Unknown') return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  // Check for upcoming bills (within 7 days)
  const now = new Date();
  const upcomingBills = sortedBills.filter(b => {
    if (b.dueDate === 'Unknown') return false;
    const due = new Date(b.dueDate);
    const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil >= 0 && daysUntil <= 7;
  });

  return (
    <div className="bg-surface-elevated rounded-xl p-4 lg:p-6 panel-glow">
      <h2 className="text-lg font-semibold text-text-bright mb-4 flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-signal-primary" />
        Finance
        <span className="ml-auto text-xs text-text-dim telemetry-value">{bills.length} bills tracked</span>
      </h2>

      {/* Upcoming bills alert */}
      {upcomingBills.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-medium text-signal-caution uppercase tracking-wider mb-2 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Due Soon ({upcomingBills.length})
          </div>
          <div className="space-y-1.5">
            {upcomingBills.map((bill, i) => (
              <div key={`upcoming-${i}`} className="flex items-center justify-between text-xs bg-signal-caution/5 rounded-md px-2.5 py-1.5 border border-signal-caution/10">
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

      {/* All bills */}
      <div className="space-y-1.5">
        {sortedBills.slice(0, 8).map((bill, i) => (
          <div key={`bill-${i}`} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Receipt className="w-3 h-3 text-text-dim" />
              <span className="text-text-muted">{bill.provider}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-text-bright telemetry-value">{bill.amount}</span>
              <span className="text-text-dim">{bill.dueDate !== 'Unknown' ? bill.dueDate : '\u2014'}</span>
            </div>
          </div>
        ))}
        {sortedBills.length > 8 && (
          <div className="text-xs text-text-dim text-center pt-1">
            +{sortedBills.length - 8} more
          </div>
        )}
      </div>
    </div>
  );
}
