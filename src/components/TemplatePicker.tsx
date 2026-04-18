import { useState, useCallback } from 'react';
import { Moon, Sun, Sunset, Clock, Plus } from 'lucide-react';
import type { ShiftTemplate } from '@/hooks/useShiftTemplates';
import type { Client } from '@/hooks/useClients';
import { isClientArchived } from '@/hooks/useClients';
import { BottomSheet } from '@/components/ui/bottom-sheet';

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
  day: { bg: 'hsl(var(--primary)/0.12)', fg: 'hsl(var(--primary))' },
  evening: { bg: 'hsl(var(--evening-color, 30 90% 55%)/0.14)', fg: 'hsl(var(--evening-color, 30 90% 55%))' },
  sleepover: { bg: 'hsl(var(--sleepover-color, 270 60% 60%)/0.14)', fg: 'hsl(var(--sleepover-color, 270 60% 60%))' },
};

const TemplatePicker = ({ templates, clients, onSelect, onClose, onCreateNew }: Props) => {
  const [selecting, setSelecting] = useState<string | null>(null);

  const availableTemplates = templates.filter(t => {
    if (!t.client_id) return true;
    const client = clients.find(c => c.id === t.client_id);
    if (!client) return false;
    return !isClientArchived(client);
  });

  const handleSelect = useCallback((t: ShiftTemplate) => {
    if (selecting) return;
    setSelecting(t.id);
    Promise.resolve().then(() => {
      onSelect(t);
      setTimeout(() => setSelecting(null), 100);
    });
  }, [selecting, onSelect]);

  return (
    <BottomSheet open onClose={onClose} labelledBy="tmpl-picker-title">
      <div className="lg-sheet-header">
        <div>
          <h3 id="tmpl-picker-title" className="lg-headline text-foreground">Add from Template</h3>
          <p className="lg-footnote mt-0.5">Tap a template to create a shift</p>
        </div>
        <button
          type="button"
          onClick={onCreateNew}
          className="lg-icon-btn lg-tap"
          aria-label="Create new template"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="lg-sheet-body">
        {availableTemplates.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: 'hsl(var(--muted) / 0.5)' }}
            >
              <Clock className="w-6 h-6 text-muted-foreground opacity-60" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">No templates yet</p>
            <p className="text-xs text-muted-foreground mb-5 max-w-[240px]">
              Save your most-used shifts as templates for one-tap creation.
            </p>
            <button
              type="button"
              onClick={onCreateNew}
              className="lg-tap rounded-full px-5 py-2.5 text-sm font-semibold"
              style={{
                background: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                boxShadow: '0 4px 16px hsl(var(--primary) / 0.35)',
              }}
            >
              Create Template
            </button>
          </div>
        ) : (
          <div className="lg-group">
            {availableTemplates.map(t => {
              const client = clients.find(c => c.id === t.client_id);
              const colors = TYPE_COLORS[t.shift_type] ?? TYPE_COLORS.day;
              const icon = TYPE_ICONS[t.shift_type] ?? TYPE_ICONS.day;
              const isSelecting = selecting === t.id;

              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={!!selecting}
                  onClick={() => handleSelect(t)}
                  className="lg-group-row"
                  style={{
                    opacity: selecting && !isSelecting ? 0.5 : 1,
                    background: isSelecting ? 'hsl(var(--primary) / 0.08)' : undefined,
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
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">
                        {formatTime12(t.start_time.slice(0, 5))} – {formatTime12(t.end_time.slice(0, 5))}
                      </span>
                      {client && (
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                          style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
                        >
                          {client.name}
                        </span>
                      )}
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md capitalize"
                        style={{ background: colors.bg, color: colors.fg }}
                      >
                        {t.shift_type}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div className="h-2" />
      </div>
    </BottomSheet>
  );
};

export default TemplatePicker;
