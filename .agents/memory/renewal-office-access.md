---
name: Renewal office access
description: Visibility rules for certificate renewal records across admins, accountants, and accountant operators.
---

Renewals are global only for administrators. A contador sees renewals solely for orders commercially owned by that contador; an operador sees the same office records through its active linked contador. Other authenticated roles have no renewal-list access.

**Why:** Renewal records contain customer and certificate information, so frontend filtering alone would allow cross-office data exposure through the API. Operators represent their linked accountant commercially and must never be treated as independent owners.

**How to apply:** Enforce the relationship in the server query by joining renewals to orders and filtering `orders.user_id` to the resolved contador account. Keep email-alert actions administrator-only. In the non-admin UI, expose only the customer name, due date, and urgency/alert indicators.