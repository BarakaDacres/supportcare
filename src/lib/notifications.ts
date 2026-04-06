/**
 * Local notification system using the browser Notification API.
 */

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function isNotificationEnabled(key: string): boolean {
  return localStorage.getItem(key) !== 'false';
}

export function showNotification(title: string, options?: NotificationOptions): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      icon: '/lovable-uploads/icon-192.png',
      badge: '/lovable-uploads/icon-192.png',
      ...options,
    });
  } catch {
    // SW notifications fallback
    navigator.serviceWorker?.ready?.then(reg => {
      reg.showNotification(title, options);
    }).catch(() => {});
  }
}

/**
 * Schedule a shift reminder notification.
 * Checks localStorage for pref_shift_reminders.
 */
let shiftTimers: ReturnType<typeof setTimeout>[] = [];

export function scheduleShiftReminders(shifts: Array<{ date: string; start_time: string; client_id?: string | null; notes?: string | null }>) {
  // Clear previous
  shiftTimers.forEach(t => clearTimeout(t));
  shiftTimers = [];

  if (!isNotificationEnabled('pref_shift_reminders')) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = Date.now();
  const FIFTEEN_MIN = 15 * 60 * 1000;

  shifts.forEach(shift => {
    const shiftTime = new Date(`${shift.date}T${shift.start_time}`).getTime();
    const notifyAt = shiftTime - FIFTEEN_MIN;
    const delay = notifyAt - now;

    if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
      const timer = setTimeout(() => {
        showNotification('Shift Starting Soon', {
          body: `Your shift starts in 15 minutes${shift.notes ? ` — ${shift.notes}` : ''}`,
          tag: `shift-${shift.date}-${shift.start_time}`,
        });
      }, delay);
      shiftTimers.push(timer);
    }
  });
}

/**
 * Check for overdue invoices and notify.
 */
export function checkOverdueInvoices(invoices: Array<{ invoice_number: string; due_date?: string | null; status: string }>) {
  if (!isNotificationEnabled('pref_invoice_reminders')) return;
  if (Notification.permission !== 'granted') return;

  const today = new Date().toISOString().slice(0, 10);
  const notifiedKey = 'notified_overdue_invoices';
  const notified = new Set(JSON.parse(localStorage.getItem(notifiedKey) || '[]'));

  invoices.forEach(inv => {
    if (inv.status === 'paid' || !inv.due_date) return;
    if (inv.due_date < today && !notified.has(inv.invoice_number)) {
      showNotification('Invoice Overdue', {
        body: `Invoice ${inv.invoice_number} is past due`,
        tag: `overdue-${inv.invoice_number}`,
      });
      notified.add(inv.invoice_number);
    }
  });

  localStorage.setItem(notifiedKey, JSON.stringify([...notified]));
}
