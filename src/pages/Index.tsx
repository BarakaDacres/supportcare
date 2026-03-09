import { useIncomeStore } from '@/hooks/useIncomeStore';
import { getWeekRangesForMonth } from '@/lib/dateUtils';
import Header from '@/components/Header';
import StatsCards from '@/components/StatsCards';
import ControlsBar from '@/components/ControlsBar';
import EntryTable from '@/components/EntryTable';
import YearlyOverview from '@/components/YearlyOverview';
import { useEffect } from 'react';

const Index = () => {
  const store = useIncomeStore();
  const locked = store.isMonthLocked(store.year, store.month);
  const monthGross = store.getMonthGross(store.year, store.month);
  const yearGross = store.getYearGross(store.year);

  const weeks = getWeekRangesForMonth(store.year, store.month);
  const weeklyEntries = store.weeklyEntries[String(store.year)]?.[String(store.month)] || new Array(weeks.length).fill(0);
  const fortnightlyEntries = store.fortnightlyEntries[String(store.year)]?.[String(store.month)] || [];

  // Register SW
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 pb-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Header theme={store.theme} onToggleTheme={store.toggleTheme} />

        <div className="space-y-6">
          <StatsCards
            monthGross={monthGross}
            taxRate={store.taxRate}
            yearGross={yearGross}
            onTaxRateChange={(rate) => store.update({ taxRate: rate })}
            locked={locked}
          />

          <ControlsBar
            year={store.year}
            month={store.month}
            mode={store.mode}
            locked={locked}
            onYearChange={(y) => store.update({ year: y })}
            onMonthChange={(m) => store.update({ month: m })}
            onModeChange={(mode) => store.update({ mode })}
            onToggleLock={store.toggleMonthLock}
          />

          <EntryTable
            year={store.year}
            month={store.month}
            mode={store.mode}
            weeklyEntries={weeklyEntries}
            fortnightlyEntries={fortnightlyEntries}
            locked={locked}
            onWeeklyChange={store.setWeeklyValue}
            onFortnightlyChange={store.setFortnightlyValue}
          />

          <div className="print-break">
            <YearlyOverview
              year={store.year}
              activeMonth={store.month}
              getMonthGross={store.getMonthGross}
              isMonthLocked={store.isMonthLocked}
              onMonthClick={(m) => store.update({ month: m })}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
