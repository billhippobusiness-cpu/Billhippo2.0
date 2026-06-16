/**
 * Tally connector pairing — Cloud Functions.
 *
 * Lets the BillHippo Desktop Connector authenticate as a user WITHOUT shipping
 * any service-account key to the client PC:
 *
 *   1. tallyCreatePairingCode (auth required) — the signed-in web user generates
 *      a short-lived, single-use pairing code. We store it server-side in the
 *      locked `tallyPairings/{code}` collection mapped to their uid.
 *   2. tallyExchangePairingCode (no auth) — the connector submits the code the
 *      user pasted in. We validate it (exists / unused / unexpired), mint a
 *      Firebase custom token for that uid, mark the code used, and return the
 *      token. The connector signs in with it and refreshes normally thereafter.
 *
 * `tallyPairings` has NO client security rule, so only Admin SDK (these
 * functions) can read/write it.
 */

import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// Codes are short (user types them) but single-use and expire fast.
const PAIRING_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PAIRING_CODE_LENGTH = 8;
// No ambiguous characters (0/O, 1/I/L) so the code is easy to read & type.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  let out = "";
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Generate a single-use pairing code for the calling user.
 * Returns { code, expiresAt } — the web app displays the code for the user to
 * paste into the connector.
 */
export const tallyCreatePairingCode = onCall(
  { region: "asia-south1" },
  async (request: CallableRequest) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Please sign in to generate a pairing code.");
    }

    const db = getFirestore();
    const now = Date.now();
    const expiresAt = now + PAIRING_CODE_TTL_MS;

    // Retry a few times in the (vanishingly unlikely) event of a code collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const ref = db.collection("tallyPairings").doc(code);
      const existing = await ref.get();
      if (existing.exists) continue;
      await ref.set({
        uid,
        used: false,
        createdAt: Timestamp.fromMillis(now),
        expiresAt: Timestamp.fromMillis(expiresAt),
      });
      // Mirror the active code on the user's config for display/heartbeat UX.
      await db.doc(`users/${uid}/tallyConfig/main`).set(
        { pairingCode: code, pairingCodeExpiresAt: expiresAt },
        { merge: true },
      );
      return { code, expiresAt };
    }

    throw new HttpsError("internal", "Could not allocate a pairing code, please retry.");
  },
);

/**
 * Exchange a pairing code (typed into the connector) for a Firebase custom
 * token. Called by the connector, which is NOT yet authenticated — hence no
 * auth requirement. The code itself is the bearer credential.
 */
export const tallyExchangePairingCode = onCall(
  { region: "asia-south1" },
  async (request: CallableRequest<{ code?: string }>) => {
    const code = (request.data?.code || "").trim().toUpperCase();
    if (!code) {
      throw new HttpsError("invalid-argument", "A pairing code is required.");
    }

    const db = getFirestore();
    const ref = db.collection("tallyPairings").doc(code);

    // Validate + consume atomically so a code can never be redeemed twice.
    const uid = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new HttpsError("not-found", "Invalid pairing code.");
      }
      const data = snap.data() as {
        uid: string;
        used: boolean;
        expiresAt: Timestamp;
      };
      if (data.used) {
        throw new HttpsError("failed-precondition", "This pairing code has already been used.");
      }
      if (data.expiresAt.toMillis() < Date.now()) {
        throw new HttpsError("deadline-exceeded", "This pairing code has expired. Generate a new one.");
      }
      tx.update(ref, { used: true, usedAt: Timestamp.now() });
      return data.uid;
    });

    // Mint a custom token; the `tallyConnector` claim lets us distinguish
    // connector sessions in audit/rules later if needed.
    const token = await getAuth().createCustomToken(uid, { tallyConnector: true });

    // Clear the displayed code from the user's config — it's now consumed.
    await db.doc(`users/${uid}/tallyConfig/main`).set(
      { pairingCode: null, pairingCodeExpiresAt: null },
      { merge: true },
    );

    return { token };
  },
);
