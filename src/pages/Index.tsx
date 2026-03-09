import { useState, useEffect } from 'react';
import { useIncomeStore } from '@/hooks/useIncomeStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { useShifts } from '@/hooks/useShifts';
import { useClients } from '@/hooks/useClients';
import { useUserSettings } from '@/hooks/useUserSettings';
import Header from '@/components/Header';
import MobileHeader from '@/components/MobileHeader';
import StatsCards from '@/components/StatsCards';
import ControlsBar from '@/components/ControlsBar';
import EntryTable from '@/components/EntryTable';
import YearlyOverview from '@/components/YearlyOverview';
import SettingsPanel from '@/components/SettingsPanel';
import BottomTabBar, { type TabId } from '@/components/BottomTabBar';
import ShiftList from '@/components/ShiftList';
import AnalyticsPanel from '@/components/AnalyticsPanel';
import InvoicePanel from '@/components/InvoicePanel';
import AppSettingsPanel from '@/components/AppSettingsPanel';
import ClientsPanel from '@/components/ClientsPanel';
import { getWeekRangesForMonth } from '@/lib/dateUtils';
import type { AuthState } from '@/hooks/useAuth';

interface IndexProps {
  auth: AuthState;
}

const Index = ({ auth }: IndexProps) => {
  const store = useIncomeStore();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [settingsSubTab, setSettingsSubTab] = useState<'app' | 'clients' | 'legacy'>('app');
  const [sheetOpen, setSheetOpen] = useState(false);

  const { settings, loading: settingsLoading, updateSettings, incrementInvoiceCounter } = useUserSettings();
  const rates = settings
    ? {
        rate_weekday: settings.rate_weekday,
        rate_saturday: settings.rate_saturday,
        rate_sunday: settings.rate_sunday,
        rate_sleepover_weekday: settings.rate_sleepover_weekday,
        rate_sleepover_weekend: settings.rate_sleepover_weekend,
      }
    : undefined;

  const { shifts, loading: shiftsLoading, addShift, updateShift, deleteShift, duplicateShift } = useShifts(rates);
  const { clients, loading: clientsLoading, addClient, updateClient, deleteClient } = useClients();

  const locked = store.isMonthLocked(store.year, store.month);
  const monthGross = store.getMonthGross(store.year, store.month);
  const yearGross = store.getYearGross(store.year);

  const weeks = getWeekRangesForMonth(store.year, store.month);
  const weeklyEntries =
    store.weeklyEntries[String(store.year)]?.[String(store.month)] ||
    new Array(weeks.length).fill(0);
  const fortnightlyEntries =
    store.fortnightlyEntries[String(store.year)]?.[String(store.month)] || [];

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  const renderSettingsContent = () => (
    <div className="space-y-4">
      {/* Sub-tab toggle */}
      <div className="segmented-control w-full">
        {(['app', 'clients', 'legacy'] as const).map(t => (
          <button
            key={t}
            onClick={() => setSettingsSubTab(t)}
            className={`flex-1 capitalize ${
              settingsSubTab === t ? 'segmented-button-active' : 'segmented-button'
            }`}
          >
            {t === 'legacy' ? 'Display' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {settingsSubTab === 'app' && (
        <AppSettingsPanel settings={settings} loading={settingsLoading} onSave={updateSettings} />
      )}
      {settingsSubTab === 'clients' && (
        <ClientsPanel
          clients={clients}
          loading={clientsLoading}
          onAdd={addClient}
          onUpdate={updateClient}
          onDelete={deleteClient}
        />
      )}
      {settingsSubTab === 'legacy' && (
        <SettingsPanel
          year={store.year}
          month={store.month}
          mode={store.mode}
          taxRate={store.taxRate}
          locked={locked}
          theme={store.theme}
          auth={auth}
          onYearChange={y => store.update({ year: y })}
          onMonthChange={m => store.update({ month: m })}
          onModeChange={mode => store.update({ mode })}
          onTaxRateChange={rate => store.update({ taxRate: rate })}
          onToggleLock={store.toggleMonthLock}
          onToggleTheme={store.toggleTheme}
        />
      )}
    </div>
  );

  /* ─── Mobile layout ─── */
  if (isMobile) {
    return (
      <div className="min-h-dvh bg-background">
        <MobileHeader
          year={store.year}
          month={store.month}
          mode={store.mode}
          theme={store.theme}
          locked={locked}
          onToggleTheme={store.toggleTheme}
          onToggleLock={store.toggleMonthLock}
        />

        {/*
          pb-[calc(env(safe-area-inset-bottom,0px)+72px)]
          = tab bar pill height (50px) + pill margin-bottom (8px) + extra breathing room (14px)
        */}
        <main
          className="px-4 space-y-5 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
        >
          {activeTab === 'overview' && (
            <>
              <StatsCards
                monthGross={monthGross}
                taxRate={store.taxRate}
                yearGross={yearGross}
                onTaxRateChange={rate => store.update({ taxRate: rate })}
                locked={locked}
              />
              <ControlsBar
                year={store.year}
                month={store.month}
                mode={store.mode}
                locked={locked}
                onYearChange={y => store.update({ year: y })}
                onMonthChange={m => store.update({ month: m })}
                onModeChange={mode => store.update({ mode })}
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
              <YearlyOverview
                year={store.year}
                activeMonth={store.month}
                getMonthGross={store.getMonthGross}
                isMonthLocked={store.isMonthLocked}
                onMonthClick={m => store.update({ month: m })}
              />
            </>
          )}

          {activeTab === 'shifts' && (
            <ShiftList
              shifts={shifts}
              clients={clients}
              loading={shiftsLoading}
              rates={rates}
              locked={locked}
              onAdd={addShift}
              onUpdate={updateShift}
              onDelete={deleteShift}
              onDuplicate={duplicateShift}
              onSheetOpenChange={setSheetOpen}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsPanel shifts={shifts} settings={settings} />
          )}

          {activeTab === 'invoices' && (
            <InvoicePanel
              shifts={shifts}
              settings={settings}
              onIncrementCounter={incrementInvoiceCounter}
            />
          )}

          {activeTab === 'settings' && renderSettingsContent()}
        </main>

        <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} hidden={sheetOpen} />
      </div>
    );
  }

  /* ─── Desktop layout ─── */
  return (
    <div className="min-h-screen bg-background px-4 pb-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Header theme={store.theme} onToggleTheme={store.toggleTheme} auth={auth} />

        {/* Desktop tab bar */}
        <div className="segmented-control mb-6 no-print">
          {(
            [
              { id: 'overview', label: 'Overview' },
              { id: 'shifts', label: 'Shifts' },
              { id: 'analytics', label: 'Analytics' },
              { id: 'invoices', label: 'Invoices' },
              { id: 'settings', label: 'Settings' },
            ] as { id: TabId; label: string }[]
          ).map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={activeTab === t.id ? 'segmented-button-active' : 'segmented-button'}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-6">
          {activeTab === 'overview' && (
            <>
              <StatsCards
                monthGross={monthGross}
                taxRate={store.taxRate}
                yearGross={yearGross}
                onTaxRateChange={rate => store.update({ taxRate: rate })}
                locked={locked}
              />
              <ControlsBar
                year={store.year}
                month={store.month}
                mode={store.mode}
                locked={locked}
                onYearChange={y => store.update({ year: y })}
                onMonthChange={m => store.update({ month: m })}
                onModeChange={mode => store.update({ mode })}
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
                  onMonthClick={m => store.update({ month: m })}
                />
              </div>
            </>
          )}

          {activeTab === 'shifts' && (
            <ShiftList
              shifts={shifts}
              clients={clients}
              loading={shiftsLoading}
              rates={rates}
              locked={locked}
              onAdd={addShift}
              onUpdate={updateShift}
              onDelete={deleteShift}
              onDuplicate={duplicateShift}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsPanel shifts={shifts} settings={settings} />
          )}

          {activeTab === 'invoices' && (
            <InvoicePanel
              shifts={shifts}
              settings={settings}
              onIncrementCounter={incrementInvoiceCounter}
            />
          )}

          {activeTab === 'settings' && renderSettingsContent()}
        </div>
      </div>
    </div>
  );
};

export default Index;
