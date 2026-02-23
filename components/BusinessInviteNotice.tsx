import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Building2, Briefcase, ShieldCheck, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { subscribePendingInvitesByEmail } from '../lib/firestore';
import type { ProfessionalInvite } from '../types';

interface BusinessInviteNoticeProps {
  userEmail: string;
}

/**
 * Shown inside the BUSINESS dashboard when a business-only user has received
 * professional assignment invites by email.  Prompts them to register as a
 * professional so they can accept the assignment and access the Pro Portal.
 */
const BusinessInviteNotice: React.FC<BusinessInviteNoticeProps> = ({ userEmail }) => {
  const [invites, setInvites] = useState<ProfessionalInvite[]>([]);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!userEmail) return;
    const unsub = subscribePendingInvitesByEmail(userEmail, setInvites);
    return unsub;
  }, [userEmail]);

  if (invites.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-8 bg-white border border-amber-200 rounded-[1.75rem] p-6 shadow-sm shadow-amber-50"
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center">
              <Bell size={18} className="text-amber-600" />
            </div>
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
              {invites.length}
            </span>
          </div>
          <div className="text-left">
            <p className="text-sm font-bold font-poppins text-slate-800">
              You've been assigned as a Professional
            </p>
            <p className="text-xs text-slate-400 font-poppins mt-0.5">
              {invites.length} business client{invites.length > 1 ? 's have' : ' has'} invited you — register your professional account to accept
            </p>
          </div>
        </div>
        {expanded
          ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0" />
          : <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />}
      </button>

      {/* Invite cards */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="invites"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-5 space-y-4 overflow-hidden"
          >
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="border border-amber-100 bg-amber-50/50 rounded-2xl p-4 space-y-3"
              >
                {/* Business info */}
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Building2 size={15} className="text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold font-poppins text-slate-800 truncate">
                      {invite.businessName}
                    </p>
                    <p className="text-[10px] text-slate-400 font-poppins mt-0.5">
                      Invited: {invite.professionalFirstName} {invite.professionalLastName}
                    </p>
                  </div>
                </div>

                {/* Pills */}
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold font-poppins uppercase tracking-wide px-2.5 py-1 bg-white border border-amber-100 text-amber-700 rounded-full">
                    <Briefcase size={10} />
                    {invite.designation}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold font-poppins uppercase tracking-wide px-2.5 py-1 bg-white border border-amber-100 text-amber-700 rounded-full">
                    <ShieldCheck size={10} />
                    {invite.accessLevel}
                  </span>
                  <span className="text-[10px] text-slate-400 font-poppins self-center ml-auto">
                    Expires {new Date(invite.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            ))}

            {/* CTA */}
            <div className="pt-1">
              <p className="text-xs text-slate-500 font-poppins mb-3">
                To accept these assignments, create your BillHippo Professional account using this same email address ({userEmail}).
                You'll be able to access both your Business and Professional portals after registration.
              </p>
              <button
                onClick={() => { window.location.hash = '/pro-register'; }}
                className="inline-flex items-center gap-2 bg-emerald-600 text-white text-sm font-bold font-poppins px-6 py-3 rounded-2xl shadow-md shadow-emerald-100 hover:bg-emerald-700 hover:scale-105 active:scale-95 transition-all"
              >
                Register as Professional
                <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default BusinessInviteNotice;
