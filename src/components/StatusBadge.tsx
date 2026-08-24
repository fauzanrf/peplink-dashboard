'use client';

import React from 'react';
import { GpsLocationData } from '@/lib/peplink';
import { Wifi, ShieldCheck, AlertTriangle, RefreshCw, Cpu, Database, HelpCircle } from 'lucide-react';

interface StatusBadgeProps {
  data: GpsLocationData | null;
  explicitStatus?: string;
  refreshInterval: number;
  onSelectInterval: (interval: number) => void;
  onManualRefresh: () => void;
  isRefreshing: boolean;
  countdownSeconds: number;
}

export default function StatusBadge({
  data,
  explicitStatus,
  refreshInterval,
  onSelectInterval,
  onManualRefresh,
  isRefreshing,
  countdownSeconds,
}: StatusBadgeProps) {
  const statusStr = explicitStatus || data?.connectionStatus || 'OFFLINE';
  const isOnline = statusStr === 'ONLINE' || statusStr === 'PLAYING' || statusStr === 'REPLAY READY' || statusStr === 'COMPLETED' || statusStr === 'PAUSED';
  const isSimulated = data?.isSimulated ?? true;
  const errorMsg = data?.errorMessage;

  return (
    <div className="w-full flex flex-col gap-3 overflow-hidden">
      {/* Top Device Header Bar */}
      <div className="w-full bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl overflow-hidden flex flex-wrap items-center justify-between gap-4">
        {/* Device & Org Identifiers */}
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-pink-500/20 via-purple-500/10 to-transparent border border-pink-500/30 flex items-center justify-center text-pink-300 shadow-inner">
            <Cpu className="w-6 h-6" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white tracking-tight break-words min-w-0">
                {data?.deviceName || 'Balance_45C2'}
              </h1>
              <span className="text-[10px] font-mono font-bold bg-white/10 text-white/90 px-2 py-0.5 rounded border border-white/20 shrink-0">
                ID: {data?.deviceId || '54'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/70 font-mono mt-1">
              <span className="truncate">Org: <strong className="text-white">{data?.orgId || 'gdyv8w'}</strong></span>
              <span className="hidden sm:inline">•</span>
              <span className="truncate">Group: <strong className="text-white">{data?.groupId || '3'}</strong></span>
              <span className="hidden sm:inline">•</span>
              <span className="truncate">Model: <strong className="text-pink-300">Peplink Balance 45C2</strong></span>
            </div>
          </div>
        </div>

        {/* Connection & Auto Refresh Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Connection Mode Pill */}
          <div
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold shadow-sm ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/40'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full animate-pulse ${
                isOnline ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span className="font-mono uppercase">
              {statusStr === 'ONLINE' ? 'LIVE PEPLINK IC2 CONNECTED' : statusStr.toUpperCase() === 'DISCONNECTED' ? 'OFF' : statusStr}
            </span>
          </div>

          {/* Auto Refresh Select & Countdown */}
          <div className="flex items-center gap-2 bg-black/20 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-white/10 text-xs font-mono">
            <RefreshCw className={`w-3.5 h-3.5 text-pink-300 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="text-white/70">Auto Refresh:</span>
            <select
              value={refreshInterval}
              onChange={(e) => onSelectInterval(parseInt(e.target.value, 10))}
              className="bg-transparent text-white font-bold border-none focus:outline-none cursor-pointer"
            >
              <option value={3000} className="bg-purple-900">3s</option>
              <option value={5000} className="bg-purple-900">5s</option>
              <option value={10000} className="bg-purple-900">10s</option>
              <option value={30000} className="bg-purple-900">30s</option>
              <option value={0} className="bg-purple-900">Manual</option>
            </select>
            {refreshInterval > 0 && (
              <span className="text-[10px] text-pink-300 font-bold ml-1">
                ({countdownSeconds}s)
              </span>
            )}
            {refreshInterval === 0 && (
              <button
                onClick={onManualRefresh}
                disabled={isRefreshing}
                className="ml-2 bg-white/10 hover:bg-white/20 text-white px-2 py-0.5 rounded text-[10px] uppercase font-bold transition-colors"
              >
                Refresh
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error / Information Banner when running in simulated mode or upon API error */}
      {errorMsg && (
        <div className="w-full bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 flex items-start gap-2.5 shadow-md">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-amber-200">Status Notice: </span>
            <span>{errorMsg}</span>
          </div>
        </div>
      )}
    </div>
  );
}
