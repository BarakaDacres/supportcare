import { Moon, Sun, Sunset, Clock, User } from 'lucide-react';
import type { ShiftTemplate } from '@/hooks/useShiftTemplates';
import type { Client } from '@/hooks/useClients';

interface Props {
  templates: ShiftTemplate[];
  clients: Client[];
  onSelect: (template: ShiftTemplate) => void;
  onClose: () => void;
  onCreateNew: () => void;
}

function formatTime12(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  day: <Sun className="w-4 h-4" />,
  evening: <Sunset className="w-4 h-4" />,
  sleepover: <Moon className="w-4 h-4" />,
};

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  day: { bg: 'hsl(var(--primary)/0.1)', fg: 'hsl(var(--primary))' },
  evening: { bg: 'hsl(var(--evening-color, 30 90% 55%)/0.12)', fg: 'hsl(var(--evening-color, 30 90% 55%))' },
  sleepover: { bg: 'hsl(var(--sleepover-color, 270 60% 60%)/0.12)', fg: 'hsl(var(--sleepover-color, 270 60% 60%))' },
};

const TemplatePicker = ({ templates, clients, onSelect, onClose, onCreateNew }: Props) => {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center"
      style={{
        background: 'hsl(var(--foreground)/0.35)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
      onClick={onClose}
    >
      <div
        className="w-full animate-in slide-in-from-bottom-4 duration-300"
        style={{
          maxWidth: 480,
          maxHeight: '70dvh',
          background: 'hsl(var(--card))',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -4px 30px hsl(var(--foreground)/0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag indicator */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'hsl(var(--muted-foreground)/0.25)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '8px 20px 12px' }}>
          <h3 className="text-base font-bold text-foreground">Add from Template</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Tap a template to create a shift</p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ padding: '0 12px' }}>
          {templates.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Clock className="w-8 h-8 text-muted-foreground mb-3 opacity-40" />
              <p className="text-sm font-semibold text-foreground mb-1">No templates yet</p>
              <p className="text-xs text-muted-foreground mb-4">Create one in Settings → Prefs</p>
              <button
                type="button"
                onClick={onCreateNew}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-all active:scale-[0.97]"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
              >
                Create Template
              </button>
            </div>
          ) : (
            <div className="space-y-2 pb-2">
              {templates.map(t => {
                const client = clients.find(c => c.id === t.client_id);
                const colors = TYPE_COLORS[t.shift_type] ?? TYPE_COLORS.day;
                const icon = TYPE_ICONS[t.shift_type] ?? TYPE_ICONS.day;

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelect(t)}
                    className="w-full flex items-center gap-3 rounded-2xl border transition-all duration-150 active:scale-[0.97]"
                    style={{
                      padding: '12px 14px',
                      borderColor: 'hsl(var(--border))',
                      background: 'hsl(var(--muted)/0.25)',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: colors.bg, color: colors.fg }}
                    >
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-foreground truncate">{t.name}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[11px] text-muted-foreground">
                          {formatTime12(t.start_time.slice(0, 5))} – {formatTime12(t.end_time.slice(0, 5))}
                        </span>
                        {client && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                            style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                            {client.name}
                          </span>
                        )}
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md capitalize"
                          style={{ background: colors.bg, color: colors.fg }}>
                          {t.shift_type}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplatePicker;
