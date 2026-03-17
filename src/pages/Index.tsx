import { useState, useEffect } from 'react';
import { useIncomeStore } from '@/hooks/useIncomeStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { useShifts } from '@/hooks/useShifts';
import { useClients } from '@/hooks/useClients';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useInvoices } from '@/hooks/useInvoices';
import Header from '@/components/Header';
import MobileHeader from '@/components/MobileHeader';
import BottomTabBar, { type TabId } from '@/components/BottomTabBar';
import ShiftList from '@/components/ShiftList';
import AnalyticsPanel from '@/components/AnalyticsPanel';
import InvoicePanel from '@/components/InvoicePanel';
import AppSettingsPanel from '@/components/AppSettingsPanel';
import ClientsPanel from '@/components/ClientsPanel';
import OverviewPanel from '@/components/OverviewPanel';
import ProfileSettings from '@/components/ProfileSettings';
import type { AuthState } from '@/hooks/useAuth';

interface IndexProps {
  auth: AuthState;
}

const Index = ({ auth }: IndexProps) => {
  const store = useIncomeStore();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [settingsSubTab, setSettingsSubTab] = useState<'app' | 'clients' | 'account'>('app');
  const [sheetOpen, setSheetOpen] = useState(false);

  const { settings, loading: settingsLoading, updateSettings, incrementInvoiceCounter } = useUserSettings();
  const rates = settings
    ? {
        rate_weekday: settings.rate_weekday,
        rate_saturday: settings.rate_saturday,
        rate_sunday: settings.rate_sunday,
        rate_sleepover_weekday: settings.rate_sleepover_weekday,
        rate_sleepover_weekend: settings.rate_sleepover_weekend,
        rate_public_holiday: settings.rate_public_holiday,
      }
    : undefined;

  const { shifts, loading: shiftsLoading, addShift, updateShift, deleteShift, duplicateShift } = useShifts(rates);
  const { invoices, loading: invoicesLoading, fetchInvoices, updateInvoiceStatus, deleteInvoice } = useInvoices();
  const { clients, loading: clientsLoading, addClient, updateClient, deleteClient } = useClients();

  const locked = store.isMonthLocked(store.year, store.month);

  const handleYearChange = (y: number) => store.update({ year: y });
  const handleMonthChange = (m: number) => store.update({ month: m });

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  const renderSettingsContent = () => (
    <div className="space-y-4">
      {/* Sub-tab toggle */}
      <div className="segmented-control w-full">
        {(['app', 'clients', 'account'] as const).map(t => (
          <button
            key={t}
            onClick={() => setSettingsSubTab(t)}
            className={`flex-1 capitalize ${
              settingsSubTab === t ? 'segmented-button-active' : 'segmented-button'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {settingsSubTab === 'app' && (
        <AppSettingsPanel settings={settings} loading={settingsLoading} onSave={updateSettings} />
      )}
      {settingsSubTab === 'clients' && (
        <ClientsPanel
          clients={clients}
          shifts={shifts}
          loading={clientsLoading}
          onAdd={addClient}
          onUpdate={updateClient}
          onDelete={deleteClient}
        />
      )}
      {settingsSubTab === 'account' && auth && (
        <ProfileSettings auth={auth} settings={settings} onSaveSettings={updateSettings} />
      )}
    </div>
  );

  /* ─── Mobile layout ─── */
  if (isMobile) {
    return (
      <div className="min-h-dvh bg-background overflow-x-hidden">
        <MobileHeader
          year={store.year}
          month={store.month}
          mode={store.mode}
          theme={store.theme}
          locked={locked}
          onToggleTheme={store.toggleTheme}
          onToggleLock={store.toggleMonthLock}
        />

        <main
          className="px-4 space-y-5 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
        >
          {activeTab === 'overview' && (
            <OverviewPanel
              shifts={shifts}
              clients={clients}
              invoices={invoices}
              settings={settings}
              selectedYear={store.year}
              selectedMonth={store.month}
              onYearChange={handleYearChange}
              onMonthChange={handleMonthChange}
            />
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
            <AnalyticsPanel
              shifts={shifts}
              settings={settings}
              selectedYear={store.year}
              selectedMonth={store.month}
            />
          )}

          {activeTab === 'invoices' && (
            <InvoicePanel
              shifts={shifts}
              shiftsLoading={shiftsLoading}
              clients={clients}
              settings={settings}
              onIncrementCounter={incrementInvoiceCounter}
              invoices={invoices}
              invoicesLoading={invoicesLoading}
              onUpdateStatus={updateInvoiceStatus}
              onDeleteInvoice={deleteInvoice}
              onRefreshInvoices={fetchInvoices}
            />
          )}

          {activeTab === 'settings' && renderSettingsContent()}
        </main>

        <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} hidden={sheetOpen} auth={auth} />
      </div>
    );
  }

  /* ─── Desktop layout ─── */
  return (
    <div className="min-h-screen bg-background px-4 pb-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Header theme={store.theme} onToggleTheme={store.toggleTheme} auth={auth} />

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
            <OverviewPanel
              shifts={shifts}
              clients={clients}
              invoices={invoices}
              settings={settings}
              selectedYear={store.year}
              selectedMonth={store.month}
              onYearChange={handleYearChange}
              onMonthChange={handleMonthChange}
            />
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
            <AnalyticsPanel
              shifts={shifts}
              settings={settings}
              selectedYear={store.year}
              selectedMonth={store.month}
            />
          )}

          {activeTab === 'invoices' && (
            <InvoicePanel
              shifts={shifts}
              shiftsLoading={shiftsLoading}
              clients={clients}
              settings={settings}
              onIncrementCounter={incrementInvoiceCounter}
              invoices={invoices}
              invoicesLoading={invoicesLoading}
              onUpdateStatus={updateInvoiceStatus}
              onDeleteInvoice={deleteInvoice}
              onRefreshInvoices={fetchInvoices}
            />
          )}

          {activeTab === 'settings' && renderSettingsContent()}
        </div>
      </div>
    </div>
  );
};

export default Index;
