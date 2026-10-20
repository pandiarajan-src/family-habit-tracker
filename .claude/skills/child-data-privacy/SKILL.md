---
name: child-data-privacy
description: Privacy rules for family-member data. Use whenever designing or changing data models, database tables, migrations, API endpoints, logging, or anything that stores, returns or records information about family members or their check-ins — in specs, plans or code — even if the change looks unrelated to privacy.
---

# Child data privacy

Children use this app, so we collect the least data possible and keep it inside the family.

## Rules

1. **Minimal member data.** A member is only a nickname, an avatar emoji and a role (`parent` or `child`). Never add email, birthdate, photo or location fields for children. The one exception is a hashed member PIN, which is allowed only in a separate credential record linked to the member: never on the member itself, never returned by the API, and deleted with the member.
2. **No sensitive values in logs.** Never log member names (nicknames) or passcodes, including in error messages, exceptions, debug output and request logs. Log IDs instead.
3. **Passcode session required.** Every endpoint or page that reads or writes family data requires a valid family passcode session; only the passcode-entry endpoint is exempt.
4. **Deletion cascades.** Deleting a member deletes all of their check-ins (database-level cascade plus an API test proving it).
5. **No third-party tracking.** No analytics, trackers, ad SDKs, or externally hosted fonts/scripts that phone home.

## How to verify

Check the member model/schema has only the allowed fields, and that any PIN is stored only as a hash in a separate credential record that no response schema exposes; grep new log calls for `nickname`, `name` or `passcode`; confirm an unauthenticated request to each new endpoint returns 401; confirm a test deletes a member and asserts their check-ins are gone; check `package.json` and HTML for analytics/tracking dependencies.
