import React from 'react';
import { Activity, RefreshCw, Radio, Shield, AlertTriangle } from 'lucide-react';

export function Header({
  pageTitle = 'Emergency Dispatch Center',
  onRefresh,
  isRefreshing = false,
  isConnected = true,
  incidentCount = 0,
  onOpenClusterStatus,
}) {
  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center text-white shadow-xs">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base sm:text-lg tracking-tight text-white leading-none">
                Emergency Response System
              </h1>
              <span className="text-[10px] font-mono uppercase bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-semibold">
                Saga Engine
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">
              Distributed Coordinator &bull; Two-Phase Hospital & Fleet Allocation
            </p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Connection Status / Cluster Topology indicator */}
          <button
            onClick={onOpenClusterStatus}
            className="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700/60 text-xs cursor-pointer transition-colors"
            title="View Distributed System Topology & Health"
          >
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500 animate-ping'}`} />
            <span className="text-slate-300 font-medium hidden sm:inline">
              Cluster Topology
            </span>
          </button>

          {/* Active Incidents pill */}
          <div className="hidden md:flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/60 text-xs text-slate-300">
            <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            <span className="font-mono font-semibold text-white">{incidentCount}</span>
            <span>Total Logged</span>
          </div>

          {/* Refresh Button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
              title="Refresh coordinator state"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
