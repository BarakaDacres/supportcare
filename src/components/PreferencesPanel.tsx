import { useState } from 'react';
import { Sun, Moon, Monitor, Bell, FileText, Smartphone, Check, ChevronRight, Clock } from 'lucide-react';
import type { UserSettings } from '@/hooks/useUserSettings';

/* ─────────────────────────────────────────────────────────────────
   All sub-components at MODULE LEVEL to prevent focus/re-mount loss
───────────────────────────────────────────────────────────────── */

interface IOSToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}
const IOSToggle = ({ checked, onChange, disabled }: IOSToggleProps) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(!checked)}
    aria-checked={checked}
    role="switch"
    className="relative shrink-0 transition-all duration-300 disabled:opacity-40"
    style={{
      width: 51,
      height: 31,
      borderRadius: 999,
      background: checked ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
      boxShadow: checked ? 'none' : 'inset 0 0 0 1px hsl(var(--border))',
    }}
  >
    <span
      className="absolute top-[3px] rounded-full bg-white shadow-md transition-all duration-300"
      style={{ width: 25, height: 25, left: checked ? 23 : 3, boxShadow: '0 2px 6px hsl(0 0% 0% / 0.18)' }}
    />
  </button>
);

interface SettingsRowProps {
  icon?: React.ReactNode;
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  isLast?: boolean;
}
const SettingsRow = ({ icon, label, sublabel, right, onClick, isLast }: SettingsRowProps) => (
  <div>
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="w-full flex items-center gap-3.5 px-4 transition-colors duration-150 disabled:cursor-default active:bg-accent/30"
      style={{ minHeight: 52 }}
    >
      {icon && (
        <span className="text-muted-foreground shrink-0 w-5 flex items-center justify-center">
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[15px] leading-tight text-foreground">{label}</p>
        {sublabel && <p className="text-[12px] text-muted-foreground mt-0.5 leading-tight">{sublabel}</p>}
      </div>
      {right && <div className="shrink-0 flex items-center gap-1">{right}</div>}
    </button>
    {!isLast && (
      <div className={icon ? 'ml-[56px]' : 'ml-4'}>
        <div className="h-px" style={{ background: 'hsl(var(--divider))' }} />
      </div>
    )}
  </div>
);

const SettingsGroup = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl overflow-hidden"
    style={{ background: 'hsl(var(--card))', boxShadow: 'var(--card-shadow-sm)', border: '1px solid hsl(var(--border))' }}>
    {children}
  </div>
);

const SectionLabel = ({ children }: { children: string }) => (
  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1 mb-1.5 mt-1">
    {children}
  </p>
);

/* ── Inline Segmented Appearance Picker ── */
type ThemeOption = 'system' | 'light' | 'dark';

const AppearanceCard = ({
  current, onChange,
}: { current: ThemeOption; onChange: (v: ThemeOption) => void }) => {
  const options: { value: ThemeOption; label: string; icon: React.ReactNode }[] = [
    { value: 'system', label: 'Auto', icon: <Monitor className="w-[15px] h-[15px]" /> },
    { value: 'light', label: 'Light', icon: <Sun className="w-[15px] h-[15px]" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="w-[15px] h-[15px]" /> },
  ];

  return (
    <SettingsGroup>
      <div className="px-4 py-4 space-y-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Appearance</p>
        {/* Segmented control */}
        <div
          className="flex rounded-xl p-1 gap-1"
          style={{ background: 'hsl(var(--muted))' }}
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-[9px] py-2 transition-all duration-200 text-[13px] font-semibold"
              style={{
                background: current === opt.value ? 'hsl(var(--card))' : 'transparent',
                color: current === opt.value ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                boxShadow: current === opt.value ? '0 1px 4px hsl(0 0% 0% / 0.12)' : 'none',
              }}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </SettingsGroup>
  );
};

/* ── Centered Due Date Modal ── */
const DUE_DATE_OPTIONS = [7, 14, 21, 30];

const DueDateModal = ({
  current, onChange, onClose,
}: { current: number; onChange: (v: number) => void; onClose: () => void }) => (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center px-4"
    style={{ background: 'hsl(var(--foreground)/0.35)', backdropFilter: 'blur(8px)' }}
    onClick={onClose}
  >
    <div
      className="w-full max-w-sm rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      style={{ background: 'hsl(var(--card))', boxShadow: 'var(--card-shadow-lg)', border: '1px solid hsl(var(--border))' }}
      onClick={e => e.stopPropagation()}
    >
      <div className="px-4 pt-5 pb-3 text-center border-b" style={{ borderColor: 'hsl(var(--divider))' }}>
        <p className="text-[15px] font-semibold text-foreground">Invoice Due Date</p>
        <p className="text-[13px] text-muted-foreground mt-0.5">Days after issue date payment is due</p>
      </div>
      <div>
        {DUE_DATE_OPTIONS.map((days, i) => (
          <div key={days}>
            <button
              type="button"
              onClick={() => { onChange(days); onClose(); }}
              className="w-full flex items-center gap-3 px-5 transition-colors duration-150 active:bg-accent/30"
              style={{ minHeight: 52 }}
            >
              <span className="flex-1 text-left text-[15px] text-foreground">{days} days</span>
              {current === days && (
                <Check className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
              )}
            </button>
            {i < DUE_DATE_OPTIONS.length - 1 && (
              <div className="ml-5 h-px" style={{ background: 'hsl(var(--divider))' }} />
            )}
          </div>
        ))}
      </div>
      <div className="p-3 border-t" style={{ borderColor: 'hsl(var(--divider))' }}>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl text-[16px] font-semibold transition-colors duration-150 active:bg-accent/30"
          style={{ minHeight: 50, background: 'hsl(var(--muted))', color: 'hsl(var(--foreground))' }}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
);

/* ── Main ── */
interface PreferencesPanelProps {
  settings: UserSettings | null;
  onSave: (updates: Partial<Omit<UserSettings, 'id' | 'user_id'>>) => Promise<void>;
  themeOverride: 'system' | 'light' | 'dark';
  onThemeChange: (v: 'system' | 'light' | 'dark') => void;
}

const PreferencesPanel = ({ settings, onSave, themeOverride, onThemeChange }: PreferencesPanelProps) => {
  const [showDueDateModal, setShowDueDateModal] = useState(false);

  const [shiftReminders, setShiftReminders]     = useState(() => localStorage.getItem('pref_shift_reminders')   !== 'false');
  const [invoiceReminders, setInvoiceReminders] = useState(() => localStorage.getItem('pref_invoice_reminders') !== 'false');
  const [haptics, setHaptics]                   = useState(() => localStorage.getItem('pref_haptics')           !== 'false');
  const [autoTimezone, setAutoTimezone]         = useState(() => localStorage.getItem('pref_auto_timezone')     !== 'false');

  const useDefaultNotes  = settings?.use_default_invoice_notes ?? true;
  const showTaxEstimate  = settings?.show_tax_estimate ?? false;
  const invoiceDueDays   = settings?.invoice_due_days ?? 7;

  const handleToggle = (key: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    localStorage.setItem(key, String(value));
  };

  return (
    <div className="space-y-6 pb-4">

      {/* ── Appearance — inline segmented control ── */}
      <div className="space-y-1.5">
        <SectionLabel>Appearance</SectionLabel>
        <AppearanceCard current={themeOverride} onChange={onThemeChange} />
      </div>

      {/* ── Notifications ── */}
      <div className="space-y-1.5">
        <SectionLabel>Notifications</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            icon={<Bell className="w-[18px] h-[18px]" />}
            label="Shift Reminders"
            sublabel="Get notified before upcoming shifts"
            right={<IOSToggle checked={shiftReminders} onChange={v => handleToggle('pref_shift_reminders', v, setShiftReminders)} />}
          />
          <SettingsRow
            icon={<Bell className="w-[18px] h-[18px]" />}
            label="Invoice Reminders"
            sublabel="Alerts for overdue invoices"
            right={<IOSToggle checked={invoiceReminders} onChange={v => handleToggle('pref_invoice_reminders', v, setInvoiceReminders)} />}
            isLast
          />
        </SettingsGroup>
        <p className="text-[11px] text-muted-foreground px-1 leading-relaxed">Notifications are local and do not send data externally.</p>
      </div>

      {/* ── Invoices ── */}
      <div className="space-y-1.5">
        <SectionLabel>Invoices</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            icon={<FileText className="w-[18px] h-[18px]" />}
            label="Default Invoice Notes"
            sublabel="Auto-apply saved notes to new invoices"
            right={
              <IOSToggle
                checked={useDefaultNotes}
                onChange={v => onSave({ use_default_invoice_notes: v })}
                disabled={!settings}
              />
            }
          />
          <SettingsRow
            icon={<FileText className="w-[18px] h-[18px]" />}
            label="Show Tax Estimate"
            sublabel="Display tax deduction in Analytics"
            right={
              <IOSToggle
                checked={showTaxEstimate}
                onChange={v => onSave({ show_tax_estimate: v })}
                disabled={!settings}
              />
            }
          />
          <SettingsRow
            icon={<Clock className="w-[18px] h-[18px]" />}
            label="Invoice Due Date"
            sublabel="Days after issue date payment is due"
            right={
              <div className="flex items-center gap-1">
                <span className="text-[15px] text-muted-foreground font-medium">{invoiceDueDays} days</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
              </div>
            }
            onClick={settings ? () => setShowDueDateModal(true) : undefined}
            isLast
          />
        </SettingsGroup>
        <p className="text-[11px] text-muted-foreground px-1 leading-relaxed">Due dates and notes are applied automatically on new invoices.</p>
      </div>

      {/* ── App ── */}
      <div className="space-y-1.5">
        <SectionLabel>App</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            icon={<Smartphone className="w-[18px] h-[18px]" />}
            label="Haptics"
            sublabel="Tactile feedback on interactions"
            right={<IOSToggle checked={haptics} onChange={v => handleToggle('pref_haptics', v, setHaptics)} />}
          />
          <SettingsRow
            icon={<Monitor className="w-[18px] h-[18px]" />}
            label="Automatic Time Zone"
            sublabel="Detect time zone from device"
            right={<IOSToggle checked={autoTimezone} onChange={v => handleToggle('pref_auto_timezone', v, setAutoTimezone)} />}
            isLast
          />
        </SettingsGroup>
      </div>

      {/* Due date modal — centered, always visible */}
      {showDueDateModal && (
        <DueDateModal
          current={invoiceDueDays}
          onChange={v => onSave({ invoice_due_days: v } as Partial<Omit<UserSettings, 'id' | 'user_id'>>)}
          onClose={() => setShowDueDateModal(false)}
        />
      )}
    </div>
  );
};

export default PreferencesPanel;
