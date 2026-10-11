import React from 'react';
import { Activity, RefreshCw, Radio, Server, Wifi, WifiOff, Clock } from 'lucide-react';
import { formatClockTime } from '../utils/formatters';

export function Header({
  pageTitle = 'Emergency Dispatch Center',
  onRefresh,
  isRefreshing = false,
  isConnected = true,
  connectionStatus = 'connected',
  lastEventTime,
  incidentCount = 0,
  onOpenClusterStatus,
}) {
  // Derive connection badge styling
  const getConnectionBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return {
          icon: Wifi,
          label: 'Live Stream Active',
          containerClass: 'bg-emerald-950/40 text-emerald-300 border-emerald-700/60',
          dotClass: 'bg-emerald-400 animate-pulse',
        };
      case 'connecting':
        return {
          icon: RefreshCw,
          label: 'Reconnecting...',
          containerClass: 'bg-amber-950/40 text-amber-300 border-amber-700/60',
          dotClass: 'bg-amber-400 animate-spin',
        };
      case 'disconnected':
      default:
        return {
          icon: WifiOff,
          label: 'Stream Offline',
          containerClass: 'bg-red-950/40 text-red-300 border-red-700/60',
          dotClass: 'bg-red-500 animate-ping',
        };
    }
  };

  const connBadge = getConnectionBadge();

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
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Live WebSocket Connection Indicator */}
          <div
            className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-medium shadow-2xs ${connBadge.containerClass}`}
            title={`WebSocket connection status: ${connectionStatus}`}
          >
            <span className={`w-2 h-2 rounded-full ${connBadge.dotClass}`} />
            <span className="hidden sm:inline">{connBadge.label}</span>
            {lastEventTime && (
              <span className="text-[10px] font-mono opacity-80 hidden md:inline border-l border-white/20 pl-2">
                {formatClockTime(lastEventTime)}
              </span>
            )}
          </div>

          {/* Connection Status / Cluster Topology indicator */}
          <button
            onClick={onOpenClusterStatus}
            className="flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700/60 text-xs cursor-pointer transition-colors"
            title="View Distributed System Topology & Health"
          >
            <Server className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-300 font-medium hidden sm:inline">
              Topology
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
              title="Refresh coordinator state from REST API"
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
