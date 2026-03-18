import { useState, useEffect } from 'react';
import { ChevronRight, Sun, Moon, Monitor, Bell, FileText, Smartphone, Check } from 'lucide-react';
import type { UserSettings } from '@/hooks/useUserSettings';

/* ─────────────────────────────────────────────────────────────────
   All sub-components defined at MODULE LEVEL to prevent focus loss
───────────────────────────────────────────────────────────────── */

interface SectionHeaderProps { label: string }
const SectionHeader = ({ label }: SectionHeaderProps) => (
  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1 mb-1.5 mt-1">
    {label}
  </p>
);

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
      boxShadow: checked
        ? '0 0 0 0 transparent, inset 0 0 0 0 transparent'
        : 'inset 0 0 0 1px hsl(var(--border))',
    }}
  >
    <span
      className="absolute top-[3px] rounded-full bg-white shadow-md transition-all duration-300"
      style={{
        width: 25,
        height: 25,
        left: checked ? 23 : 3,
        boxShadow: '0 2px 6px hsl(0 0% 0% / 0.18)',
      }}
    />
  </button>
);

interface SettingsRowProps {
  icon?: React.ReactNode;
  iconBg?: string;
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  isLast?: boolean;
  danger?: boolean;
}
const SettingsRow = ({ icon, iconBg, label, sublabel, right, onClick, isLast, danger }: SettingsRowProps) => (
  <div>
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="w-full flex items-center gap-3 px-4 py-0 transition-colors duration-150 disabled:cursor-default"
      style={{ minHeight: 50 }}
    >
      {icon && (
        <div
          className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0"
          style={{ background: iconBg ?? 'hsl(var(--muted))' }}
        >
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0 text-left">
        <p className={`text-[15px] leading-tight ${danger ? '' : 'text-foreground'}`}
          style={danger ? { color: 'hsl(var(--destructive))' } : {}}>
          {label}
        </p>
        {sublabel && <p className="text-[12px] text-muted-foreground mt-0.5 leading-tight">{sublabel}</p>}
      </div>
      {right && <div className="shrink-0 flex items-center gap-1.5">{right}</div>}
    </button>
    {!isLast && (
      <div className="ml-[60px] mr-0">
        <div className="h-px" style={{ background: 'hsl(var(--divider))' }} />
      </div>
    )}
  </div>
);

interface ValueBadgeProps { label: string }
const ValueBadge = ({ label }: ValueBadgeProps) => (
  <span className="text-[15px] text-muted-foreground">{label}</span>
);

/* ── Theme picker sheet ── */
type ThemeOption = 'system' | 'light' | 'dark';

interface ThemePickerProps {
  current: ThemeOption;
  onChange: (v: ThemeOption) => void;
  onClose: () => void;
}
const ThemePicker = ({ current, onChange, onClose }: ThemePickerProps) => {
  const options: { value: ThemeOption; label: string; icon: React.ReactNode }[] = [
    { value: 'system', label: 'System', icon: <Monitor className="w-4 h-4" /> },
    { value: 'light', label: 'Light', icon: <Sun className="w-4 h-4" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="w-4 h-4" /> },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ background: 'hsl(var(--foreground) / 0.25)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-2xl overflow-hidden mb-6 sm:mb-0"
        style={{
          background: 'hsl(var(--card))',
          boxShadow: 'var(--card-shadow-lg)',
          border: '1px solid hsl(var(--border))',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 pt-5 pb-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest text-center">Appearance</p>
          <p className="text-[13px] text-muted-foreground text-center mt-1">Choose how the app looks</p>
        </div>
        <div className="border-t" style={{ borderColor: 'hsl(var(--divider))' }}>
          {options.map((opt, i) => (
            <div key={opt.value}>
              <button
                type="button"
                onClick={() => { onChange(opt.value); onClose(); }}
                className="w-full flex items-center gap-3 px-4 transition-colors duration-150"
                style={{ minHeight: 52 }}
              >
                <span className="text-muted-foreground">{opt.icon}</span>
                <span className="flex-1 text-left text-[15px] text-foreground">{opt.label}</span>
                {current === opt.value && <Check className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />}
              </button>
              {i < options.length - 1 && (
                <div className="ml-10 h-px" style={{ background: 'hsl(var(--divider))' }} />
              )}
            </div>
          ))}
        </div>
        <div className="border-t p-3" style={{ borderColor: 'hsl(var(--divider))' }}>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl text-[16px] font-semibold transition-colors duration-150"
            style={{
              minHeight: 50,
              background: 'hsl(var(--muted))',
              color: 'hsl(var(--foreground))',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Group card ── */
const SettingsGroup = ({ children }: { children: React.ReactNode }) => (
  <div
    className="rounded-2xl overflow-hidden"
    style={{
      background: 'hsl(var(--card))',
      boxShadow: 'var(--card-shadow-sm)',
      border: '1px solid hsl(var(--border))',
    }}
  >
    {children}
  </div>
);

/* ─────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────── */

interface PreferencesPanelProps {
  settings: UserSettings | null;
  onSave: (updates: Partial<Omit<UserSettings, 'id' | 'user_id'>>) => Promise<void>;
  themeOverride: 'system' | 'light' | 'dark';
  onThemeChange: (v: 'system' | 'light' | 'dark') => void;
}

const PreferencesPanel = ({ settings, onSave, themeOverride, onThemeChange }: PreferencesPanelProps) => {
  const [showThemePicker, setShowThemePicker] = useState(false);

  // Local preference state — persisted in localStorage
  const [shiftReminders, setShiftReminders] = useState(() =>
    localStorage.getItem('pref_shift_reminders') !== 'false'
  );
  const [invoiceReminders, setInvoiceReminders] = useState(() =>
    localStorage.getItem('pref_invoice_reminders') !== 'false'
  );
  const [haptics, setHaptics] = useState(() =>
    localStorage.getItem('pref_haptics') !== 'false'
  );
  const [autoTimezone, setAutoTimezone] = useState(() =>
    localStorage.getItem('pref_auto_timezone') !== 'false'
  );

  // Settings-backed preferences
  const useDefaultNotes = settings?.use_default_invoice_notes ?? true;

  const themeLabels: Record<string, string> = {
    system: 'System',
    light: 'Light',
    dark: 'Dark',
  };

  const handleToggle = (key: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    localStorage.setItem(key, String(value));
  };

  const handleUseDefaultNotes = async (v: boolean) => {
    await onSave({ use_default_invoice_notes: v });
  };

  return (
    <div className="space-y-7 pb-4">
      <h2 className="text-lg font-bold text-foreground px-1">Preferences</h2>

      {/* ── Appearance ── */}
      <div className="space-y-1.5">
        <SectionHeader label="Appearance" />
        <SettingsGroup>
          <SettingsRow
            icon={<Sun className="w-4 h-4 text-white" />}
            iconBg="hsl(38 90% 52%)"
            label="Theme"
            right={
              <div className="flex items-center gap-1">
                <ValueBadge label={themeLabels[themeOverride]} />
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            }
            onClick={() => setShowThemePicker(true)}
            isLast
          />
        </SettingsGroup>
      </div>

      {/* ── Notifications ── */}
      <div className="space-y-1.5">
        <SectionHeader label="Notifications" />
        <SettingsGroup>
          <SettingsRow
            icon={<Bell className="w-4 h-4 text-white" />}
            iconBg="hsl(var(--primary))"
            label="Shift Reminders"
            sublabel="Get notified before upcoming shifts"
            right={
              <IOSToggle
                checked={shiftReminders}
                onChange={v => handleToggle('pref_shift_reminders', v, setShiftReminders)}
              />
            }
          />
          <SettingsRow
            icon={<Bell className="w-4 h-4 text-white" />}
            iconBg="hsl(var(--purple-dark))"
            label="Invoice Reminders"
            sublabel="Alerts for overdue invoices"
            right={
              <IOSToggle
                checked={invoiceReminders}
                onChange={v => handleToggle('pref_invoice_reminders', v, setInvoiceReminders)}
              />
            }
            isLast
          />
        </SettingsGroup>
      </div>

      {/* ── Invoices ── */}
      <div className="space-y-1.5">
        <SectionHeader label="Invoices" />
        <SettingsGroup>
          <SettingsRow
            icon={<FileText className="w-4 h-4 text-white" />}
            iconBg="hsl(var(--money-green))"
            label="Default Invoice Notes"
            sublabel="Auto-apply saved notes to new invoices"
            right={
              <IOSToggle
                checked={useDefaultNotes}
                onChange={handleUseDefaultNotes}
                disabled={!settings}
              />
            }
          />
          <SettingsRow
            icon={<FileText className="w-4 h-4 text-white" />}
            iconBg="hsl(211 50% 60%)"
            label="Invoice Due Date"
            right={<ValueBadge label="7 days" />}
            isLast
          />
        </SettingsGroup>
        <p className="text-[11px] text-muted-foreground px-1 leading-relaxed">
          Default note template and due date are applied automatically when generating new invoices.
        </p>
      </div>

      {/* ── App ── */}
      <div className="space-y-1.5">
        <SectionHeader label="App" />
        <SettingsGroup>
          <SettingsRow
            icon={<Smartphone className="w-4 h-4 text-white" />}
            iconBg="hsl(248 58% 68%)"
            label="Haptics"
            sublabel="Tactile feedback on interactions"
            right={
              <IOSToggle
                checked={haptics}
                onChange={v => handleToggle('pref_haptics', v, setHaptics)}
              />
            }
          />
          <SettingsRow
            icon={<Monitor className="w-4 h-4 text-white" />}
            iconBg="hsl(var(--muted-foreground) / 0.6)"
            label="Automatic Time Zone"
            sublabel="Detect time zone from device"
            right={
              <IOSToggle
                checked={autoTimezone}
                onChange={v => handleToggle('pref_auto_timezone', v, setAutoTimezone)}
              />
            }
            isLast
          />
        </SettingsGroup>
      </div>

      {/* Theme picker modal */}
      {showThemePicker && (
        <ThemePicker
          current={themeOverride}
          onChange={onThemeChange}
          onClose={() => setShowThemePicker(false)}
        />
      )}
    </div>
  );
};

export default PreferencesPanel;
