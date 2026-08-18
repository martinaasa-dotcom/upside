import { HeaderBrand } from "@/components/HeaderBrand";
import { Button } from "@/components/ui/button";
import {
  LEGAL_ADDRESS,
  LEGAL_COUNTRY,
  LEGAL_OPERATOR,
  LEGAL_REGISTRY_CODE,
  LEGAL_VAT_ID,
  PRODUCT_CONTACT_EMAIL,
  PRODUCT_NAME,
  PRODUCT_SUPPORT_EMAIL,
} from "@/lib/product";
import Link from "next/link";
import { publicPageMetadata } from "@/lib/site-metadata";
import type { ReactNode } from "react";

export const metadata = publicPageMetadata({
  title: "Privacy Policy",
  description: "How Upside Lab handles your account and the names you hold.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <HeaderBrand />
          <Button asChild variant="outline" size="sm">
            <Link href="/">Back</Link>
          </Button>
        </div>
      </header>

      <main id="main" className="flex flex-col mx-auto min-w-0 max-w-3xl gap-6 px-6 py-10 text-sm leading-relaxed text-foreground">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Privacy Policy</h1>
          <p className="mt-1 text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>
        </div>

        <p>
          Short version: we store what you type in so the app can work, we
          don&apos;t sell your data, and you can export or delete it any time
          from{" "}
          <Link href="/account" className="underline hover:text-foreground">
            My account
          </Link>
          . The long version is below.
        </p>

        <Section title="1. Who we are">
          {PRODUCT_NAME} is operated by {LEGAL_OPERATOR}, a private limited
          company in {LEGAL_COUNTRY} (registry code {LEGAL_REGISTRY_CODE}).
          Registered office: {LEGAL_ADDRESS}. VAT ID {LEGAL_VAT_ID}. That
          company is responsible for the data described here (the controller
          under GDPR). Questions:{" "}
          <a
            href={`mailto:${PRODUCT_CONTACT_EMAIL}`}
            className="underline hover:text-foreground"
          >
            {PRODUCT_CONTACT_EMAIL}
          </a>
          .
        </Section>

        <Section title="2. What we collect">
          <ul className="list-disc pl-4 [&>li+li]:mt-1.5">
            <li>
              <strong className="text-foreground">From Google sign-in:</strong>{" "}
              your email, name, and profile photo, used to create your
              account and identify you to co-owners and community members you
              choose to interact with.
            </li>
            <li>
              <strong className="text-foreground">What you enter:</strong>{" "}
              holdings, cash, notes, targets, forecast overrides, chat with
              Assistant Margus, and any broker or bank screenshot you upload
              so we can read the names onto a sheet.
            </li>
            <li>
              <strong className="text-foreground">Feedback:</strong> if you
              send the in-app prompt or a written note, we email it to the
              operator. We do not keep a public feedback database.
            </li>
            <li>
              <strong className="text-foreground">Usage &amp; performance:</strong>{" "}
              page views and load times via Vercel Analytics and Speed
              Insights, only if you allow that measurement. No ads, and no
              following you across other sites.
            </li>
          </ul>
        </Section>

        <Section title="3. How we use it">
          To run the app: show your sheets, compute your numbers, remember
          your preferences, and (only if you opt into a community) show
          today&apos;s prices, holdings, cash, and returns for the sheets you
          linked. AI features send the relevant book context to a model
          provider. That includes chat with Margus, Pulse, weekday notes,
          Forecast, and screenshot import. It is not limited to times you
          type a question. We don&apos;t sell or rent your data. We don&apos;t
          train our own models on it. Third-party model providers have their
          own retention and training rules.
        </Section>

        <Section title="4. Who sees it: third parties">
          <p className="mb-2">
            A few processors see limited data, only as needed to run the
            feature:
          </p>
          <ul className="list-disc pl-4 [&>li+li]:mt-1.5">
            <li>
              <strong className="text-foreground">Supabase</strong> (EU-hosted),
              our database and authentication provider. Everything you
              enter lives there.
            </li>
            <li>
              <strong className="text-foreground">Resend</strong> sends
              weekday notes, invites, and other mail from the app, including
              feedback you submit.
            </li>
            <li>
              <strong className="text-foreground">AI model providers</strong>{" "}
              (OpenRouter and fallbacks such as Groq and Gemini). Chat,
              Pulse, weekday notes, Forecast, and screenshot import send the
              relevant context, and for screenshots the image itself, to
              whichever provider answers. Some of those providers process
              data outside {LEGAL_COUNTRY} and the EEA, including the
              United States. We send it because the feature cannot run
              without a model. We don&apos;t control their retention beyond
              what they publish.
            </li>
            <li>
              <strong className="text-foreground">Market data providers</strong>{" "}
              (Yahoo Finance and fallback quote providers). We send ticker
              symbols to fetch prices. We don&apos;t send your holdings or
              identity to these.
            </li>
            <li>
              <strong className="text-foreground">Vercel</strong>: hosting,
              plus the performance metrics mentioned above.
            </li>
          </ul>
        </Section>

        <Section title="5. Sharing between users">
          If you invite a co-owner to a sheet, they get full edit access to
          that sheet&apos;s data. If you join a circle, other members see
          today&apos;s prices, the names you hold, cash, and returns for the
          sheet(s) you linked. They do not see what you paid. You control
          which sheets, if any, are linked. If two accounts are linked as a
          household, Circle join, leave, and role copy to both. The other
          person does not have to click agree each time. Classroom stays per
          person.
        </Section>

        <Section title="6. Cookies">
          We use essential cookies from Supabase Auth to keep you signed in.
          When you sign in with Google, Google sets cookies on its own domain
          under Google&apos;s rules. Vercel Analytics and Speed Insights
          measure page views and load times only if you allow it. You can
          say no on the banner, or change your mind later in{" "}
          <Link href="/account" className="underline hover:text-foreground">
            My account
          </Link>
          . They are not advertising cookies, and they do not follow you
          across other sites.
        </Section>

        <Section title="7. Data retention">
          We keep your data while your account is active. Nightly snapshots
          of book data are kept for backup and recovery. Only the people who
          run the app can read a restore. That is a short list of operator
          accounts, not every signed-in user. You can permanently delete
          your profile and solely-owned sheets yourself at any time (see
          below). This removes them from active use immediately.
        </Section>

        <Section title="8. Your rights (export &amp; deletion)">
          From{" "}
          <Link href="/account" className="underline hover:text-foreground">
            My account
          </Link>{" "}
          you can download a complete export of your data as JSON, or
          permanently delete your account: your profile, any sheet you solely
          own, and your sign-in credential itself (sheets you share with a
          co-owner stay with them). If for any reason the sign-in credential
          can&apos;t be removed at the same time, your {PRODUCT_NAME} data is
          still fully wiped immediately. You&apos;d just want to also revoke{" "}
          {PRODUCT_NAME}&apos;s access from your Google account if you want that
          connection severed too. EU/EEA residents have rights under GDPR
          (access, rectification, erasure, portability, objection). The
          export and delete tools cover most of these directly. Email us for
          anything else.
        </Section>

        <Section title="9. Security">
          Data is encrypted in transit (TLS) and access is scoped per-user at
          the database level (row-level security), so one user&apos;s sheets
          aren&apos;t readable by another unless explicitly shared via invite
          or community. No system is perfectly secure. If we discover a
          breach affecting your data we&apos;ll notify affected users.
        </Section>

        <Section title="10. Children and Classroom">
          Under 13 is never allowed. You confirm you are 13 or older when you
          sign in. {PRODUCT_NAME} is not a brokerage and
          does not open a real trading account. Classroom is a private paper
          class: a teacher invites students, each student gets homework cash
          and an empty sheet, and real books cannot be shared into the class.
          If your country needs a parent or guardian for someone your age to
          use an app like this, that person has to agree. The teacher is
          responsible for running the class under their school&apos;s rules.
        </Section>

        <Section title="11. Changes">
          We may update this policy as the product evolves. Material changes
          will be reflected here with a new &ldquo;last updated&rdquo; date.
        </Section>

        <Section title="12. Contact">
          Product help:{" "}
          <a
            href={`mailto:${PRODUCT_SUPPORT_EMAIL}`}
            className="underline hover:text-foreground"
          >
            {PRODUCT_SUPPORT_EMAIL}
          </a>
          . Questions, data requests, or concerns:{" "}
          <a
            href={`mailto:${PRODUCT_CONTACT_EMAIL}`}
            className="underline hover:text-foreground"
          >
            {PRODUCT_CONTACT_EMAIL}
          </a>
          .
        </Section>

        <p className="pt-4 text-sm text-muted-foreground">
          See also our{" "}
          <Link href="/terms" className="underline hover:text-foreground">
            Terms of service
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

const LAST_UPDATED = "18 August 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
