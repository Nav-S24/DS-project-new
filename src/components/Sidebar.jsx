import React from 'react';
import { LayoutDashboard, AlertCircle, Radio, Clock, ShieldAlert, HeartPulse } from 'lucide-react';

export function Sidebar({
  currentPage,
  setCurrentPage,
  activeCount = 0,
  totalCount = 0,
}) {
  const navItems = [
    {
      id: 'dashboard',
      label: 'Dispatch Center',
      icon: LayoutDashboard,
      badge: activeCount > 0 ? activeCount : null,
      badgeColor: 'bg-red-500 text-white',
    },
    {
      id: 'incidents',
      label: 'All Incidents',
      icon: AlertCircle,
      badge: totalCount,
      badgeColor: 'bg-slate-200 text-slate-800',
    },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 h-full flex flex-col p-4 shadow-2xs">
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
        Operations
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== null && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-slate-100">
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/60">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <HeartPulse className="w-4 h-4 text-red-600 animate-pulse" />
            <span>Distributed Core</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Automatic two-phase commit with rollback when hospital capacity or ambulance fleets exhaust.
          </p>
        </div>
      </div>
    </aside>
  );
}
