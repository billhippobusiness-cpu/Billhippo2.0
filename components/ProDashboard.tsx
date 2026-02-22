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
import ProReports from './pro/ProReports';
import FilingTracker from './pro/FilingTracker';
import BulkDownloads from './pro/BulkDownloads';
import ProReferrals from './pro/ProReferrals';
import ProProfile from './pro/ProProfile';

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
  const [activeView,        setActiveView]        = useState<ProView>('dashboard');
  // Tracks which client was opened from the Dashboard "Open" button
  const [selectedClientUid, setSelectedClientUid] = useState<string>('');

  const handleOpenClient = (uid: string) => {
    setSelectedClientUid(uid);
    setActiveView('reports');
  };

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard':
        return (
          <ProDashboardHome
            profile={profile}
            onOpenClient={handleOpenClient}
            onNavigate={setActiveView}
          />
        );
      case 'clients':
        return <ComingSoon title="My Clients" />;
      case 'reports':
        return (
          <ProReports
            user={user}
            profile={profile}
            initialClientUid={selectedClientUid || undefined}
          />
        );
      case 'filings':
        return (
          <FilingTracker
            profile={profile}
            onViewReports={handleOpenClient}
          />
        );
      case 'downloads':
        return <BulkDownloads user={user} profile={profile} />;
      case 'referrals':
        return <ProReferrals profile={profile} />;
      case 'profile':
        return (
          <ProProfile
            user={user}
            profile={profile}
            onNavigate={setActiveView}
          />
        );
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
