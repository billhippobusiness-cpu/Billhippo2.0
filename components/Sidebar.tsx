
import React from 'react';
import { LayoutDashboard, IndianRupee, Users, FileText, Settings, LogOut, ChevronRight, Palette, UserCircle } from 'lucide-react';
import { type User } from 'firebase/auth';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isDarkMode: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  user?: User | null;
  onLogout?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isOpen, setIsOpen, user, onLogout }) => {
  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
    { id: 'customers', icon: UserCircle, label: 'Customers' },
    { id: 'ledger', icon: Users, label: 'Parties & Ledger' },
    { id: 'invoices', icon: IndianRupee, label: 'Invoice Maker' },
    { id: 'gst', icon: FileText, label: 'Tax Reports' },
    { id: 'theme', icon: Palette, label: 'Invoice Theme' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Admin User';
  const displayEmail = user?.email || 'billing@billhippo.in';
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <aside className={`
      fixed lg:static inset-y-0 left-0 z-50 w-72 transform transition-all duration-400 ease-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      bg-white border-r border-slate-100 flex flex-col
    `}>
      <div className="p-8 flex items-center gap-3">
        <img src={BILLHIPPO_LOGO} alt="BillHippo" className="w-10 h-10 rounded-xl object-contain" />
        <div>
          <h1 className="text-2xl font-bold font-poppins tracking-tight text-slate-800 leading-none">BillHippo</h1>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mt-1 font-poppins">Smart Business OS</p>
        </div>
      </div>

      <nav className="flex-1 px-4 mt-8 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveTab(item.id);
              setIsOpen(false);
            }}
            className={`
              w-full flex items-center justify-between px-6 py-4 rounded-2xl transition-all duration-300 group
              ${activeTab === item.id
                ? 'bg-profee-blue text-white active-tab-glow translate-x-1'
                : 'text-slate-500 hover:bg-slate-50'}
            `}
          >
            <div className="flex items-center gap-4">
              <item.icon size={22} className={activeTab === item.id ? 'text-white' : 'text-slate-400 group-hover:text-profee-blue'} />
              <span className="font-semibold text-base tracking-tight font-poppins">{item.label}</span>
            </div>
            {activeTab === item.id && <ChevronRight size={18} />}
          </button>
        ))}
      </nav>

      <div className="p-6 border-t border-slate-50">
        <div className="bg-slate-50 rounded-[2rem] p-6 flex items-center gap-3 border border-transparent group">
          <div className="w-12 h-12 rounded-2xl bg-profee-blue flex items-center justify-center text-white font-bold text-lg font-poppins">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-base text-slate-800 truncate font-poppins">{displayName}</h4>
            <p className="text-xs text-slate-400 truncate font-medium font-poppins">{displayEmail}</p>
            <div className="flex items-center gap-3 mt-2 font-poppins">
               <button onClick={() => setActiveTab('settings')} className="text-xs font-bold text-profee-blue hover:underline">Edit Info</button>
               <div className="w-1 h-1 rounded-full bg-slate-300"></div>
               <button onClick={onLogout} className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors">Logout</button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
