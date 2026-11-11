import { createFileRoute, Link } from "@tanstack/react-router";
import { Bullets, LegalPage, LegalSection } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
  head: () => ({
    meta: [
      { title: "Privacy Policy — Synchoo" },
      { name: "description", content: "How Synchoo collects, uses, stores and deletes your personal data across rentals, driver hires, pooling and wash bookings." },
      { property: "og:title", content: "Privacy Policy — Synchoo" },
      { property: "og:description", content: "What data Synchoo collects, why we need it, how long we keep it and how you can export or delete it." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="17 August 2026"
      intro="This policy explains what information Synchoo collects when you rent a vehicle, hire a driver, join a pooling trip or book a wash, why we need it, who can see it, and how you can export or delete it."
    >
      <LegalSection heading="1. Who we are">
        <p>
          Synchoo operates a peer-to-peer mobility marketplace connecting renters with vehicle hosts, professional
          drivers, pooling co-travellers and wash partners. We act as the controller of the account, booking and payment
          data described below.
        </p>
      </LegalSection>

      <LegalSection heading="2. Data we collect">
        <Bullets
          items={[
            "Account data: name, email address, phone number, city, profile photo and your sign-in method (email/password or Google).",
            "Verification data: driving licence number, expiry and licence images; for hosts, business details and identity documents; for drivers, licence and identity documents.",
            "Vehicle and listing data: vehicle details, photos, pricing, address and the coordinates you pin on the map.",
            "Booking data: dates, pickup and drop-off times, fuel and odometer readings, handover photos, damage notes, disputes and messages exchanged with the other party.",
            "Payment data: amounts, payment method, wallet ledger entries and payment gateway references. Card and UPI details are handled by our payment gateway; we never store them.",
            "Location data: with your permission, your device location during an active trip so the host and support can see live trip progress.",
            "Technical data: device/browser information, and errors and events needed to keep the service secure and reliable.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. Why we use it">
        <Bullets
          items={[
            "To create and secure your account and prevent fraudulent or duplicate sign-ups.",
            "To verify licences, host identity and vehicle documents before a vehicle or driver can be booked.",
            "To process bookings, handovers, cancellations, refunds and wallet transactions.",
            "To enable in-app chat between a renter and the host of a confirmed booking.",
            "To provide live trip tracking, safety support and dispute resolution with photo evidence.",
            "To send booking, trip, payment and verification notifications.",
            "To meet legal, tax and accounting obligations for completed transactions.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. What other users can see">
        <p>
          Hosts, drivers and co-travellers see only what a booking requires: your display name, profile photo, city, the
          booking details and messages you send. Licence numbers, document images, email addresses, wallet balances and
          full transaction history are never shown to other users. Public pages show limited host and driver profile
          fields (business or display name, city, ratings) and never contact details.
        </p>
      </LegalSection>

      <LegalSection heading="5. Location data">
        <p>
          Live location is collected only while a trip is active and only after you grant browser permission. You can
          revoke permission at any time from your browser settings; tracking then stops and the trip continues normally.
          Location pings are visible to you, the vehicle host for that booking and Synchoo support.
        </p>
      </LegalSection>

      <LegalSection heading="6. How long we keep data">
        <Bullets
          items={[
            "Account and profile data: until you delete your account.",
            "Verification documents: while your verification is active, then removed on account deletion.",
            "Booking, payment, wallet and invoice records: retained after account deletion in anonymised form, because tax, accounting and dispute rules require them.",
            "Support and dispute records: retained until the matter is resolved and any legal limitation period ends.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="7. Security">
        <p>
          Access to data is enforced in the database itself with row-level security, so a request can only read the rows
          it is entitled to. Documents and trip photos live in private storage and are served through short-lived signed
          links. Privileged actions run server-side and check your identity and role on every call.
        </p>
      </LegalSection>

      <LegalSection heading="8. Your rights and controls">
        <Bullets
          items={[
            "Access and correct your profile and verification details from your Profile page.",
            "Export a machine-readable copy of your personal data.",
            "Delete your account and personal data, subject to the retention rules above.",
            "Withdraw location permission or turn off notifications at any time.",
          ]}
        />
        <p className="mt-2">
          Manage all of this from{" "}
          <Link to="/data-deletion" className="underline hover:text-foreground">Privacy & data controls</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="9. Children">
        <p>Synchoo is not intended for anyone under 18, and a valid driving licence is required to rent a vehicle.</p>
      </LegalSection>

      <LegalSection heading="10. Changes and contact">
        <p>
          We will update this page when our practices change, and the date above always reflects the current version.
          For any privacy question or request, use the in-app support flow or the request form on the{" "}
          <Link to="/data-deletion" className="underline hover:text-foreground">data controls page</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
