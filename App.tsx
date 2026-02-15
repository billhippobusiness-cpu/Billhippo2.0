
import React, { useState, useEffect } from 'react';
import { LayoutDashboard } from 'lucide-react';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import InvoiceGenerator from './components/InvoiceGenerator';
import LedgerView from './components/LedgerView';
import GSTReports from './components/GSTReports';
import MediaStudio from './components/MediaStudio';
import Sidebar from './components/Sidebar';
import ProfileSettings from './components/ProfileSettings';
import InvoiceTheme from './components/InvoiceTheme';

const App: React.FC = () => {
  const [view, setView] = useState<'landing' | 'app'>('landing');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    document.body.className = "bg-[#f8fafc] text-slate-900 overflow-x-hidden antialiased";
  }, []);

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

  if (view === 'landing') {
    return <LandingPage onEnterApp={() => setView('app')} />;
  }

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
