import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, type DocumentReference } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { UserRole, BusinessProfile, ProfessionalProfile } from '../types';

export interface UseProfessionalAuthReturn {
  user: User | null;
  role: UserRole | null;
  businessProfile: BusinessProfile | null;
  professionalProfile: ProfessionalProfile | null;
  loading: boolean;
  /** Re-reads Firestore role/profile documents without waiting for an auth event. */
  refreshRole: () => Promise<void>;
}

/**
 * Reads the current Firebase Auth user and resolves their role(s) by checking:
 *   - users/{uid}                       → exists  ⟹ 'business'
 *   - users/{uid}/professional/main     → exists  ⟹ 'professional'
 *   - both exist                        ⟹ 'both'
 *   - neither exists                    ⟹ null (new / unregistered user)
 *
 * Also fetches the full BusinessProfile from users/{uid}/profile/main and
 * the ProfessionalProfile document from users/{uid}/professional/main.
 *
 * Resilience notes:
 *   - Each Firestore read is wrapped in its own try/catch so a security-rule
 *     denial on one collection (e.g. professionals/ for a pure business user)
 *     never poisons the other read.
 *   - Legacy users who were created before the top-level users/{uid} document
 *     was introduced are detected via a fallback read of users/{uid}/profile/main.
 *     If found, the missing top-level document is auto-created (self-heal).
 */
export function useProfessionalAuth(): UseProfessionalAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [professionalProfile, setProfessionalProfile] = useState<ProfessionalProfile | null>(null);

  // Start as true when Firebase already has a persisted session (auth.currentUser
  // is synchronously available) so the app goes straight to the spinner rather
  // than briefly flashing the LandingPage or OnboardingWizard before the
  // onAuthStateChanged callback resolves the professional role.
  // Start as false for unauthenticated visitors so they see the landing page
  // immediately without a full-screen spinner.
  const [loading, setLoading] = useState(() => auth.currentUser !== null);

  // Helper: read a Firestore document without throwing on permission errors.
  // A denied read is treated as "document does not exist" rather than a
  // hard failure, which prevents one collection's security rules from
  // blocking role resolution for the other collection.
  const safeGet = async (ref: DocumentReference) => {
    try {
      return await getDoc(ref);
    } catch (err) {
      console.warn('[useProfessionalAuth] safeGet denied:', (ref as any).path ?? ref, err);
      return null;
    }
  };

  // Core resolution logic — extracted so it can be called both from
  // onAuthStateChanged and from the manual refreshRole() function.
  const resolveForUser = useCallback(async (firebaseUser: User) => {
    setLoading(true);
    try {
      // Read both top-level identity documents in parallel.
      const [userSnap, professionalSnap] = await Promise.all([
        safeGet(doc(db, 'users', firebaseUser.uid)),
        safeGet(doc(db, 'users', firebaseUser.uid, 'professional', 'main')),
      ]);

      let isBusinessUser = userSnap?.exists() ?? false;
      const isProfessional = professionalSnap?.exists() ?? false;

      // ── Legacy-user fallback ──────────────────────────────────────────
      // Some users authenticated before the top-level users/{uid} document
      // was introduced. Their business data lives only in the
      // users/{uid}/profile/main subcollection. If neither top-level doc
      // was found, check the subcollection and self-heal.
      let cachedProfileSnap: Awaited<ReturnType<typeof getDoc>> | null = null;

      if (!isBusinessUser && !isProfessional) {
        try {
          const legacySnap = await getDoc(
            doc(db, 'users', firebaseUser.uid, 'profile', 'main'),
          );
          if (legacySnap.exists()) {
            isBusinessUser = true;
            cachedProfileSnap = legacySnap;

            // Self-heal: create the missing top-level document so future
            // logins resolve correctly without this fallback path.
            await setDoc(
              doc(db, 'users', firebaseUser.uid),
              {
                email: firebaseUser.email,
                displayName: firebaseUser.displayName,
                photoURL: firebaseUser.photoURL ?? null,
                createdAt: serverTimestamp(),
                plan: 'free',
                migratedAt: serverTimestamp(),
              },
              { merge: true },
            );
          }
        } catch (legacyErr) {
          console.warn(
            '[useProfessionalAuth] Legacy profile fallback failed:',
            legacyErr,
          );
        }
      }

      // ── Determine composite role ──────────────────────────────────────
      if (isBusinessUser && isProfessional) {
        setRole('both');
      } else if (isProfessional) {
        setRole('professional');
      } else if (isBusinessUser) {
        setRole('business');
      } else {
        setRole(null);
      }

      // ── Fetch detailed BusinessProfile ────────────────────────────────
      if (isBusinessUser) {
        // Re-use the snap we already fetched in the legacy fallback if available.
        const profileSnap =
          cachedProfileSnap ??
          (await safeGet(doc(db, 'users', firebaseUser.uid, 'profile', 'main')));
        setBusinessProfile(
          profileSnap?.exists() ? (profileSnap.data() as BusinessProfile) : null,
        );
      } else {
        setBusinessProfile(null);
      }

      // ── Set ProfessionalProfile ───────────────────────────────────────
      if (isProfessional && professionalSnap?.exists()) {
        setProfessionalProfile(professionalSnap.data() as ProfessionalProfile);
      } else {
        setProfessionalProfile(null);
      }
    } catch (error) {
      console.error('[useProfessionalAuth] Error resolving user role:', error);
      setRole(null);
      setBusinessProfile(null);
      setProfessionalProfile(null);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (!firebaseUser) {
        setRole(null);
        setBusinessProfile(null);
        setProfessionalProfile(null);
        setLoading(false);
        return;
      }

      // Authenticated user found — show loading while we resolve their role.
      await resolveForUser(firebaseUser);
    });

    return unsubscribe;
  }, [resolveForUser]);

  // Manually re-read Firestore role/profile documents without waiting for an
  // auth event. Call this after a wizard completes or profile data is saved
  // so the in-memory state reflects the new Firestore state immediately.
  const refreshRole = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      await resolveForUser(currentUser);
    }
  }, [resolveForUser]);

  return { user, role, businessProfile, professionalProfile, loading, refreshRole };
}
