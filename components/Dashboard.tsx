import React from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie 
} from 'recharts';
import { 
  HelpCircle, ArrowUpRight, ShoppingBag, Banknote, Clock, Users, 
  TrendingUp, ChevronLeft, ChevronRight, Bell, CheckCircle, 
  MoreHorizontal, ArrowDownRight, Activity
} from 'lucide-react';

const salesData = [
  { name: '01 Feb', sales: 4000, collections: 2400 },
  { name: '03 Feb', sales: 3000, collections: 1398 },
  { name: '05 Feb', sales: 2000, collections: 9800 },
  { name: '07 Feb', sales: 2780, collections: 3908 },
  { name: '09 Feb', sales: 1890, collections: 4800 },
  { name: '11 Feb', sales: 2390, collections: 3800 },
  { name: '13 Feb', sales: 3490, collections: 4300 },
];

const distributionData = [
  { name: 'Paid', value: 65, color: '#4c2de0' },
  { name: 'Unpaid', value: 25, color: '#f43f5e' },
  { name: 'Partial', value: 10, color: '#fbbf24' },
];

const MetricCard = ({ title, value, status, icon: Icon, color, tag, trendUp }: any) => (
  <div className="bg-white p-8 rounded-[2.5rem] card-shadow border border-slate-50 flex flex-col justify-between h-48 hover-glow transition-all duration-500 group relative overflow-hidden">
    <div className="flex justify-between items-start">
      <div className={`p-4 rounded-2xl ${color}`}>
        <Icon size={24} />
      </div>
      <div className="text-slate-300 group-hover:text-slate-500 flex items-center gap-2">
        <span className="text-[10px] font-bold tracking-widest uppercase">{tag}</span>
        <ArrowUpRight size={16} />
      </div>
    </div>
    <div>
      <p className="text-xs font-medium text-slate-400 mb-1">{title}</p>
      <div className="flex items-baseline gap-2">
        <h3 className="text-4xl font-bold font-poppins text-slate-800 tracking-tight">{value}</h3>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${trendUp ? 'text-emerald-500' : 'text-rose-500'}`}>
          {status}
        </span>
      </div>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-700">
      {/* Header Section */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">Business Overview</h1>
          <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest">BILLHIPPO COMMAND CENTER • REAL-TIME DATA</p>
        </div>
        <div className="flex items-center gap-3">
           <div className="bg-white px-5 py-2.5 rounded-full border border-slate-100 flex items-center gap-3 text-[10px] font-bold text-slate-500 shadow-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
              Billing Service Active
           </div>
           <button className="p-3.5 bg-profee-blue text-white rounded-2xl shadow-xl shadow-indigo-100 hover:scale-105 active:scale-95 transition-all">
              <Bell size={20} />
           </button>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard title="Total Sales (Monthly)" value="₹12.4L" status="+12.5%" icon={ShoppingBag} color="bg-orange-50 text-orange-500" tag="Live Tracking" trendUp={true} />
        <MetricCard title="Collections" value="₹8.2L" status="On Track" icon={Banknote} color="bg-emerald-50 text-emerald-500" tag="Payments" trendUp={true} />
        <MetricCard title="Outstanding Dues" value="₹4.2L" status="+2% Rise" icon={Clock} color="bg-rose-50 text-rose-500" tag="Outstandings" trendUp={false} />
        <MetricCard title="Active Parties" value="142" status="+3 New" icon={Users} color="bg-profee-blue/10 text-profee-blue" tag="Accounts" trendUp={true} />
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Animated Performance Area Chart */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-10 card-shadow border border-slate-50">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className="text-2xl font-bold font-poppins text-slate-800">Sales & Collections</h2>
              <p className="text-xs text-slate-400 font-medium mt-1">Comparing billings vs actual cash flow</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-profee-blue"></div>
                <span className="text-[10px] font-bold text-slate-400">SALES</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
                <span className="text-[10px] font-bold text-slate-400">COLLECTIONS</span>
              </div>
              <select className="bg-slate-50 text-[10px] font-bold text-slate-500 px-3 py-1.5 rounded-lg border-none focus:ring-0">
                <option>LAST 14 DAYS</option>
                <option>LAST MONTH</option>
              </select>
            </div>
          </div>
          
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4c2de0" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#4c2de0" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorColl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} 
                  dy={15}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} 
                  dx={-10}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '20px' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="#4c2de0" 
                  strokeWidth={4} 
                  fillOpacity={1} 
                  fill="url(#colorSales)" 
                  animationDuration={1500}
                />
                <Area 
                  type="monotone" 
                  dataKey="collections" 
                  stroke="#10b981" 
                  strokeWidth={4} 
                  fillOpacity={1} 
                  fill="url(#colorColl)" 
                  animationDuration={2000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Circular Distribution Chart & Alerts */}
        <div className="space-y-8">
          <div className="bg-white rounded-[2.5rem] p-10 card-shadow border border-slate-50 flex flex-col items-center">
            <div className="w-full flex justify-between items-start mb-6">
               <h2 className="text-lg font-bold font-poppins text-slate-800">Invoice Status</h2>
               <MoreHorizontal className="text-slate-300 cursor-pointer" size={18} />
            </div>
            
            <div className="relative w-full h-48 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={8}
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={1500}
                  >
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute text-center">
                 <p className="text-2xl font-bold font-poppins text-profee-blue">65%</p>
                 <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Collected</p>
              </div>
            </div>

            <div className="w-full mt-6 space-y-3">
               {distributionData.map((item, idx) => (
                 <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full" style={{backgroundColor: item.color}}></div>
                       <span className="text-xs font-bold text-slate-500">{item.name}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-800">{item.value}%</span>
                 </div>
               ))}
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-10 card-shadow flex flex-col border border-slate-50">
            <div className="flex items-center justify-between mb-8">
               <h2 className="text-xl font-bold font-poppins text-slate-800 flex items-center gap-2">
                 <Activity size={18} className="text-profee-blue" /> Smart Alerts
               </h2>
            </div>
            <div className="space-y-4">
               <div className="p-5 bg-rose-50/50 rounded-3xl border border-rose-100 group cursor-pointer hover:bg-rose-50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-3 py-1 bg-rose-500 text-white text-[9px] font-bold rounded-lg">OVERDUE</span>
                    <Clock size={14} className="text-rose-400 group-hover:rotate-12 transition-transform" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm font-poppins">Radhe Shyam Traders</h4>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">₹45,200 pending since Jan 20th</p>
               </div>
               <div className="p-5 bg-emerald-50/50 rounded-3xl border border-emerald-100 group cursor-pointer hover:bg-emerald-50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-3 py-1 bg-emerald-500 text-white text-[9px] font-bold rounded-lg">COLLECTED</span>
                    <CheckCircle size={14} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm font-poppins">Krishna Sweets</h4>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Full payment of ₹12k received</p>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
