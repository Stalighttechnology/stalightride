import json
from datetime import datetime, timezone, timedelta
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from core.db import db_role

MEMBERSHIP_PRICES = {
    ("plus", "monthly"): 799,
    ("plus", "annual"): 7999,
    ("black", "monthly"): 1999,
    ("black", "annual"): 19999,
}


class Command(BaseCommand):
    help = "Renew expiring memberships with auto_renew enabled, or downgrade if insufficient wallet funds."

    def handle(self, *args, **options):
        renewed = 0
        expired = 0

        with transaction.atomic(), db_role("service_role"):
            with connection.cursor() as cur:
                # Find due auto-renew memberships
                cur.execute(
                    """
                    SELECT id, membership_plan, membership_cycle, membership_expires_at
                      FROM public.profiles
                     WHERE membership_plan IN ('plus', 'black')
                       AND membership_auto_renew = true
                       AND membership_expires_at IS NOT NULL
                       AND membership_expires_at <= now()
                    """
                )
                rows = cur.fetchall()

                for user_id, plan, cycle, current_exp in rows:
                    price = MEMBERSHIP_PRICES.get((plan, cycle or "monthly"), 799)
                    cur.execute("SELECT balance FROM public.wallets WHERE user_id = %s", [user_id])
                    w = cur.fetchone()
                    bal = float(w[0]) if w else 0.0

                    if bal >= price:
                        # Auto-renew successfully via wallet
                        ref = f"renew_{user_id[:8]}_{int(datetime.now(timezone.utc).timestamp())}"
                        cur.execute(
                            """
                            SELECT public.wallet_apply(%s, %s, %s, %s, %s)
                            """,
                            [
                                user_id,
                                -price,
                                "membership_renewal",
                                ref,
                                f"Synchoo {plan.title()} Auto-Renewal ({cycle.capitalize()})",
                            ],
                        )

                        duration_days = 365 if cycle == "annual" else 30
                        new_exp = datetime.now(timezone.utc) + timedelta(days=duration_days)

                        cur.execute(
                            """
                            UPDATE public.profiles
                               SET membership_expires_at = %s,
                                   updated_at = now()
                             WHERE id = %s
                            """,
                            [new_exp.isoformat(), user_id],
                        )

                        cur.execute(
                            """
                            SELECT public.notify_user(%s, %s, %s, %s)
                            """,
                            [
                                user_id,
                                f"Synchoo {plan.title()} Membership Renewed",
                                f"Your plan was renewed until {new_exp.strftime('%d %b %Y')}. Enjoy 0% convenience fees and perks!",
                                "/membership",
                            ],
                        )
                        renewed += 1
                    else:
                        # Insufficient balance - downgrade to standard free plan
                        cur.execute(
                            """
                            UPDATE public.profiles
                               SET membership_plan = 'free',
                                   membership_auto_renew = false,
                                   updated_at = now()
                             WHERE id = %s
                            """,
                            [user_id],
                        )

                        cur.execute(
                            """
                            SELECT public.notify_user(%s, %s, %s, %s)
                            """,
                            [
                                user_id,
                                "Membership Auto-Renewal Expired",
                                f"Your {plan.title()} renewal could not complete due to insufficient wallet funds (needed ₹{price:,.2f}). Switched to Synchoo Standard.",
                                "/membership",
                            ],
                        )
                        expired += 1

        result = {"renewed": renewed, "expired": expired, "processed": renewed + expired}
        self.stdout.write(json.dumps(result))
