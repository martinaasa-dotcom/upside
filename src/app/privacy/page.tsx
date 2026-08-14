import { HeaderBrand } from "@/components/HeaderBrand";
import { PRODUCT_CONTACT_EMAIL } from "@/lib/product";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy: Upside Lab",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_#14110e_0%,_#08090C_55%)] text-zinc-100">
      <header className="border-b border-white/10 bg-app/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <HeaderBrand />
          <Link
            href="/"
            className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
          >
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 text-sm leading-relaxed text-zinc-300">
        <div>
          <h1 className="text-2xl font-semibold text-white">Privacy Policy</h1>
          <p className="mt-1 text-xs text-zinc-400">Last updated {LAST_UPDATED}</p>
        </div>

        <p>
          Short version: we store what you type in so the app can work, we
          don&apos;t sell your data, and you can export or delete it any time
          from{" "}
          <Link href="/account" className="underline hover:text-white">
            My account
          </Link>
          . The long version is below.
        </p>

        <Section title="1. What we collect">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-zinc-200">From Google sign-in:</strong>{" "}
              your email, name, and profile photo, used to create your
              account and identify you to co-owners/community members you
              choose to interact with.
            </li>
            <li>
              <strong className="text-zinc-200">What you enter:</strong>{" "}
              holdings, cash balances, notes, targets, forecast overrides,
              and anything you send Assistant Margus in
              chat.
            </li>
            <li>
              <strong className="text-zinc-200">Usage &amp; performance:</strong>{" "}
              basic, privacy-respecting analytics and performance metrics via
              Vercel Analytics / Speed Insights (page views, load times), no
              cross-site tracking or ad identifiers.
            </li>
          </ul>
        </Section>

        <Section title="2. How we use it">
          To run the app: show your sheets, compute your numbers, remember
          your preferences, let AI features read your portfolio when you
          explicitly ask them to, and (only if you opt into a community) show
          a leaderboard summary of your performance to people in that
          community. We don&apos;t use your data to train third-party AI
          models, and we don&apos;t sell or rent your data to anyone.
        </Section>

        <Section title="3. Who sees it: third parties">
          <p className="mb-2">
            A few categories of processor see limited data, only as needed to
            run the feature:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-zinc-200">Supabase</strong> (EU-hosted),
              our database and authentication provider. Everything you
              enter lives there.
            </li>
            <li>
              <strong className="text-zinc-200">AI model providers</strong>{" "}
              (OpenRouter and fallback providers). When you use Margus, ask
              for a forecast, or run Thesis Pulse, the relevant portfolio
              context and your message are sent to whichever provider
              answers that request. We don&apos;t control their retention
              policies beyond what they publish.
            </li>
            <li>
              <strong className="text-zinc-200">Market data providers</strong>{" "}
              (Yahoo Finance and fallback quote providers). We send ticker
              symbols to fetch prices; we don&apos;t send your holdings or
              identity to these.
            </li>
            <li>
              <strong className="text-zinc-200">Vercel</strong>: hosting,
              plus the anonymized analytics mentioned above.
            </li>
          </ul>
        </Section>

        <Section title="4. Sharing between users">
          If you invite a co-owner to a sheet, they get full edit access to
          that sheet&apos;s data. If you join a community/leaderboard, other
          members see a read-only performance summary (returns, notable
          holdings) for the sheet(s) you&apos;ve linked to that community,
          not your raw cash balance or full transaction history unless the
          community view is explicitly designed to show it. You control which
          sheets, if any, are linked to a community.
        </Section>

        <Section title="5. Cookies">
          We use one essential cookie set (via Supabase Auth) to keep you
          signed in. No third-party advertising or cross-site tracking
          cookies.
        </Section>

        <Section title="6. Data retention">
          We keep your data while your account is active. Nightly snapshots
          of book data are kept for backup/recovery and restricted to
          admin-only access. You can permanently delete your profile and
          solely-owned sheets yourself at any time (see below); this removes
          them from active use immediately.
        </Section>

        <Section title="7. Your rights (export &amp; deletion)">
          From{" "}
          <Link href="/account" className="underline hover:text-white">
            My account
          </Link>{" "}
          you can download a complete export of your data as JSON, or
          permanently delete your account: your profile, any sheet you solely
          own, and your sign-in credential itself (sheets you share with a
          co-owner stay with them). If for any reason the sign-in credential
          can&apos;t be removed at the same time, your Upside Lab data is still
          fully wiped immediately. You&apos;d just want to also revoke
          Upside Lab&apos;s access from your Google account if you want that
          connection severed too. EU/EEA residents have rights under GDPR
          (access, rectification, erasure, portability, objection); the
          export/delete tools cover most of these directly; email us for
          anything else.
        </Section>

        <Section title="8. Security">
          Data is encrypted in transit (TLS) and access is scoped per-user at
          the database level (row-level security), so one user&apos;s sheets
          aren&apos;t readable by another unless explicitly shared via invite
          or community. No system is perfectly secure; if we discover a
          breach affecting your data we&apos;ll notify affected users.
        </Section>

        <Section title="9. Children">
          Upside Lab isn&apos;t directed at children and isn&apos;t intended for
          use by anyone below the age required to hold a brokerage account or
          enter a binding agreement in their jurisdiction.
        </Section>

        <Section title="10. Changes">
          We may update this policy as the product evolves. Material changes
          will be reflected here with a new &ldquo;last updated&rdquo; date.
        </Section>

        <Section title="11. Contact">
          Questions, data requests, or concerns:{" "}
          <a
            href={`mailto:${PRODUCT_CONTACT_EMAIL}`}
            className="underline hover:text-white"
          >
            {PRODUCT_CONTACT_EMAIL}
          </a>
          .
        </Section>

        <p className="pt-4 text-xs text-zinc-400">
          See also our{" "}
          <Link href="/terms" className="underline hover:text-white">
            Terms of service
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

const LAST_UPDATED = "August 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
