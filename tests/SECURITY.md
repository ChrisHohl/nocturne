# Nocturne cloud data review

Data lives only at users/{uid}/tasks/{taskId}. The app listens to that user's collection without a cross-user query. There are no public profiles, owner fields, shared collections, counters, or reference paths. Authentication comes from Firebase, and anonymous accounts are rejected. The parent user document is intentionally not used or required.

Schema: text string 1..240 characters, Personal/Work category, boolean done, immutable creation timestamp, updatedAt equal to server request time. Creates and updates share the same validator, reject missing or extra fields, and enforce timestamp types. Task IDs cannot exceed 128 characters. Deletes require owner access.

Emulator attack coverage in test.mjs: unauthenticated list/write, anonymous create, other-account get/list/create/update/delete, oversized text, text and done type changes, invalid category, forged ownerId/admin fields, schema pollution, creation timestamp modification, forged update timestamp, required-field omission, nested path access, and user profile access. Positive cases verify same-account independent-session realtime changes, simultaneous additions, both completion transitions, repeated import without replacing newer data, and bulk deletion.

Not applicable: counter replay, negative monetary values, public/private field mixing, resource reference traversal, and privileged role transitions; those fields and collections do not exist. A missing parent user document does not grant access to another UID's tasks. The only ownership property is the authenticated UID in the document path.

Remaining limits: no global per-user task quota and no App Check enforcement. Client memory cache may queue writes offline; the UI tells users to keep the tab open until synced. Firebase rules and query compatibility are tested with the local emulator before production deployment.

