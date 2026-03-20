
## Scope of changes

### 1. Prefs toggles — wire everything up

**Current state:**
- "Invoice Due Date" shows a static "7 days" label with no interaction
- `invoice_due_days` column does NOT exist in the DB (not in types.ts) — needs a migration
- Show Tax Estimate and Default Invoice Notes already call `onSave` → ✅ working
- Haptics / Shift Reminders / Invoice Reminders / Auto Timezone all use `localStorage` — technically functional but no actual system is consuming them yet. For now they persist and are readable by other components
- Theme picker → ✅ working

**Plan:**
- Add `invoice_due_days` column (integer, default 7) to `user_settings` via migration
- Add `invoice_due_days` to the `UserSettings` interface and `DEFAULT_SETTINGS`
- Replace the static "7 days" label on Invoice Due Date with a tappable row that opens a picker (7 / 14 / 21 / 30 days), saving to DB via `onSave`
- Update `InvoicePanel.tsx` to read `settings?.invoice_due_days ?? 7` instead of the hardcoded `7` everywhere `addDays(issueDate, 7)` appears

---

### 2. Account page redesign

**Current issues:** Multiple separate save buttons for each section creates friction. Visually dense and utilitarian.

**Redesign:**
- Profile card at the top with large avatar, name, email — tap avatar to change photo
- Move Sign Out to a prominent but clearly secondary position (bottom of page, red destructive row)
- Combine Business Identity + Banking into collapsible-style grouped sections with inline save (auto-save on blur or single "Save Changes" floating button at bottom)
- Show a subtle "unsaved changes" indicator (dot on section header) instead of multiple save buttons
- Use a single sticky "Save Changes" button at the bottom that only appears when there are dirty fields — saves all sections in one tap
- Clean up the section headers to match the Prefs panel style
- Keep invoice counter reset in a "Danger Zone" style section at the bottom

---

### 3. Header — fix 3-dots menu + remove Print

**`Header.tsx`:** Remove the Print button entirely.

**`UserMenu.tsx`:** The current dropdown is a plain `glass-card` box. Redesign to feel like a native iOS action sheet / context menu:
- Rounded corners, proper shadow, blur backdrop
- Show avatar/initial + name + email in the header of the dropdown (larger, cleaner)
- Keep Sign Out as the only action in the menu
- Add a subtle scale animation on open

---

### 4. Login / onboarding page redesign

The current page is functional but generic. Add a proper onboarding experience for new users:

**Login screen:** Keep the existing structure but refine:
- Tighter, more polished card
- Smooth tab-switch animation between login/signup/forgot (slide or fade)
- Better spacing and input focus states

**Signup onboarding (new flow):**
- After successful account creation + email confirmation, show a 3-step onboarding sequence:
  1. Welcome screen — "Welcome to Support Care" with animated logo
  2. Business setup — quick prompt for business name + ABN (skippable)
  3. Set your first pay rate — weekday rate input (skippable)
- "Get Started" CTA takes them to the app
- Persisted in `localStorage('onboarding_complete')` — only shown once

**Implementation approach:** Add an `onboarding` state to `AuthPage.tsx` or a dedicated `OnboardingWizard` component rendered by `App.tsx` when `auth.user` is set but `onboarding_complete` is not in localStorage.

---

## Files to change

| File | Change |
|------|--------|
| `supabase/migrations/` | Add `invoice_due_days integer default 7` to `user_settings` |
| `src/hooks/useUserSettings.ts` | Add `invoice_due_days` to interface + defaults |
| `src/components/PreferencesPanel.tsx` | Wire Invoice Due Date to a picker (7/14/21/30), saving to DB |
| `src/components/InvoicePanel.tsx` | Replace hardcoded `7` with `settings?.invoice_due_days ?? 7` |
| `src/components/AccountPanel.tsx` | Full redesign — single save button, cleaner layout |
| `src/components/Header.tsx` | Remove Print button |
| `src/components/UserMenu.tsx` | Redesign dropdown to native iOS-style context menu |
| `src/pages/AuthPage.tsx` | Full redesign + onboarding wizard for new users |

## Migration

```sql
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS invoice_due_days integer NOT NULL DEFAULT 7;
```

No RLS changes needed — existing policies cover this column automatically.
