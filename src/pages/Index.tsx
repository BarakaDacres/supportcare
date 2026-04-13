import { useState, useEffect, useCallback } from 'react';
import { useIncomeStore } from '@/hooks/useIncomeStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { useShifts } from '@/hooks/useShifts';
import { useClients } from '@/hooks/useClients';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useInvoices } from '@/hooks/useInvoices';
import { useShiftTemplates } from '@/hooks/useShiftTemplates';
import { scheduleShiftReminders, checkOverdueInvoices } from '@/lib/notifications';
import { getSmartNote } from '@/lib/smartNotes';
import { getEffectiveRates } from '@/lib/rateResolver';
import Header from '@/components/Header';
import MobileHeader from '@/components/MobileHeader';
import BottomTabBar, { type TabId } from '@/components/BottomTabBar';
import ShiftList from '@/components/ShiftList';
import AnalyticsPanel from '@/components/AnalyticsPanel';
import InvoicePanel from '@/components/InvoicePanel';
import ClientsPanel from '@/components/ClientsPanel';
import OverviewPanel from '@/components/OverviewPanel';
import PreferencesPanel from '@/components/PreferencesPanel';
import RatesPanel from '@/components/RatesPanel';
import AccountPanel from '@/components/AccountPanel';
import ShiftForm from '@/components/ShiftForm';
import TemplatePicker from '@/components/TemplatePicker';
import type { AuthState } from '@/hooks/useAuth';
import type { ShiftTemplate } from '@/hooks/useShiftTemplates';

interface IndexProps {
  auth: AuthState;
}

