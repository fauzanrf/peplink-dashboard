'use client';

import React, { useState, useEffect } from 'react';
import { GpsHistoryPoint } from '@/lib/peplink';
import { Play, Pause, RotateCcw, Eye, EyeOff, Camera, Clock, Calendar, Activity, Navigation, FastForward, ChevronLeft, ChevronRight, Square } from 'lucide-react';

interface RouteStats {
  totalPoints: number;
  durationMinutes: number;
  distanceKm: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
}

interface HistoricalControlsProps {
  historyPoints: GpsHistoryPoint[];
  showPolyline: boolean;
  onTogglePolyline: () => void;
  selectedDate: string; // YYYY-MM-DD
  onChangeDate: (date: string) => void;
  isPlaying: boolean;
  onSetPlaying: (playing: boolean) => void;
  onStopPlayback: () => void;
  onRestartPlayback: () => void;
  playbackSpeed: number;
  onChangePlaybackSpeed: (speed: number) => void;
  cameraMode: 'FOLLOW' | 'FREE' | 'DRONE';
  onChangeCameraMode: (mode: 'FOLLOW' | 'FREE' | 'DRONE') => void;
  routeStats: RouteStats;
  onScrubPlayback: (percent: number) => void;
  playbackProgress: number; // 0-100%
  isFetchingHistory?: boolean;
  historyError?: string | null;
  historyDebug?: any;
}

