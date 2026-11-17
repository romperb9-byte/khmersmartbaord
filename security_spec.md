# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. A `UserProfile` document at `/users/{userId}` can only be read or written by the authenticated, email-verified user whose `request.auth.uid == userId`, with `uid == userId` and immutable `createdAt`.
2. A `WhiteboardProject` at `/boards/{boardId}` must belong to an authenticated, email-verified owner (`ownerId == request.auth.uid`), with `ownerId` and `createdAt` immutable on update.
3. A `WhiteboardPage` at `/boards/{boardId}/pages/{pageId}` cannot exist without a valid parent `/boards/{boardId}` whose `ownerId == request.auth.uid` (Master Gate via `get()`), and `boardId == boardId` in payload.
4. A `ProjectHistoryEntry` at `/boards/{boardId}/history/{historyId}` cannot exist without a valid parent `/boards/{boardId}` whose `ownerId == request.auth.uid`, and history entries are append-only (no update; owner can delete when deleting board or pruning history).
5. All document IDs (`userId`, `boardId`, `pageId`, `historyId`) must match `^[a-zA-Z0-9_\\-]+$` and length `<= 128`.
6. All string fields must have explicit `.size()` upper bounds, arrays must have `.size() <= MAX` bounds and first-element type validation, and timestamps (`createdAt`, `updatedAt`) must equal `request.time`.

## 2. Dirty Dozen Attack Payloads (All Must Return PERMISSION_DENIED)
1. Unauthenticated read or write on `/boards/{boardId}`.
2. Unverified email user (`email_verified == false`) attempting to create `/boards/{boardId}`.
3. Identity spoofing: User A creating `/boards/b1` with `ownerId: "userB"`.
4. Shadow field injection: Creating `/boards/b1` with extra ghost key `isAdmin: true` or `isFeatured: true`.
5. Path ID poisoning: Creating `/boards/invalid..id$$` or 500-char ID.
6. Oversized title / thumbnail DoS: Creating `/boards/b1` with `title` > 120 chars or `thumbnailDataUrl` > 120,000 chars.
7. Timestamp spoofing: Creating `/boards/b1` with backdated `createdAt` not equal to `request.time`.
8. Immutable field tampering: Updating `/boards/b1` to change `ownerId` or `createdAt`.
9. Cross-user list scraping: User A running a `list` query on `/boards` without `where("ownerId", "==", userA)`.
10. Orphaned subcollection write: Creating `/boards/nonexistent/pages/p1` when parent board does not exist.
11. Cross-owner subcollection write: User B creating `/boards/boardOwnedByA/pages/p1` even if setting `ownerId: userB`.
12. Array flooding / untyped element: Creating `/boards/b1/pages/p1` with `items` > 500 elements or `items[0]` as a raw string instead of a map.