const Index = ({ auth }: IndexProps) => {
  const store = useIncomeStore();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [settingsSubTab, setSettingsSubTab] = useState<'preferences' | 'rates' | 'analytics' | 'account'>('preferences');
  const [sheetOpen, setSheetOpen] = useState(false);

  // Shift form from calendar
  const [calendarShiftDate, setCalendarShiftDate] = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState<string | null>(null); // date string

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

  const { shifts, loading: shiftsLoading, addShift: rawAddShift, updateShift: rawUpdateShift, deleteShift, duplicateShift } = useShifts(rates);
  const { invoices, loading: invoicesLoading, fetchInvoices, updateInvoiceStatus, deleteInvoice } = useInvoices();
  const { clients, loading: clientsLoading, addClient, updateClient, deleteClient, archiveClient, restoreClient } = useClients();
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useShiftTemplates();

  // Wrap addShift/updateShift to auto-resolve per-client rates
  const addShift = useCallback(async (shift: Parameters<typeof rawAddShift>[0]) => {
    const client = shift.client_id ? clients.find(c => c.id === shift.client_id) ?? null : null;
    const clientRates = getEffectiveRates(client, rates);
    return rawAddShift(shift, clientRates);
  }, [rawAddShift, clients, rates]);

  const updateShift = useCallback(async (id: string, shift: Parameters<typeof rawUpdateShift>[1]) => {
    const clientId = shift.client_id !== undefined ? shift.client_id : shifts.find(s => s.id === id)?.client_id;
    const client = clientId ? clients.find(c => c.id === clientId) ?? null : null;
    const clientRates = getEffectiveRates(client, rates);
    return rawUpdateShift(id, shift, clientRates);
  }, [rawUpdateShift, clients, rates, shifts]);

  const locked = store.isMonthLocked(store.year, store.month);

  const handleYearChange = (y: number) => store.update({ year: y });
  const handleMonthChange = (m: number) => store.update({ month: m });

  // Schedule shift reminders & check overdue invoices
  useEffect(() => {
    scheduleShiftReminders(shifts);
  }, [shifts]);

  useEffect(() => {
    if (invoices.length > 0) checkOverdueInvoices(invoices);
  }, [invoices]);

  // Handle adding shift from template
  const handleApplyTemplate = useCallback(async (template: ShiftTemplate) => {
    const date = showTemplatePicker;
    if (!date) return;
    const notes = template.notes || getSmartNote(template.shift_type, date);

    try {
      await addShift({
        date,
        start_time: template.start_time.slice(0, 5),
        end_time: template.end_time.slice(0, 5),
        is_sleepover: template.is_sleepover,
        client_id: template.client_id,
        notes,
      });
    } catch (e) {
      console.error('Failed to apply template:', e);
    } finally {
      // Always close the picker, even on error — prevents stuck state
      setShowTemplatePicker(null);
    }
  }, [showTemplatePicker, addShift]);

  const renderSettingsContent = () => (
    <div className="space-y-4">
      {/* Sub-tab toggle */}
      <div className="segmented-control w-full">
        {([
          { id: 'preferences', label: 'Prefs' },
          { id: 'rates', label: 'Rates' },
          { id: 'analytics', label: 'Analytics' },
          { id: 'account', label: 'Account' },
        ] as { id: typeof settingsSubTab; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setSettingsSubTab(t.id)}
            className={`flex-1 ${settingsSubTab === t.id ? 'segmented-button-active' : 'segmented-button'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {settingsSubTab === 'preferences' && (
        <PreferencesPanel
          settings={settings}
          onSave={updateSettings}
          themeOverride={store.themeOverride}
          onThemeChange={(v) => store.update({ themeOverride: v })}
          templates={templates}
          clients={clients}
          onAddTemplate={addTemplate}
          onUpdateTemplate={updateTemplate}
          onDeleteTemplate={deleteTemplate}
        />
      )}
      {settingsSubTab === 'rates' && (
        <RatesPanel settings={settings} loading={settingsLoading} onSave={updateSettings} />
      )}
      {settingsSubTab === 'analytics' && (
        <AnalyticsPanel
          shifts={shifts}
          settings={settings}
          selectedYear={store.year}
          selectedMonth={store.month}
        />
      )}
      {settingsSubTab === 'account' && auth && (
        <AccountPanel
          auth={auth}
          settings={settings}
          settingsLoading={settingsLoading}
          onSaveSettings={updateSettings}
        />
      )}
    </div>
  );

  const overviewPanel = (
    <OverviewPanel
      shifts={shifts}
      clients={clients}
      invoices={invoices}
      settings={settings}
      selectedYear={store.year}
      selectedMonth={store.month}
      onYearChange={handleYearChange}
      onMonthChange={handleMonthChange}
      locked={locked}
      displayName={auth.displayName}
      onAddShiftForDate={(date) => setCalendarShiftDate(date)}
      onDuplicateShift={(id) => duplicateShift(id)}
      onAddFromTemplate={(date) => setShowTemplatePicker(date)}
    />
  );

  /* ─── Mobile layout ─── */
  if (isMobile) {
    return (
      <div className="min-h-dvh bg-background overflow-x-hidden relative">
        {/* Status bar + header fade overlay */}
        <div
          className="fixed top-0 left-0 right-0 z-[35] pointer-events-none md:hidden"
          style={{
            height: 'calc(env(safe-area-inset-top, 0px) + 56px)',
            background: 'linear-gradient(to bottom, hsl(var(--background)) 0%, hsl(var(--background)/0.95) 50%, hsl(var(--background)/0.7) 75%, transparent 100%)',
          }}
        />
        <MobileHeader
          year={store.year}
          month={store.month}
          theme={store.theme}
          themeOverride={store.themeOverride}
          locked={locked}
          onToggleTheme={store.toggleTheme}
          onToggleLock={store.toggleMonthLock}
        />

        <main
          className="px-4 space-y-5 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
        >
          {activeTab === 'overview' && overviewPanel}

          {activeTab === 'shifts' && (
            <ShiftList
              shifts={shifts}
              clients={clients}
              loading={shiftsLoading}
              rates={rates}
              isMonthLocked={store.isMonthLocked}
              onAdd={addShift}
              onUpdate={updateShift}
              onDelete={deleteShift}
              onDuplicate={duplicateShift}
              onSheetOpenChange={setSheetOpen}
            />
          )}

          {activeTab === 'clients' && (
            <ClientsPanel
              clients={clients}
              shifts={shifts}
              loading={clientsLoading}
              onAdd={addClient}
              onUpdate={updateClient}
              onDelete={deleteClient}
              onArchive={archiveClient}
              onRestore={restoreClient}
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

          {activeTab === 'analytics' && (
            <AnalyticsPanel
              shifts={shifts}
              settings={settings}
              selectedYear={store.year}
              selectedMonth={store.month}
            />
          )}

          {activeTab === 'settings' && renderSettingsContent()}
        </main>

        <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} hidden={sheetOpen} auth={auth} />

        {/* Calendar Shift Form */}
        {calendarShiftDate && (
          <ShiftForm
            clients={clients}
            rates={rates}
            initialValues={{ date: calendarShiftDate }}
            onSubmit={async (shift) => {
              await addShift(shift);
              setCalendarShiftDate(null);
            }}
            onCancel={() => setCalendarShiftDate(null)}
            title="Add Shift"
          />
        )}

        {/* Template Picker */}
        {showTemplatePicker && (
          <TemplatePicker
            templates={templates}
            clients={clients}
            onSelect={handleApplyTemplate}
            onClose={() => setShowTemplatePicker(null)}
            onCreateNew={() => {
              setShowTemplatePicker(null);
              setActiveTab('settings');
              setSettingsSubTab('preferences');
            }}
          />
        )}
      </div>
    );
  }

  /* ─── Desktop layout ─── */
  return (
    <div className="min-h-screen bg-background px-4 pb-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Header theme={store.theme} themeOverride={store.themeOverride} onToggleTheme={store.toggleTheme} auth={auth} />

        <div className="segmented-control mb-6 no-print">
          {(
            [
          { id: 'overview', label: 'Home' },
          { id: 'shifts', label: 'Shifts' },
          { id: 'clients', label: 'Clients' },
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
          {activeTab === 'overview' && overviewPanel}

          {activeTab === 'shifts' && (
            <ShiftList
              shifts={shifts}
              clients={clients}
              loading={shiftsLoading}
              rates={rates}
              isMonthLocked={store.isMonthLocked}
              onAdd={addShift}
              onUpdate={updateShift}
              onDelete={deleteShift}
              onDuplicate={duplicateShift}
            />
          )}

          {activeTab === 'clients' && (
            <ClientsPanel
              clients={clients}
              shifts={shifts}
              loading={clientsLoading}
              onAdd={addClient}
              onUpdate={updateClient}
              onDelete={deleteClient}
              onArchive={archiveClient}
              onRestore={restoreClient}
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

          {activeTab === 'analytics' && (
            <AnalyticsPanel
              shifts={shifts}
              settings={settings}
              selectedYear={store.year}
              selectedMonth={store.month}
            />
          )}

          {activeTab === 'settings' && renderSettingsContent()}
        </div>
      </div>

      {/* Calendar Shift Form (Desktop) */}
      {calendarShiftDate && (
        <ShiftForm
          clients={clients}
          rates={rates}
          initialValues={{ date: calendarShiftDate }}
          onSubmit={async (shift) => {
            await addShift(shift);
            setCalendarShiftDate(null);
          }}
          onCancel={() => setCalendarShiftDate(null)}
          title="Add Shift"
        />
      )}

      {/* Template Picker (Desktop) */}
      {showTemplatePicker && (
        <TemplatePicker
          templates={templates}
          clients={clients}
          onSelect={handleApplyTemplate}
          onClose={() => setShowTemplatePicker(null)}
          onCreateNew={() => {
            setShowTemplatePicker(null);
            setActiveTab('settings');
            setSettingsSubTab('preferences');
          }}
        />
      )}
    </div>
  );
};

export default Index;
