
import React, { useState, useEffect } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import LandingPage from './components/LandingPage';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';
import InvoiceGenerator from './components/InvoiceGenerator';
import GSTReports from './components/GSTReports';
import Sidebar from './components/Sidebar';
import ProfileSettings from './components/ProfileSettings';
import InvoiceTheme from './components/InvoiceTheme';
import CustomerManager from './components/CustomerManager';
import OnboardingWizard from './components/OnboardingWizard';
import InventoryManager from './components/InventoryManager';
import CreditDebitNotes from './components/CreditDebitNotes';
import ProDashboard from './components/ProDashboard';
import ProRegister from './components/pro/ProRegister';

const App: React.FC = () => {
  const {
    user,
    role,
    loading,
    businessProfile,
    professionalProfile,
    signIn,
    signUp,
    signInWithGoogle,
    logOut,
    resetPassword,
  } = useAuth();

  const [view, setView] = useState<'landing' | 'auth'>('landing');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Hash-based routing — tracks window.location.hash so we can render
  // /pro-register without a third-party router.
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    document.body.className = 'bg-[#f8fafc] text-slate-900 overflow-x-hidden antialiased';
  }, []);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // When a user signs in, reset any lingering auth error.
  useEffect(() => {
    if (user) setAuthError(null);
  }, [user]);

  // ── Auth handlers ────────────────────────────────────────────────────────

  const handleLogin = async (email: string, password: string) => {
    setAuthError(null);
    try {
      await signIn(email, password);
    } catch (err: any) {
      setAuthError(err.message?.replace('Firebase: ', '') || 'Login failed. Please try again.');
    }
  };

  const handleSignUp = async (email: string, password: string, name: string) => {
    setAuthError(null);
    try {
      await signUp(email, password, name);
    } catch (err: any) {
      setAuthError(err.message?.replace('Firebase: ', '') || 'Sign up failed. Please try again.');
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      const code = err.code || '';
      if (code === 'auth/unauthorized-domain') {
        setAuthError(
          'This domain is not authorized for Google sign-in. Please add it to Firebase Console → Authentication → Settings → Authorized domains.',
        );
      } else {
        setAuthError(err.message?.replace('Firebase: ', '') || 'Google login failed.');
      }
    }
  };

  const handleResetPassword = async (email: string) => {
    await resetPassword(email);
  };

  const handleLogout = async () => {
    await logOut();
    setView('landing');
  };

  const handleCreateProAccount = () => {
    window.location.hash = '/pro-register';
  };

  const handleGoToSignIn = () => {
    window.location.hash = '';
    setView('auth');
  };

  // ── Hash-based route: /pro-register ─────────────────────────────────────
  // Rendered before auth checks so any visitor can reach the registration page.

  if (hash === '#/pro-register') {
    return <ProRegister onGoToSignIn={handleGoToSignIn} />;
  }

  // ── Loading spinner ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#4c2de0] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-bold text-slate-400 font-poppins uppercase tracking-widest">
            Loading BillHippo…
          </p>
        </div>
      </div>
    );
  }

  // ── No user: landing / auth ──────────────────────────────────────────────

  if (!user) {
    if (view === 'landing') {
      return <LandingPage onEnterApp={() => setView('auth')} />;
    }
    return (
      <AuthPage
        onLogin={handleLogin}
        onSignUp={handleSignUp}
        onGoogleLogin={handleGoogleLogin}
        onResetPassword={handleResetPassword}
        onCreateProAccount={handleCreateProAccount}
        error={authError}
      />
    );
  }

  // ── User authenticated: role-based routing ───────────────────────────────

  // role === null means the user exists in Firebase Auth but has no matching
  // Firestore document in either users/ or professionals/.
  // This can happen for:
  //   • Brand-new Google sign-ins before onboarding completes.
  //   • Legacy accounts where the top-level users/{uid} doc is missing
  //     (useProfessionalAuth's self-heal should have fixed it on this load,
  //      but the role will still be null until the next auth state update).
  // Safe fallback: send to onboarding so they can set up their profile.
  if (role === null) {
    return (
      <OnboardingWizard
        userId={user.uid}
        userName={user.displayName || ''}
        userEmail={user.email || ''}
        onComplete={() => {
          // After the wizard writes profile/main, AuthContext's next
          // onAuthStateChanged cycle will re-resolve the role correctly.
        }}
      />
    );
  }

  // role === 'professional' → Pro Dashboard
  if (role === 'professional') {
    return (
      <ProDashboard
        user={user}
        profile={professionalProfile}
        onLogout={handleLogout}
      />
    );
  }

  // role === 'business' or 'both' → existing business dashboard flow
  // (for 'both', go to business dashboard; role-switcher comes in P-12)

  // New business user with no profile → onboarding
  if (!businessProfile || !businessProfile.name) {
    return (
      <OnboardingWizard
        userId={user.uid}
        userName={user.displayName || ''}
        userEmail={user.email || ''}
        onComplete={() => {
          // AuthContext will re-fetch businessProfile automatically on next
          // Firestore write; force a soft re-render by toggling nothing—
          // the profile will appear in the next context update.
        }}
      />
    );
  }

  // ── Main business app ────────────────────────────────────────────────────

  const renderContent = () => {
    const userId = user.uid;
    switch (activeTab) {
      case 'dashboard':  return <Dashboard userId={userId} />;
      case 'customers':  return <CustomerManager userId={userId} />;
      case 'invoices':   return <InvoiceGenerator userId={userId} />;
      case 'notes':      return <CreditDebitNotes userId={userId} />;
      case 'gst':        return <GSTReports userId={userId} />;
      case 'theme':      return <InvoiceTheme userId={userId} />;
      case 'settings':   return <ProfileSettings userId={userId} onBusinessTypeChange={() => {}} />;
      case 'inventory':  return <InventoryManager userId={userId} />;
      default:           return <Dashboard userId={userId} />;
    }
  };

  return (
    <div className="min-h-screen flex selection:bg-indigo-100 selection:text-indigo-700">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDarkMode={false}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        user={user}
        onLogout={handleLogout}
        showInventory={businessProfile?.businessType === 'trading'}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <div className="px-4 md:px-12 py-10 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto">{renderContent()}</div>
        </div>
      </main>

      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="lg:hidden fixed bottom-6 right-6 z-[100] w-14 h-14 rounded-2xl bg-[#4c2de0] text-white shadow-xl shadow-indigo-200 flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
      >
        <LayoutDashboard size={24} />
      </button>
    </div>
  );
};

export default App;
