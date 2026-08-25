'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { GpsLocationData, GpsHistoryPoint, PeplinkWanInterface } from '@/lib/peplink';
import TelemetryCards from '@/components/TelemetryCards';
import StatusBadge from '@/components/StatusBadge';

const HistoricalControls = dynamic(() => import('@/components/HistoricalControls'), { ssr: false });
import { Activity, ShieldCheck, Radio, Terminal, Eye, Camera, EyeOff } from 'lucide-react';

const CesiumMap = dynamic(() => import('@/components/CesiumMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[480px] bg-black/40 rounded-2xl flex flex-col items-center justify-center gap-3 border border-white/10">
      <div className="w-10 h-10 border-4 border-pink-500/30 border-t-cyan-400 rounded-full animate-spin" />
      <span className="text-xs font-mono text-pink-200">LOADING 3D ENGINE...</span>
    </div>
  ),
});

// Haversine formula for distance
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c; 
}

export default function DashboardPage() {
  const [currentLocation, setCurrentLocation] = useState<GpsLocationData | null>(null);
  const [wanInterfaces, setWanInterfaces] = useState<PeplinkWanInterface[]>([]);
  const [playbackLocation, setPlaybackLocation] = useState<GpsLocationData | null>(null); // For interpolated telemetry
  const [historyPoints, setHistoryPoints] = useState<GpsHistoryPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selectedDate, setSelectedDate] = useState('2026-07-28'); // Default to a static date for SSR

  useEffect(() => {
    const defaultDate = new Date();
    const tzOffset = defaultDate.getTimezoneOffset() * 60000;
    setSelectedDate(new Date(defaultDate.getTime() - tzOffset).toISOString().split('T')[0]);
  }, []);
  
  const [dashboardMode, setDashboardMode] = useState<'LIVE'|'REPLAY'>('LIVE');
  const [cameraMode, setCameraMode] = useState<'FOLLOW' | 'FREE' | 'DRONE'>('FOLLOW');
  const [showPolyline, setShowPolyline] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const [countdownSeconds, setCountdownSeconds] = useState(5);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyDebug, setHistoryDebug] = useState<any>(null);

  // Playback Engine States
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackProgress, setPlaybackProgress] = useState(0); // 0-100
  const [scrubTrigger, setScrubTrigger] = useState<{percent: number, nonce: number} | null>(null);

  const [routeStats, setRouteStats] = useState({
    totalPoints: 0,
    durationMinutes: 0,
    distanceKm: 0,
    maxSpeedKmh: 0,
    avgSpeedKmh: 0
  });

  const fetchLiveLocation = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [gpsRes, wanRes] = await Promise.all([
        fetch('/api/gps', { signal: AbortSignal.timeout(12000) }),
        fetch('/api/wan', { signal: AbortSignal.timeout(12000) }).catch(() => null) // Ignore wan fetch errors if any to not crash gps
      ]);

      if (gpsRes.ok) {
        const data: GpsLocationData = await gpsRes.json();
        setCurrentLocation(data);
      } else {
        const errData = await gpsRes.json().catch(() => null);
        setCurrentLocation((prev) => ({
          ...(prev || {}),
          connectionStatus: 'OFFLINE',
          errorMessage: errData?.message || `HTTP ${gpsRes.status}: Server Error`,
          isSimulated: false,
          deviceName: 'Balance_45C2',
          deviceId: '54',
          orgId: 'gdyv8w',
          groupId: '3'
        } as any));
      }

      if (wanRes && wanRes.ok) {
        const wanData = await wanRes.json();
        if (wanData && wanData.interfaces) {
          setWanInterfaces(wanData.interfaces);
        }
      }
    } catch (err: any) {
      setCurrentLocation((prev) => ({
        ...(prev || {}),
        connectionStatus: 'OFFLINE',
        errorMessage: err.message || 'Network Error',
        isSimulated: false,
      } as any));
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async (dateStr: string) => {
    setIsFetchingHistory(true);
    setHistoryError(null);
    setHistoryDebug(null); // Clear previous debug info
    setHistoryPoints([]);
    try {
      const res = await fetch(`/api/gps/history?date=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        if (data.error) {
           setHistoryError(data.message || 'API Error');
           setHistoryDebug(data.debug || null);
           return;
        }
        if (data.points && Array.isArray(data.points)) {
          if (data.points.length < 2) {
             setHistoryError(`NO GPS DATA AVAILABLE FOR ${dateStr}`);
             return;
          }
          setHistoryPoints(data.points);
          
          if (data.routeStats) {
            setRouteStats(data.routeStats);
          } else {
            setRouteStats({
              totalPoints: data.points.length,
              durationMinutes: 0,
              distanceKm: 0,
              maxSpeedKmh: 0,
              avgSpeedKmh: 0
            });
          }
        }
      } else {
         const errBody = await res.json().catch(() => ({}));
         setHistoryError(errBody.message || `FAILED TO LOAD ROUTE: HTTP ${res.status}`);
      }
    } catch (err: any) {
      console.error('Error fetching GPS history:', err);
      setHistoryError(err.message || 'FAILED TO LOAD ROUTE');
    } finally {
      setIsFetchingHistory(false);
    }
  }, []);

  const handleChangeDate = (newDate: string) => {
    setSelectedDate(newDate);
    fetchHistory(newDate);
    handleStopPlayback();
  };

  const handleSetPlaying = (playing: boolean) => {
    if (historyPoints.length === 0) return;
    setIsPlaying(playing);
  };

  const handleStopPlayback = () => {
    setIsPlaying(false);
    setPlaybackProgress(0);
    setScrubTrigger({ percent: 0, nonce: Date.now() });
    setPlaybackLocation(null);
  };

  const handleRestartPlayback = () => {
    setPlaybackProgress(0);
    setScrubTrigger({ percent: 0, nonce: Date.now() });
    setIsPlaying(true);
  };

  const handleScrub = (percent: number) => {
    setIsPlaying(false);
    setPlaybackProgress(percent);
    setScrubTrigger({ percent, nonce: Date.now() });
  };

  useEffect(() => {
    fetchLiveLocation();
    fetchHistory(selectedDate);
  }, []);

  // Auto Refresh & Countdown Loop
  useEffect(() => {
    if (refreshInterval === 0 || isPlaying) return;

    setCountdownSeconds(Math.round(refreshInterval / 1000));
    const timer = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          fetchLiveLocation();
          return Math.round(refreshInterval / 1000);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [refreshInterval, fetchLiveLocation, isPlaying]);

  // Decide what telemetry to show: In REPLAY mode, always show the interpolated vehicle. Otherwise show live.
  const displayLocation = dashboardMode === 'REPLAY' && playbackLocation ? playbackLocation : currentLocation;

  // Compute exact status text for the UI based on LIVE/REPLAY
  let derivedStatus = 'OFFLINE';
  if (dashboardMode === 'LIVE') {
    if (isLoading) derivedStatus = 'LOADING';
    else derivedStatus = currentLocation?.connectionStatus === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
  } else {
    // REPLAY Mode
    if (isFetchingHistory) {
      derivedStatus = 'LOADING';
    } else if (historyPoints.length === 0) {
      derivedStatus = 'NO GPS DATA';
    } else if (isPlaying) {
      derivedStatus = 'PLAYING';
    } else if (playbackProgress >= 100) {
      derivedStatus = 'COMPLETED';
    } else if (playbackProgress > 0 && playbackProgress < 100) {
      derivedStatus = 'PAUSED';
    } else {
      derivedStatus = 'REPLAY READY';
    }
  }
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#4b144a] to-[#7f185d] text-white font-sans p-4 sm:p-6 lg:p-8 flex flex-col gap-6 selection:bg-white selection:text-[#4b144a]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/20 pb-4">
        <div className="flex flex-wrap items-center gap-4 min-w-0 flex-1">
          <div className="bg-white rounded-xl p-2 shadow-md shrink-0">
            <img src="/internetwork-logo-new.png" alt="Logo" className="h-10 object-contain" />
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white break-words">
              PEPLINK INCONTROL 2
            </h1>
            <p className="text-[10px] sm:text-xs text-white/70 font-mono mt-1 break-words">
              Vehicle Tracking & GPS Replay Dashboard
            </p>
          </div>
        </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-black/20 border border-white/10 rounded-xl overflow-hidden p-1 backdrop-blur-sm">
              <button 
                onClick={() => {
                  setDashboardMode('LIVE');
                  handleStopPlayback();
                }}
                className={`px-4 py-1.5 text-xs font-bold font-mono transition-all rounded-lg ${dashboardMode === 'LIVE' ? 'bg-white text-[#7B4397] shadow-md' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
              >
                LIVE
              </button>
              <button 
                onClick={() => setDashboardMode('REPLAY')}
                className={`px-4 py-1.5 text-xs font-bold font-mono transition-all rounded-lg ${dashboardMode === 'REPLAY' ? 'bg-white text-[#7B4397] shadow-md' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
              >
                REPLAY
              </button>
            </div>

            <div className="flex items-center gap-3 font-mono text-xs text-white/70">
              <div className="bg-black/20 border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-2 backdrop-blur-sm">
                <Activity className="w-3.5 h-3.5 text-pink-300" />
                <span>REST API v2.0</span>
              </div>
              <div className="bg-black/20 border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-2 backdrop-blur-sm">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                <span>OAuth2 Secured</span>
              </div>
            </div>
          </div>
        </header>

      <StatusBadge
        data={displayLocation}
        explicitStatus={derivedStatus}
        refreshInterval={refreshInterval}
        onSelectInterval={setRefreshInterval}
        onManualRefresh={fetchLiveLocation}
        isRefreshing={isRefreshing}
        countdownSeconds={countdownSeconds}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1 min-w-0">
        {/* Main Content (Left) */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          <div className="h-[500px] xl:h-[650px] w-full relative rounded-2xl overflow-hidden shadow-2xl border border-white/10 group">
            <CesiumMap
              currentLocation={currentLocation}
              historyPoints={dashboardMode === 'REPLAY' ? historyPoints : []}
              showPolyline={dashboardMode === 'REPLAY' ? showPolyline : false}
              cameraMode={dashboardMode === 'REPLAY' ? cameraMode : 'FOLLOW'}
              isPlaying={isPlaying}
              playbackSpeed={playbackSpeed}
              scrubTrigger={scrubTrigger}
              onTickTelemetry={(loc) => setPlaybackLocation(loc)}
              onPlaybackProgress={(pct) => setPlaybackProgress(pct)}
            />

            {/* Camera Mode Overlay Buttons */}
            {dashboardMode === 'REPLAY' && (
              <div className="absolute top-4 right-4 flex flex-col gap-2 z-10 transition-opacity opacity-70 group-hover:opacity-100">
                <button
                  onClick={() => setCameraMode('DRONE')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] uppercase font-extrabold tracking-widest transition-all border backdrop-blur-md shadow-lg ${
                    cameraMode === 'DRONE'
                      ? 'bg-pink-400/20 text-pink-200 border-pink-500/50'
                      : 'bg-black/40/60 hover:bg-black/20 text-white/80 border-white/10/80'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" /> DRONE VIEW
                </button>
                <button
                  onClick={() => setCameraMode('FOLLOW')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] uppercase font-extrabold tracking-widest transition-all border backdrop-blur-md shadow-lg ${
                    cameraMode === 'FOLLOW'
                      ? 'bg-pink-400/20 text-pink-200 border-pink-500/50'
                      : 'bg-black/40/60 hover:bg-black/20 text-white/80 border-white/10/80'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" /> FOLLOW VEHICLE
                </button>
                <button
                  onClick={() => setCameraMode('FREE')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] uppercase font-extrabold tracking-widest transition-all border backdrop-blur-md shadow-lg ${
                    cameraMode === 'FREE'
                      ? 'bg-pink-400/20 text-pink-200 border-pink-500/50'
                      : 'bg-black/40/60 hover:bg-black/20 text-white/80 border-white/10/80'
                  }`}
                >
                  <EyeOff className="w-3.5 h-3.5" /> FREE CAMERA
                </button>
              </div>
            )}
          </div>

          {dashboardMode === 'REPLAY' && (
            <HistoricalControls
              historyPoints={historyPoints}
              showPolyline={showPolyline}
              onTogglePolyline={() => setShowPolyline(!showPolyline)}
              selectedDate={selectedDate}
              onChangeDate={handleChangeDate}
              isPlaying={isPlaying}
              onSetPlaying={handleSetPlaying}
              onStopPlayback={handleStopPlayback}
              onRestartPlayback={handleRestartPlayback}
              playbackSpeed={playbackSpeed}
              onChangePlaybackSpeed={setPlaybackSpeed}
              cameraMode={cameraMode}
              onChangeCameraMode={setCameraMode}
              routeStats={routeStats}
              onScrubPlayback={handleScrub}
              playbackProgress={playbackProgress}
              isFetchingHistory={isFetchingHistory}
              historyError={historyError}
              historyDebug={historyDebug}
            />
          )}
        </div>

        <div className="flex flex-col gap-5 justify-between">
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-bold font-mono tracking-wider text-white/60 flex items-center gap-2 uppercase">
              <Terminal className="w-4 h-4 text-pink-300" /> 
              { 'REAL-TIME TELEMETRY FEED' }
            </h2>
            <TelemetryCards data={displayLocation} wanInterfaces={wanInterfaces} isLoading={isLoading} />
          </div>

          <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-5 space-y-3.5 font-mono text-xs">
            <div className="flex justify-between border-b border-white/10 pb-2">
              <span className="text-white/60">Target Device Name:</span>
              <span className="text-white font-bold">{currentLocation?.deviceName || 'Balance_45C2'}</span>
            </div>
            <div className="flex justify-between border-b border-white/10 pb-2">
              <span className="text-white/60">Peplink Org ID:</span>
              <span className="text-pink-300 font-bold">{currentLocation?.orgId || 'gdyv8w'}</span>
            </div>
            <div className="flex justify-between border-b border-white/10 pb-2">
              <span className="text-white/60">Group ID / Device ID:</span>
              <span className="text-slate-200">Group {currentLocation?.groupId || '3'} / ID {currentLocation?.deviceId || '54'}</span>
            </div>
            <div className="flex justify-between border-b border-white/10 pb-2">
              <span className="text-white/60">Ping Time:</span>
              <span className="text-emerald-400 font-bold" suppressHydrationWarning={true}>
                {displayLocation ? displayLocation.formattedTime : '--'}
              </span>
            </div>
            <div className="flex justify-between border-b border-white/10 pb-2">
              <span className="text-white/60">OAuth Security Proxy:</span>
              <span className="text-white/80">Server-Side Credentials</span>
            </div>
            <div className="flex justify-between border-b border-white/10 pb-2">
              <span className="text-white/60">Data Source:</span>
              <span className="text-white/80">Peplink IC2 API</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Timezone:</span>
              <span className="text-white/80">Asia/Bangkok (UTC+7)</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
