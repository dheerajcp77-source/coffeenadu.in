# Coffeenadu News Security Specification

## 1. Data Invariants
1. **Admin-Only Publishing**: Public readers may read (`/articles/{articleId}`) without authentication, but **only** verified editorial admins (`request.auth.token.email_verified == true` and either the bootstrapped owner email or a document in `/admins/{request.auth.uid}`) may `create`, `update`, or `delete` articles.
2. **Strict Document Identity & ID Hardening**: All document IDs (`articleId`, `adminUid`) must satisfy `^[a-zA-Z0-9_\\-]+$` and `size() <= 128`. On article creation, `incoming().id == articleId` and `incoming().authorUid == request.auth.uid`.
3. **Immutable Audit & Ownership Fields**: Once created, `id`, `authorUid`, and `createdAt` cannot be modified on `/articles/{articleId}`; `uid`, `addedBy`, and `createdAt` cannot be modified on `/admins/{adminUid}`.
4. **Temporal Integrity**: `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
5. **No Ghost Fields or Oversized Payloads**: Every document enforces exact `hasAll` + `hasOnly` key allowlists, explicit `.size()` bounds on every string/list (including `imageUrl <= 350000` chars), and enum validation for `category` and `imageKey`.
6. **Zero PII Exposure**: Public `/articles` documents contain no user email addresses or private identifiers; `/admins` contains only UID and editorial label and is readable only by the admin themselves or another verified admin.

## 2. The "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)

1. **Unauthenticated Create on `/articles/hack-1`**:
   `{ "id": "hack-1", "titleKannada": "Fake", ... }` with `auth = null`.
2. **Non-Admin Verified User Create on `/articles/hack-2`**:
   Signed in as `attacker@gmail.com` (`email_verified: true`, not in `/admins`) sending valid article schema.
3. **Unverified Admin Email Spoof on `/articles/hack-3`**:
   Signed in with `email = "shwethashwethak85@gmail.com"` and `email_verified = false`.
4. **Shadow/Ghost Field Injection on `/articles/hack-4`**:
   Admin creates article including `"isAdminOverride": true` outside `hasOnly` allowlist.
5. **Author UID Spoofing on `/articles/hack-5`**:
   Admin creates article setting `"authorUid": "someone-else-uid"` != `request.auth.uid`.
6. **Client-Forged Timestamp on `/articles/hack-6`**:
   Admin creates article with `createdAt = "2020-01-01T00:00:00Z"` instead of `request.time`.
7. **ID Poisoning (Path Traversal / Oversized ID) on `/articles/bad..id`**:
   Admin attempts create on document ID containing invalid characters (`bad..id` or >128 chars).
8. **Invalid Category Enum on `/articles/hack-8`**:
   Admin creates article with `"category": "PoliticsOverride"` not in allowed categories.
9. **Oversized Image Payload (DoS / Wallet Attack) on `/articles/hack-9`**:
   Admin creates article with `"imageUrl"` exceeding 350,000 characters.
10. **Immutable Field Mutation on Update (`/articles/news-1`)**:
    Admin updates `"createdAt"` or `"authorUid"` alongside `"titleKannada"`.
11. **Self-Assigned Admin Escalation on `/admins/{uid}`**:
    Non-admin signed-in user attempts to create `/admins/{request.auth.uid}` to become an admin.
12. **PII / Admin List Scraping on `/admins`**:
    Unauthenticated user or non-admin authenticated user attempts `get` or `list` on `/admins`.
