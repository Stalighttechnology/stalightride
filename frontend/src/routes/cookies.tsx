import { createFileRoute, Link } from "@tanstack/react-router";
import { Bullets, LegalPage, LegalSection } from "@/components/legal-page";

export const Route = createFileRoute("/cookies")({
  component: Cookies,
  head: () => ({
    meta: [
      { title: "Cookie Policy — Synchoo" },
      { name: "description", content: "The cookies and local storage Synchoo uses to keep you signed in, remember your city and theme, and keep bookings secure." },
      { property: "og:title", content: "Cookie Policy — Synchoo" },
      { property: "og:description", content: "Which cookies and browser storage keys Synchoo uses, why, and how to clear them." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Cookies() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated="17 August 2026"
      intro="Synchoo uses a small number of strictly necessary cookies and browser storage entries. We do not use advertising or cross-site tracking cookies."
    >
      <LegalSection heading="1. Strictly necessary">
        <Bullets
          items={[
            "Session storage: keeps you signed in and refreshes your access token. Removing it signs you out.",
            "Security tokens: protect requests to our backend from misuse.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="2. Preferences">
        <Bullets
          items={[
            "Theme preference (light or dark) so the interface loads without flashing.",
            "Selected city so Browse and search results stay relevant.",
            "Install prompt state for the app-install banner.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. Third parties">
        <p>
          Maps are rendered by Google Maps and payments are processed by our payment gateway; both may set their own
          cookies when their components load. Google sign-in sets cookies on Google's own domain during authentication.
        </p>
      </LegalSection>

      <LegalSection heading="4. Managing cookies">
        <p>
          You can clear cookies and site data from your browser settings at any time. Clearing strictly necessary entries
          signs you out but does not delete your account. To remove your data permanently, use{" "}
          <Link to="/data-deletion" className="underline hover:text-foreground">Privacy & data controls</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
