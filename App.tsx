
import React, { useState, useEffect } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { type User } from 'firebase/auth';
import { onAuthChange } from './lib/auth';
import { signIn, signUp, signInWithGoogle, logOut } from './lib/auth';
import LandingPage from './components/LandingPage';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';
import InvoiceGenerator from './components/InvoiceGenerator';
import LedgerView from './components/LedgerView';
import GSTReports from './components/GSTReports';
import MediaStudio from './components/MediaStudio';
import Sidebar from './components/Sidebar';
import ProfileSettings from './components/ProfileSettings';
import InvoiceTheme from './components/InvoiceTheme';

const App: React.FC = () => {
  const [view, setView] = useState<'landing' | 'auth' | 'app'>('landing');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    document.body.className = "bg-[#f8fafc] text-slate-900 overflow-x-hidden antialiased";
  }, []);

  // Listen for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthChange((firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (firebaseUser) {
        setView('app');
      }
    });
    return unsubscribe;
  }, []);

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
      setAuthError(err.message?.replace('Firebase: ', '') || 'Google login failed.');
    }
  };

  const handleLogout = async () => {
    await logOut();
    setUser(null);
    setView('landing');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'invoices': return <InvoiceGenerator />;
      case 'ledger': return <LedgerView />;
      case 'gst': return <GSTReports />;
      case 'media': return <MediaStudio />;
      case 'theme': return <InvoiceTheme />;
      case 'settings': return <ProfileSettings />;
      default: return <Dashboard />;
    }
  };

  // Show loading spinner while checking auth state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#4c2de0] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-bold text-slate-400 font-poppins uppercase tracking-widest">Loading BillHippo...</p>
        </div>
      </div>
    );
  }

  // Landing page (marketing)
  if (view === 'landing' && !user) {
    return <LandingPage onEnterApp={() => setView('auth')} />;
  }

  // Auth page (login/signup)
  if (view === 'auth' && !user) {
    return (
      <AuthPage
        onLogin={handleLogin}
        onSignUp={handleSignUp}
        onGoogleLogin={handleGoogleLogin}
        error={authError}
      />
    );
  }

  // Main app (authenticated)
  return (
    <div className="min-h-screen flex selection:bg-indigo-100 selection:text-indigo-700">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDarkMode={false}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <div className="px-4 md:px-12 py-10 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto">
            {renderContent()}
          </div>
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
