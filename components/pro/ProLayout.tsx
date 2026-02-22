import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  FileText,
  Calendar,
  Download,
  Share2,
  User,
  LogOut,
  ChevronRight,
  Menu,
  ArrowLeftRight,
} from 'lucide-react';
import type { ProfessionalProfile, UserRole } from '../../types';
import type { User as FirebaseUser } from 'firebase/auth';

const BILLHIPPO_LOGO =
  'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

export type ProView =
  | 'dashboard'
  | 'clients'
  | 'reports'
  | 'filings'
  | 'downloads'
  | 'referrals'
  | 'profile';

const NAV_ITEMS: { id: ProView; icon: React.ElementType; label: string }[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'clients',   icon: Users,           label: 'My Clients' },
  { id: 'reports',   icon: FileText,        label: 'GST Reports' },
  { id: 'filings',   icon: Calendar,        label: 'Filing Tracker' },
  { id: 'downloads', icon: Download,        label: 'Bulk Downloads' },
  { id: 'referrals', icon: Share2,          label: 'Referrals' },
  { id: 'profile',   icon: User,            label: 'Profile' },
];

interface ProLayoutProps {
  activeView: ProView;
  setActiveView: (view: ProView) => void;
  user: FirebaseUser;
  profile: ProfessionalProfile | null;
  onLogout: () => void;
  children: React.ReactNode;
  /** Passed from App.tsx; used to show the role-switcher for 'both' accounts */
  role?: UserRole | null;
}

const ProLayout: React.FC<ProLayoutProps> = ({
  activeView,
  setActiveView,
  user,
  profile,
  onLogout,
  children,
  role,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : user.displayName || user.email?.split('@')[0] || 'Professional';

  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen flex bg-[#f8fafc] selection:bg-emerald-100 selection:text-emerald-700">
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-[260px] flex flex-col
          bg-white border-r border-slate-100
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="px-6 pt-6 pb-3">
          <img
            src={BILLHIPPO_LOGO}
            alt="BillHippo"
            className="h-10 w-auto object-contain"
          />
          <span className="mt-2 inline-block px-2.5 py-0.5 bg-emerald-50 border border-emerald-100 rounded-full text-[9px] font-bold font-poppins text-emerald-600 uppercase tracking-widest">
            PRO
          </span>
        </div>

        {/* Professional identity */}
        <div className="px-6 pb-5 border-b border-slate-50">
          <p className="text-sm font-bold text-slate-800 font-poppins truncate">{displayName}</p>
          {profile?.designation && (
            <p className="text-xs text-slate-400 font-poppins mt-0.5 truncate">{profile.designation}</p>
          )}
          {profile?.professionalId && (
            <p className="text-[10px] text-slate-300 font-poppins font-bold tracking-widest mt-1 uppercase">
              {profile.professionalId}
            </p>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveView(item.id);
                  setIsOpen(false);
                }}
                className={`
                  w-full flex items-center justify-between px-4 py-3 rounded-2xl
                  transition-all duration-200 group
                  ${isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}
                `}
              >
                <div className="flex items-center gap-3">
                  <item.icon
                    size={18}
                    className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-emerald-600'}
                    style={{ transition: 'color 0.2s' }}
                  />
                  <span className="text-sm font-semibold font-poppins">{item.label}</span>
                </div>
                {isActive && <ChevronRight size={15} />}
              </button>
            );
          })}
        </nav>

        {/* Bottom: role-switcher (if dual-account) + Sign Out + version */}
        <div className="p-4 border-t border-slate-50 space-y-1">
          {/* Switch to Business Portal — only for dual-account users */}
          {role === 'both' && (
            <button
              onClick={() => { window.location.hash = '/biz/dashboard'; }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[#4c2de0] hover:bg-indigo-50 transition-all duration-200 text-sm font-semibold font-poppins border border-indigo-100"
            >
              <ArrowLeftRight size={16} className="flex-shrink-0" />
              Switch to Business Portal
            </button>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all duration-200 text-sm font-semibold font-poppins"
          >
            <LogOut size={16} />
            Sign Out
          </button>
          <p className="text-center text-[9px] text-slate-200 font-bold font-poppins uppercase tracking-widest mt-2">
            BillHippo Pro
          </p>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100">
          <button
            onClick={() => setIsOpen(true)}
            className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-600"
          >
            <Menu size={20} />
          </button>
          <span className="text-xs font-bold font-poppins text-emerald-600 uppercase tracking-widest">
            BillHippo Professional
          </span>
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white font-bold text-sm font-poppins">
            {initials}
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 px-4 md:px-10 py-8 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
};

export default ProLayout;
