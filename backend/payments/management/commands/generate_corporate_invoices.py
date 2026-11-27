"""
Corporate Invoicing Command Proxy.
Delegates to core.management.commands.generate_corporate_invoices.
"""
from core.management.commands.generate_corporate_invoices import Command, IST

__all__ = ["Command", "IST"]
