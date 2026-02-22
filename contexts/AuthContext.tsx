import React, { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';
import {
  signIn,
  signUp,
  signInWithGoogle,
  logOut,
  resetPassword,
} from '../lib/auth';
import { useProfessionalAuth } from '../hooks/useProfessionalAuth';
import type { UserRole, BusinessProfile, ProfessionalProfile } from '../types';

// ── Context shape ─────────────────────────────────────────────────────────

interface AuthContextValue {
  /** The currently authenticated Firebase user, or null if signed out. */
  user: User | null;

  /**
   * The user's resolved role:
   *   'business'     – registered as a business only
   *   'professional' – registered as a professional only
   *   'both'         – holds both identities
   *   null           – not registered / new user
   */
  role: UserRole | null;

  /** Full business profile from users/{uid}/profile/main, or null. */
  businessProfile: BusinessProfile | null;

  /** Full professional profile from professionals/{uid}, or null. */
  professionalProfile: ProfessionalProfile | null;

  /** True while the initial auth state and Firestore lookups are in flight. */
  loading: boolean;

  // ── Auth actions (preserve existing app behaviour) ─────────────────────
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string, displayName: string) => Promise<User>;
  signInWithGoogle: () => Promise<User>;
  logOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

// ── Context instance ──────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, role, businessProfile, professionalProfile, loading } =
    useProfessionalAuth();

  const value: AuthContextValue = {
    user,
    role,
    businessProfile,
    professionalProfile,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    logOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Consumer hook ─────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
