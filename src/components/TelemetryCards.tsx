'use client';

import React from 'react';
import { GpsLocationData, PeplinkWanInterface } from '@/lib/peplink';
import { Gauge, Compass, MapPin, Mountain, Satellite, ArrowUpRight, Activity } from 'lucide-react';

interface TelemetryCardsProps {
  data: GpsLocationData | null;
  wanInterfaces?: PeplinkWanInterface[];
  isLoading: boolean;
}

export default function TelemetryCards({ data, wanInterfaces = [], isLoading }: TelemetryCardsProps) {
  const speedKmh = data?.speed ?? 0;
  const heading = data?.heading ?? 0;
  const altitude = data?.altitude ?? 0;
  const lat = data?.latitude ?? 0;
  const lng = data?.longitude ?? 0;

  // Format Cardinal direction from heading angle
  const getCardinalDirection = (angle: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((angle % 360) / 45)) % 8;
    return directions[index];
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full min-w-0">
      {/* 1. SPEEDOMETER CARD */}
      <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex flex-col justify-between min-w-0 box-border overflow-hidden">
        <div className="flex items-center gap-1.5 text-pink-300/80 text-[9px] sm:text-[10px] font-bold tracking-widest uppercase mb-4">
          <Gauge className="w-3.5 h-3.5 shrink-0" />
          <span>SPEED TELEMETRY</span>
        </div>
        <div className="flex items-baseline gap-1.5 mb-4">
          <span className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight">
            {isLoading ? '--' : speedKmh.toFixed(0)}
          </span>
          <span className="text-[10px] sm:text-xs font-medium text-white/60">km/h</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden shrink-0 mt-auto">
          <div
            className="bg-pink-400 h-full transition-all duration-500 rounded-full"
            style={{ width: `${Math.min(100, (speedKmh / 160) * 100)}%` }}
          />
        </div>
      </div>

      {/* 2. HEADING CARD */}
      <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex flex-col justify-between min-w-0 box-border overflow-hidden">
        <div className="flex items-center gap-1.5 text-pink-300/80 text-[9px] sm:text-[10px] font-bold tracking-widest uppercase mb-4">
          <Compass className="w-3.5 h-3.5 shrink-0" />
          <span>HEADING & BEARING</span>
        </div>
        <div className="flex items-baseline gap-1 mb-2">
          <span className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight">
            {isLoading ? '--' : `${heading.toFixed(1)}°`}
          </span>
        </div>
        <div className="text-[9px] sm:text-[10px] text-white/60 font-mono mt-auto">
          Cardinal: {getCardinalDirection(heading)} ({heading.toFixed(0)}°)
        </div>
      </div>

      {/* 3. POSITION CARD */}
      <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex flex-col justify-between min-w-0 box-border overflow-hidden">
        <div className="flex items-center gap-1.5 text-pink-300/80 text-[9px] sm:text-[10px] font-bold tracking-widest uppercase mb-4">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>POSITION COORDINATES</span>
        </div>
        <div className="flex flex-col gap-2 font-mono mt-auto">
          <div className="flex gap-2 items-center">
            <span className="text-[9px] sm:text-[10px] text-white/40 w-5 shrink-0">LAT:</span>
            <span className="text-[11px] sm:text-xs text-slate-200 tracking-wide">{isLoading ? '--' : lat.toFixed(6)}</span>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-[9px] sm:text-[10px] text-white/40 w-5 shrink-0">LON:</span>
            <span className="text-[11px] sm:text-xs text-slate-200 tracking-wide">{isLoading ? '--' : lng.toFixed(6)}</span>
          </div>
        </div>
      </div>

      {/* 4. ALTITUDE CARD */}
      <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex flex-col justify-between min-w-0 box-border overflow-hidden">
        <div className="flex items-center gap-1.5 text-pink-300/80 text-[9px] sm:text-[10px] font-bold tracking-widest uppercase mb-4">
          <Mountain className="w-3.5 h-3.5 shrink-0" />
          <span>ALTITUDE & GNSS</span>
        </div>
        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight">
            {isLoading ? '--' : altitude.toFixed(1)}
          </span>
          <span className="text-[9px] sm:text-[10px] font-medium text-white/60">m</span>
        </div>
        <div className="text-[9px] text-white/40 font-mono mt-auto uppercase tracking-wider">
          {Math.round(altitude * 3.28084)} ft AMSL
        </div>
      </div>

      {/* 5. SATELLITES CARD */}
      <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex flex-col justify-between min-w-0 box-border overflow-hidden">
        <div className="flex items-center gap-1.5 text-pink-300/80 text-[9px] sm:text-[10px] font-bold tracking-widest uppercase mb-4">
          <Satellite className="w-3.5 h-3.5 shrink-0" />
          <span>SATELLITES (GNSS)</span>
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight">
            {isLoading ? '--' : '12'}
          </span>
        </div>
        <div className="text-[9px] text-white/40 font-mono mt-auto uppercase tracking-wider">
          FIX 3D
        </div>
      </div>

      {/* DYNAMIC WAN/SIGNAL CARDS */}
      {wanInterfaces.length > 0 ? wanInterfaces.map(wan => (
        <div key={wan.id} className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex flex-col justify-between min-w-0 box-border overflow-hidden">
          <div className="flex items-center gap-1.5 text-pink-300/80 text-[9px] sm:text-[10px] font-bold tracking-widest uppercase mb-4">
            <Activity className="w-3.5 h-3.5 shrink-0" />
            <span>WAN: {wan.name}</span>
          </div>
          <div className="flex flex-col gap-2 font-mono text-[11px] sm:text-xs min-w-0">
            <div className="flex justify-between items-center gap-2">
              <span className="text-white/40 text-[9px] sm:text-[10px] shrink-0">Status</span>
              <span className={`font-bold text-right ${wan.status === 'Connected' ? 'text-emerald-400' : 'text-white/60'}`}>
                {wan.status === 'Disconnected' ? 'OFF' : wan.status}
              </span>
            </div>
            {wan.s2g3glte && (
              <div className="flex justify-between items-center gap-2 mt-1">
                <span className="text-white/40 text-[9px] sm:text-[10px] shrink-0">Network</span>
                <span className="text-slate-200 text-right text-[10px] sm:text-[11px]">
                  {wan.s2g3glte} {wan.bandName ? `(${wan.bandName})` : ''}
                </span>
              </div>
            )}
            
            {wan.signal && (
              <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-3 text-[10px] sm:text-[11px]">
                {wan.signal.rssi !== undefined && (
                  <div className="flex flex-col">
                    <span className="text-white/40 text-[8px] sm:text-[9px] uppercase">RSSI</span>
                    <span className="text-slate-200">{wan.signal.rssi} dBm</span>
                  </div>
                )}
                {wan.signal.rsrp !== undefined && (
                  <div className="flex flex-col">
                    <span className="text-white/40 text-[8px] sm:text-[9px] uppercase">RSRP</span>
                    <span className="text-slate-200">{wan.signal.rsrp} dBm</span>
                  </div>
                )}
                {wan.signal.rsrq !== undefined && (
                  <div className="flex flex-col">
                    <span className="text-white/40 text-[8px] sm:text-[9px] uppercase">RSRQ</span>
                    <span className="text-slate-200">{wan.signal.rsrq} dB</span>
                  </div>
                )}
                {wan.signal.sinr !== undefined && (
                  <div className="flex flex-col">
                    <span className="text-white/40 text-[8px] sm:text-[9px] uppercase">SINR</span>
                    <span className="text-slate-200">{wan.signal.sinr} dB</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )) : (
        <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex flex-col justify-between min-w-0 box-border overflow-hidden">
          <div className="flex items-center gap-1.5 text-pink-300/80 text-[9px] sm:text-[10px] font-bold tracking-widest uppercase mb-4">
            <Activity className="w-3.5 h-3.5 shrink-0" />
            <span>WAN / SIGNAL</span>
          </div>
          <div className="flex items-center h-full">
            <span className="text-[9px] sm:text-[10px] text-white/40 font-mono">
              {isLoading ? 'LOADING DATA...' : 'SIGNAL DATA UNAVAILABLE'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
