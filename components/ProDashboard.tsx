/**
 * ProDashboard — top-level wrapper for the Professional Portal.
 * Manages the active view state and renders ProLayout + the appropriate
 * content component. Imported by App.tsx when role === 'professional'.
 */
import React, { useState } from 'react';
import { Briefcase } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { ProfessionalProfile } from '../types';
import ProLayout, { type ProView } from './pro/ProLayout';
import ProDashboardHome from './pro/ProDashboard';

interface ProDashboardProps {
  user: User;
  profile: ProfessionalProfile | null;
  onLogout: () => void;
}

// Placeholder for views not yet implemented
const ComingSoon: React.FC<{ title: string }> = ({ title }) => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="text-center">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
        <Briefcase size={24} className="text-emerald-400" />
      </div>
      <h2 className="text-lg font-bold text-slate-800 font-poppins mb-1">{title}</h2>
      <p className="text-sm text-slate-400 font-poppins">This section is coming soon.</p>
    </div>
  </div>
);

const ProDashboard: React.FC<ProDashboardProps> = ({ user, profile, onLogout }) => {
  const [activeView, setActiveView] = useState<ProView>('dashboard');

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard':
        return (
          <ProDashboardHome
            profile={profile}
            onOpenClient={() => setActiveView('reports')}
          />
        );
      case 'clients':
        return <ComingSoon title="My Clients" />;
      case 'reports':
        return <ComingSoon title="GST Reports" />;
      case 'filings':
        return <ComingSoon title="Filing Tracker" />;
      case 'downloads':
        return <ComingSoon title="Bulk Downloads" />;
      case 'referrals':
        return <ComingSoon title="Referrals" />;
      case 'profile':
        return <ComingSoon title="Profile" />;
      default:
        return null;
    }
  };

  return (
    <ProLayout
      activeView={activeView}
      setActiveView={setActiveView}
      user={user}
      profile={profile}
      onLogout={onLogout}
    >
      {renderContent()}
    </ProLayout>
  );
};

export default ProDashboard;