export default function HistoricalControls({
  historyPoints,
  showPolyline,
  onTogglePolyline,
  selectedDate,
  onChangeDate,
  isPlaying,
  onSetPlaying,
  onStopPlayback,
  onRestartPlayback,
  playbackSpeed,
  onChangePlaybackSpeed,
  cameraMode,
  onChangeCameraMode,
  routeStats,
  onScrubPlayback,
  playbackProgress,
  isFetchingHistory,
  historyError,
  historyDebug
}: HistoricalControlsProps) {
  const [localDate, setLocalDate] = useState(selectedDate);
  const [showDebug, setShowDebug] = useState(true);

  // Sync localDate with props
  useEffect(() => {
    setLocalDate(selectedDate);
  }, [selectedDate]);

  const handleLoadRoute = () => {
    if (!localDate) return;
    onChangeDate(localDate);
  };

  const handlePrevDay = () => {
    if (!localDate) return;
    const dateObj = new Date(localDate);
    dateObj.setDate(dateObj.getDate() - 1);
    const prevDate = dateObj.toISOString().split('T')[0];
    setLocalDate(prevDate);
    onChangeDate(prevDate);
  };

  const handleNextDay = () => {
    if (!localDate) return;
    const dateObj = new Date(localDate);
    dateObj.setDate(dateObj.getDate() + 1);
    const nextDate = dateObj.toISOString().split('T')[0];
    setLocalDate(nextDate);
    onChangeDate(nextDate);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Row 1: Date Selection & Route Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-mono text-pink-300 font-bold uppercase tracking-widest flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" />
            Daily Route Replay
          </span>
          <div className="flex flex-wrap items-center mt-1 gap-y-3">
            <div className="flex items-center">
              <button 
                onClick={handlePrevDay}
                className="bg-black/20 border border-white/10 hover:border-slate-500 text-white/80 rounded-l-xl px-2 sm:px-4 text-xs transition-colors h-10 font-medium flex items-center gap-1 sm:gap-2"
              >
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" /> <span className="hidden sm:inline">Prev Day</span>
              </button>
              <input
                type="date"
                value={localDate}
                onChange={(e) => setLocalDate(e.target.value)}
                className="bg-black/40 border-y border-white/10 px-2 sm:px-4 text-[10px] sm:text-sm font-mono text-slate-100 outline-none h-10 w-28 sm:w-40 text-center uppercase tracking-wider"
              />
              <button 
                onClick={handleNextDay}
                className="bg-black/20 border border-white/10 hover:border-slate-500 border-l-0 text-white/80 rounded-r-xl px-2 sm:px-4 text-xs transition-colors h-10 font-medium flex items-center gap-1 sm:gap-2"
              >
                <span className="hidden sm:inline">Next Day</span> <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
            <button
              onClick={handleLoadRoute}
              disabled={isFetchingHistory}
              className="ml-0 sm:ml-3 mt-2 sm:mt-0 bg-pink-400 hover:bg-pink-300 disabled:bg-purple-900 disabled:text-pink-600 text-purple-950 text-[11px] font-extrabold uppercase tracking-widest px-4 sm:px-6 h-10 rounded-xl transition-all shadow-[0_0_15px_rgba(236,72,153,0.15)] w-full sm:w-auto"
            >
              {isFetchingHistory ? 'LOADING...' : 'LOAD ROUTE'}
            </button>
          </div>
        </div>

        {/* Route Status Indicator */}
        <div className="flex flex-col justify-center items-end text-right pr-4 border-r-2 border-emerald-500/20">
          {!historyError && historyPoints.length > 0 && !isFetchingHistory ? (
            <>
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px] tracking-widest uppercase">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                ROUTE LOADED
              </div>
              <div className="text-xs text-white/60 mt-1 font-mono">Vehicle: Balance_45C2</div>
              <div className="text-xs text-white/60 font-mono">Date: {localDate}</div>
            </>
          ) : historyError ? (
            <div className="text-red-400 text-[11px] font-bold tracking-widest uppercase">
              {historyError}
            </div>
          ) : (
            <div className="text-white/40 text-[11px] font-bold tracking-widest uppercase">
              NO ROUTE LOADED
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Route Statistics Grid */}
      {historyPoints.length > 0 && !historyError && routeStats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-0 border-b border-white/10 pb-5">
          <div className="flex flex-col gap-2 pl-4 border-l-2 border-emerald-500/30">
            <span className="text-[10px] text-white/60 uppercase font-bold flex items-center gap-1.5 tracking-wider">
              <Navigation className="w-3.5 h-3.5 text-emerald-400" /> DISTANCE
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-mono font-black text-white">{(routeStats?.distanceKm || 0).toFixed(2)}</span>
              <span className="text-xs text-white/40 font-medium tracking-wide">km</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 pl-4 border-l-2 border-pink-500/30">
            <span className="text-[10px] text-white/60 uppercase font-bold flex items-center gap-1.5 tracking-wider">
              <Clock className="w-3.5 h-3.5 text-pink-300" /> DURATION
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-mono font-black text-white">{(routeStats?.durationMinutes || 0).toFixed(1)}</span>
              <span className="text-xs text-white/40 font-medium tracking-wide">min</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 pl-4 border-l-2 border-amber-500/30">
            <span className="text-[10px] text-white/60 uppercase font-bold flex items-center gap-1.5 tracking-wider">
              <FastForward className="w-3.5 h-3.5 text-amber-400" /> MAX SPEED
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-mono font-black text-white">{(routeStats?.maxSpeedKmh || 0).toFixed(0)}</span>
              <span className="text-xs text-white/40 font-medium tracking-wide">km/h</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 pl-4 border-l-2 border-blue-500/30">
            <span className="text-[10px] text-white/60 uppercase font-bold flex items-center gap-1.5 tracking-wider">
              <Activity className="w-3.5 h-3.5 text-blue-400" /> AVG SPEED
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-mono font-black text-white">{(routeStats?.avgSpeedKmh || 0).toFixed(1)}</span>
              <span className="text-xs text-white/40 font-medium tracking-wide">km/h</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 pl-4 border-l-2 border-purple-500/30">
            <span className="text-[10px] text-white/60 uppercase font-bold flex items-center gap-1.5 tracking-wider">
              <Activity className="w-3.5 h-3.5 text-purple-400" /> GPS POINTS
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-mono font-black text-white">{routeStats?.totalPoints || 0}</span>
              <span className="text-xs text-white/40 font-medium tracking-wide">pts</span>
            </div>
          </div>
        </div>
      )}

      {/* Row 3: Playback Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onSetPlaying(true)}
            disabled={historyPoints.length === 0 || isPlaying}
            className={`px-5 h-10 rounded-xl text-[10px] font-extrabold tracking-widest uppercase transition-all flex items-center gap-2 ${
              isPlaying ? 'bg-pink-400/20 text-pink-200 border border-pink-500/50' : 'bg-pink-400 hover:bg-pink-300 text-purple-950 shadow-[0_0_15px_rgba(236,72,153,0.2)]'
            }`}
          >
            <Play className="w-4 h-4 fill-current" /> PLAY
          </button>
          <button
            onClick={() => onSetPlaying(false)}
            disabled={historyPoints.length === 0 || !isPlaying}
            className={`px-4 h-10 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-all border flex items-center gap-2 ${
              !isPlaying && playbackProgress > 0 && playbackProgress < 100 ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' : 'bg-black/20 hover:bg-white/10 text-white/80 border-white/10'
            }`}
          >
            <Pause className="w-4 h-4" /> PAUSE
          </button>
          <button
            onClick={onStopPlayback}
            disabled={historyPoints.length === 0}
            className="px-4 h-10 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-all border bg-black/20 hover:bg-white/10 text-white/80 border-white/10 flex items-center gap-2"
          >
            <Square className="w-4 h-4" /> STOP
          </button>
          <button
            onClick={onRestartPlayback}
            disabled={historyPoints.length === 0}
            className="px-4 h-10 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-all border bg-black/20 hover:bg-white/10 text-white/80 border-white/10 flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> RESTART
          </button>
        </div>

        {/* Speed Multipliers */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">SPEED:</span>
          <div className="flex items-center bg-black/20 p-1 rounded-xl border border-white/10 text-xs font-mono">
            {[1, 5, 10, 20, 50, 100].map((spd) => (
              <button
                key={spd}
                onClick={() => onChangePlaybackSpeed(spd)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  playbackSpeed === spd ? 'bg-pink-400/20 text-pink-300 font-bold border border-pink-500/30' : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: Timeline */}
      <div className="flex flex-col gap-3 w-full">
        <div className="flex justify-between text-[10px] font-mono tracking-widest uppercase text-white/60 font-bold">
          <span className="text-pink-300">ROUTE TIMELINE</span>
          <span>{historyPoints.length > 0 ? `${playbackProgress.toFixed(1)}%` : '0.0%'}</span>
        </div>
        
        <div className="flex items-center gap-4 text-xs font-mono text-white/40">
          <span>00:00:00</span>
          <div className="flex-1 relative h-6 flex items-center">
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={playbackProgress}
              onChange={(e) => onScrubPlayback(parseFloat(e.target.value))}
              disabled={historyPoints.length === 0}
              className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(236,72,153,0.8)]"
            />
            {/* Dots underneath the slider to simulate stops/hours */}
            <div className="absolute inset-0 pointer-events-none flex justify-between items-center px-2">
               {[...Array(11)].map((_, i) => (
                 <div key={i} className="w-1 h-1 bg-slate-700 rounded-full z-0" />
               ))}
            </div>
          </div>
          <span suppressHydrationWarning={true}>
            {historyPoints.length > 0 
              ? new Date(historyPoints[historyPoints.length - 1].timestamp).toLocaleTimeString('en-US', { hour12: false }) 
              : '--:--:--'
            }
          </span>
        </div>

        {/* Current Time Display */}
        <div className="flex justify-center items-center gap-2 text-xs font-mono mt-1">
          <Clock className="w-3.5 h-3.5 text-cyan-500" />
          <span className="text-white/60">Current Time:</span>
          <span className="text-pink-300 font-bold" suppressHydrationWarning={true}>
            {historyPoints.length > 0 && playbackProgress > 0 
              ? new Date(historyPoints[0].timestamp + (historyPoints[historyPoints.length - 1].timestamp - historyPoints[0].timestamp) * (playbackProgress / 100)).toLocaleTimeString() 
              : '--:--:--'
            }
          </span>
        </div>
      </div>
    </div>
  );
}
