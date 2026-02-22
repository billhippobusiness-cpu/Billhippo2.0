import React from 'react';
import { motion } from 'framer-motion';
import { Briefcase, Users, FileText, LogOut } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { ProfessionalProfile } from '../types';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

interface ProDashboardProps {
  user: User;
  profile: ProfessionalProfile | null;
  onLogout: () => void;
}

const ProDashboard: React.FC<ProDashboardProps> = ({ user, profile, onLogout }) => {
  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : (user.displayName || user.email || 'Professional');

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      {/* Top Nav */}
      <header className="bg-white border-b border-slate-100 shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={BILLHIPPO_LOGO} alt="BillHippo" className="h-8 w-auto object-contain" />
          <span className="text-xs font-bold font-poppins text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
            Professional Portal
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500 font-poppins hidden sm:block">{displayName}</span>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-xs font-bold font-poppins text-slate-400 hover:text-rose-500 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-6 py-10 max-w-4xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-2xl font-bold text-slate-900 font-poppins mb-1">
            Welcome, {displayName}
          </h1>
          {profile?.designation && (
            <p className="text-sm text-slate-400 font-poppins mb-8">{profile.designation}</p>
          )}

          {/* Coming Soon Banner */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 mb-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <Briefcase className="w-6 h-6 text-emerald-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 font-poppins mb-1">Pro Dashboard Coming Soon</h2>
            <p className="text-sm text-slate-500 font-poppins">
              Your professional portal is being built. You'll have read-only GST data access for all your linked clients.
            </p>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-poppins">Linked Clients</p>
                <p className="text-xl font-bold text-slate-900 font-poppins">
                  {profile?.linkedClients?.length ?? 0}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-[#4c2de0]" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-poppins">Professional ID</p>
                <p className="text-sm font-bold text-slate-900 font-poppins">
                  {profile?.professionalId ?? '—'}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default ProDashboard;
