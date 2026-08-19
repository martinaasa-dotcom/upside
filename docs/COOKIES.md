# Cookies and on-device storage

What Upside Lab actually stores in a visitor's browser, so the answer
exists when a regulator, an enterprise customer, or a curious user asks.

This is an internal reference, not the published notice. The Privacy
Policy (`src/app/privacy/page.tsx` §6) describes these at category level,
which is what most DPAs accept for an app this size. If a per-cookie
table ever needs publishing, build it from here rather than from memory.

**Last verified: 2026-08-19**, by loading the app in a clean browser
profile and dumping `document.cookie`, `localStorage` and `sessionStorage`
before and after answering the consent banner.

## The headline: this app sets almost no cookies

The verified result on a signed-out visit was **zero cookies** — before
answering the consent banner, and still zero after clicking Allow.
Everything the app keeps on a device is `localStorage`.

That matters for two reasons. It means the usual "we use cookies for
analytics" boilerplate would be inaccurate here. And it means the
ePrivacy question is really about **storage**, not cookies specifically:
Article 5(3) covers "storing information, or gaining access to
information already stored, in the terminal equipment of a subscriber"
— `localStorage` included. The exemption test is the same either way
(strictly necessary for a service the user requested), and the keys below
are functional app state rather than tracking.

## Cookies

| Name | Set by | Purpose | Lifetime | Consent |
|---|---|---|---|---|
| `sb-uzrnybyggznpvgxgrvgl-auth-token` (may be split into `…-auth-token.0`, `…-auth-token.1` when the JWT is large) | `@supabase/ssr`, first-party, on our domain | The signed-in session. Without it you are signed out on every request. | Tracks the Supabase session/refresh-token lifetime; cleared on sign-out and by account deletion (`purgeClientSession()`). | **Strictly necessary** — exempt. No banner required. |
| Google sign-in cookies | Google, on `google.com` / `accounts.google.com` | Google's own sign-in. | Google's, not ours. | Set by Google under Google's policies during the OAuth redirect. We never read them and they are not on our domain. |

Not verifiable in the sandbox used for this pass: the Supabase cookie
only appears once a real session exists, and there is no Supabase project
reachable from it. The name above is the `@supabase/ssr` convention
(`sb-<project-ref>-auth-token`) applied to this app's project ref from
`.env.example`. **Re-verify against a real signed-in session** before
publishing it anywhere externally.

## Vercel Analytics and Speed Insights

`@vercel/analytics` and `@vercel/speed-insights` are **cookieless** — they
set no cookies, which the empirical check confirms (zero cookies even
after consent was granted).

They are still gated behind an explicit opt-in banner
(`AnalyticsConsentBanner.tsx` → `ConsentedAnalytics.tsx`), and they only
mount once `loadAnalyticsConsent() === "allow"`. That is stricter than
ePrivacy strictly requires for a cookieless measurement tool, and it is
the right default to keep: it means no third-party measurement script
runs at all for anyone who declines.

The choice itself is stored in `upside-analytics-consent-v1`.

## localStorage

Every key is first-party, readable only by our own origin, and never sent
to a server automatically the way a cookie is. None of it profiles a
person across sites.

Categories rather than 50 rows, since the list churns with features — the
authoritative enumeration is:

```bash
grep -rhoE '"(upside|portfell)-[a-z0-9-]+"' src/lib src/components
```

| Category | Examples | What it is |
|---|---|---|
| Consent | `upside-analytics-consent-v1` | The analytics answer itself. Must persist, or the banner cannot stop asking. |
| Session-adjacent | `upside-last-user-v1`, `upside-active-sheet-id`, `upside-last-circle-id`, `upside-open-tab` | Which account/sheet/tab you were last on, so the app reopens where you left it. |
| Offline + sync queue | `upside-offline`, `upside-sync`, `upside-flush-sync`, `upside-book-cache-v1`, `upside-quotes-v1` | The offline-first engine: the cached book and the queue of writes waiting for a connection. |
| Your own working notes | `upside-conviction-v1`, `upside-watchlist-v1`, `upside-week-marks-v1`, `upside-pulse-history-v1` | Thesis notes and watchlist. Also synced server-side per owner (`portfell_lab_state`). |
| View preferences | `upside-display-currency-v1`, `upside-compound-*`, `portfell-forecast-*`, `portfell-cc-visible-by-portfolio`, `upside-margus-wide` | Toggles and per-sheet view state. |
| Demo / local dev | `portfell-demo-v8`, `portfell-locked` | The seeded demo book and its Save lock. Local only. |

All of it is wiped by `purgeClientSession()` on sign-out and on account
switch — the sweep matches the `upside-*` / `portfell-*` / `sb-*`
prefixes, which is what stops one person's cached notes surfacing under
another account on a shared browser.

## When to revisit

Re-run the verification and update this file when any of these change:

- A third-party script is added that is **not** cookieless — a marketing
  pixel, a heatmap tool, an A/B framework, a chat widget. That is the
  trigger for publishing a real per-cookie table in the Privacy Policy,
  and for a consent banner that blocks it before it loads.
- Supabase auth changes how it stores sessions.
- The app starts setting first-party cookies of its own.
