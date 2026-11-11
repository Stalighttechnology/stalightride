import { createFileRoute, Link } from "@tanstack/react-router";
import { Bullets, LegalPage, LegalSection } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({
  component: Terms,
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Synchoo" },
      { name: "description", content: "The rules for using Synchoo: bookings, payments, deposits, cancellations, refunds, damages, host and driver obligations." },
      { property: "og:title", content: "Terms & Conditions — Synchoo" },
      { property: "og:description", content: "Booking rules, payment and refund terms, deposits, damages and responsibilities for renters, hosts and drivers." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Terms() {
  return (
    <LegalPage
      title="Terms & Conditions"
      updated="17 August 2026"
      intro="These terms govern your use of Synchoo as a renter, host, driver, pooling participant or wash customer. By creating an account you accept them."
    >
      <LegalSection heading="1. Your account">
        <Bullets
          items={[
            "You must be at least 18 and provide accurate details.",
            "Renting a vehicle requires an approved driving licence on your profile.",
            "You are responsible for activity under your account; keep your credentials private.",
            "We may suspend accounts used for fraud, unsafe driving, document forgery or abuse of other users.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="2. Marketplace role">
        <p>
          Synchoo is a marketplace. Vehicles are owned by independent hosts, driving services are provided by
          independent drivers, and wash services by partner vendors. The rental or service contract is between you and
          that provider; Synchoo facilitates discovery, verification, booking, payment and support.
        </p>
      </LegalSection>

      <LegalSection heading="3. Verification">
        <Bullets
          items={[
            "Hosts must submit business and identity details; listings stay pending until an admin approves them.",
            "Every vehicle needs registration, insurance, pollution and fitness documents reviewed before it becomes visible.",
            "Drivers must submit licence and identity documents for review.",
            "Renters must have an approved licence before a booking can be created.",
            "Rejections include a reason, and you may correct and resubmit.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Bookings and prices">
        <Bullets
          items={[
            "Prices are set by the host or driver and shown with a full breakdown before payment: base charge, security deposit, discounts and total.",
            "Rental charges use the best applicable hourly, daily or weekly tier for the selected window.",
            "A booking is confirmed only once payment succeeds and, where required, the host accepts it.",
            "Booked or blocked dates are removed from public availability automatically.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="5. Payments, wallet and deposits">
        <Bullets
          items={[
            "You can pay by card/UPI through our payment gateway or from your Synchoo wallet balance.",
            "Refunds are credited to your wallet ledger and are visible as transactions.",
            "Security deposits are held against damage, fuel shortfall or traffic penalties and released after a clean return check.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="6. Cancellations and refunds">
        <Bullets
          items={[
            "Driver hires: full refund more than 24 hours before start, 50% between 2 and 24 hours, none within 2 hours.",
            "Wash bookings: refundable until the slot is assigned and started; rejected requests are refunded in full.",
            "Rental cancellations follow the terms shown on the booking before you pay.",
            "Refund amounts are always shown before you confirm a cancellation.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="7. Pickup, return and damages">
        <Bullets
          items={[
            "Handover opens shortly before the pickup time and uses a QR scan plus a photo, fuel and odometer check.",
            "Record existing damage at pickup; the same checklist is repeated at return.",
            "Return the vehicle on time, at the agreed place, with a comparable fuel level.",
            "Fines, tolls and penalties incurred during your trip are your responsibility.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="8. Pooling">
        <p>
          Pooling is cost-sharing between co-travellers, not a commercial taxi service. Drivers set the fare per seat and
          may accept or decline requests; seats are reserved only once accepted.
        </p>
      </LegalSection>

      <LegalSection heading="9. Reviews and conduct">
        <p>
          Reviews may be left after a trip is completed and must be honest and respectful. Hosts and drivers may post one
          public response. We remove content that is abusive, misleading or unlawful.
        </p>
      </LegalSection>

      <LegalSection heading="10. Liability">
        <p>
          Synchoo is not liable for indirect losses arising from a provider's vehicle or conduct. Nothing in these terms
          limits rights you have under applicable consumer law.
        </p>
      </LegalSection>

      <LegalSection heading="11. Ending your account">
        <p>
          You may delete your account at any time from{" "}
          <Link to="/data-deletion" className="underline hover:text-foreground">Privacy & data controls</Link>. Completed
          transaction records are retained in anonymised form as described in the{" "}
          <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
