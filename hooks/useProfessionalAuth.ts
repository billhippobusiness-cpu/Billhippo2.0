import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { UserRole, BusinessProfile, ProfessionalProfile } from '../types';

export interface UseProfessionalAuthReturn {
  user: User | null;
  role: UserRole | null;
  businessProfile: BusinessProfile | null;
  professionalProfile: ProfessionalProfile | null;
  loading: boolean;
}

/**
 * Reads the current Firebase Auth user and resolves their role(s) by checking:
 *   - users/{uid}         → exists  ⟹ 'business'
 *   - professionals/{uid} → exists  ⟹ 'professional'
 *   - both exist          ⟹ 'both'
 *   - neither exists      ⟹ null (new / unregistered user)
 *
 * Also fetches the full BusinessProfile from users/{uid}/profile/main and
 * the ProfessionalProfile document from professionals/{uid}.
 */
export function useProfessionalAuth(): UseProfessionalAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [professionalProfile, setProfessionalProfile] = useState<ProfessionalProfile | null>(null);
  const [loading, setLoading] = useState(true);

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

      try {
        // Parallel fetch of both top-level identity documents
        const [userSnap, professionalSnap] = await Promise.all([
          getDoc(doc(db, 'users', firebaseUser.uid)),
          getDoc(doc(db, 'professionals', firebaseUser.uid)),
        ]);

        const isBusinessUser = userSnap.exists();
        const isProfessional = professionalSnap.exists();

        // Determine composite role
        if (isBusinessUser && isProfessional) {
          setRole('both');
        } else if (isProfessional) {
          setRole('professional');
        } else if (isBusinessUser) {
          setRole('business');
        } else {
          setRole(null);
        }

        // Fetch the detailed BusinessProfile subcollection document
        if (isBusinessUser) {
          const profileSnap = await getDoc(
            doc(db, 'users', firebaseUser.uid, 'profile', 'main'),
          );
          setBusinessProfile(
            profileSnap.exists() ? (profileSnap.data() as BusinessProfile) : null,
          );
        } else {
          setBusinessProfile(null);
        }

        // Set ProfessionalProfile from the top-level document
        if (isProfessional) {
          setProfessionalProfile(professionalSnap.data() as ProfessionalProfile);
        } else {
          setProfessionalProfile(null);
        }
      } catch (error) {
        console.error('[useProfessionalAuth] Error fetching user profiles:', error);
        setRole(null);
        setBusinessProfile(null);
        setProfessionalProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  return { user, role, businessProfile, professionalProfile, loading };
}
