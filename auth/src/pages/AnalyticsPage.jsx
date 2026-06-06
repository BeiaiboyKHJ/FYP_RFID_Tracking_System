import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../client';
import { BrainCircuit, Loader2, Activity, ShieldAlert, Footprints, Truck, Bus, Flag, Clock, MapPin } from 'lucide-react';

const MODE_CONFIG = [
  { id: 'walk',    icon: <Footprints size={14}/>, label: 'Walking' },
  { id: 'vehicle', icon: <Truck size={14}/>,      label: 'Vehicle' },
  { id: 'bus',     icon: <Bus size={14}/>,         label: 'Bus'     },
];

const AnalyticsPage = ({ role }) => {
  const FLASK_URL = import.meta.env.VITE_FLASK_URL || 'http://127.0.0.1:5000';
  const [viewMode, setViewMode]         = useState('walk');
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictions, setPredictions]   = useState([]);
  const [stats, setStats]               = useState({ total: 0, alerts: 0 });
  const [exitInfo, setExitInfo]         = useState(null);
  const [timeLeft, setTimeLeft]         = useState('');
  const skipNextEffect                  = useRef(false);
  const runPredictionRef                = useRef(null);

  // Live countdown
  useEffect(() => {
    const tick = () => {
      if (!exitInfo?.end_time) { setTimeLeft('No deadline'); return; }
      const mins = (new Date(exitInfo.end_time) - new Date()) / 1000 / 60;
      if (mins < 0) { setTimeLeft('Expired'); return; }
      const h = Math.floor(mins / 60);
      const m = Math.floor(mins % 60);
      const s = Math.floor((mins * 60) % 60);
      setTimeLeft(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [exitInfo]);

  const calculateRoadDistance = async (lat1, lon1, lat2, lon2, transport = 'driving') => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    try {
      const profile = transport === 'walk' ? 'foot' : 'driving';
      const url     = `https://router.project-osrm.org/route/v1/${profile}/${lon1},${lat1};${lon2},${lat2}?overview=false`;
      const res     = await fetch(url);
      const data    = await res.json();
      if (data.code === 'Ok' && data.routes?.length > 0) return data.routes[0].distance;
      return 0;
    } catch (err) {
      console.error("OSRM error:", err);
      return 0;
    }
  };

  const runPrediction = useCallback(async (modeToAnalyze) => {
    const activeMode = modeToAnalyze || viewMode;
    setIsPredicting(true);
    try {
      const { count: globalTotal } = await supabase
        .from('Profiles').select('*', { count: 'exact', head: true });

      // Fetch exit checkpoint from 'checkpoints' table (single source of truth)
      const { data: exitData } = await supabase
        .from('checkpoints')
        .select('latitude, longitude, checkpoint_type, end_time')
        .eq('is_exit', true)
        .limit(1)
        .maybeSingle();
      setExitInfo(exitData);

      const { data: allProfiles, error: profilesError } = await supabase
        .from('Profiles')
        .select('user_id, username, gender, age, body_mass, body_size, shoe_size, vehicle_type, status');
      if (profilesError) throw profilesError;

      const profiles = (allProfiles || []).filter(p => p.vehicle_type === activeMode);
      const statusMap = {};
      profiles.forEach(p => { statusMap[p.user_id] = p.status || null; });

      if (profiles.length === 0) {
        setPredictions([]);
        setStats({ total: globalTotal || 0, alerts: 0 });
        return;
      }

      const userIds = profiles.map(p => p.user_id);

      // Fetch user scan logs from 'locations' (contains lat/lon of where user was scanned)
      const { data: userLocs } = await supabase
        .from('locations')
        .select('user_id, latitude, longitude, created_at')
        .in('user_id', userIds)
        .order('created_at', { ascending: false });

      const userLocMap = {};
      (userLocs || []).forEach(loc => {
        if (!userLocMap[loc.user_id]) userLocMap[loc.user_id] = loc;
      });

      const data_list = await Promise.all(profiles.map(async (profile) => {
        const currentPos = userLocMap[profile.user_id] || null;
        let distanceMeters = 0;
        if (currentPos?.latitude && currentPos?.longitude && exitData?.latitude && exitData?.longitude) {
          distanceMeters = await calculateRoadDistance(
            currentPos.latitude, currentPos.longitude,
            exitData.latitude, exitData.longitude, profile.vehicle_type
          );
        }
        const now = new Date();
        // Always use exit checkpoint deadline from 'checkpoints' table — never stale
        const minutesRemaining = exitData?.end_time
          ? (new Date(exitData.end_time) - now) / 1000 / 60
          : 60;

        return {
          id:             profile.user_id,
          transport_mode: profile.vehicle_type || activeMode,
          distance:       distanceMeters,
          age:            profile.age || 25,
          mass:           profile.body_mass || 70,
          height:         profile.body_size || 1.7,
          shoe:           profile.shoe_size || 40,
          gender:         profile.gender || 'm',
          deadline:       minutesRemaining,
          label:          profile.username || 'Member',
          has_location:   !!currentPos
        };
      }));

      const response = await fetch(`${FLASK_URL}/predict`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: data_list })
      });
      if (!response.ok) throw new Error(`Flask error: ${response.status}`);

      const result = await response.json();
      const predictionsWithStatus = (result.predictions || []).map(p => ({
        ...p, status: statusMap[p.id] || null
      }));
      setPredictions(predictionsWithStatus);
      setStats({ total: globalTotal || 0, alerts: predictionsWithStatus.filter(p => p.is_late).length });

    } catch (err) {
      console.error("AI Logic Error:", err);
      setPredictions([]);
    } finally {
      setIsPredicting(false);
    }
  }, [viewMode]);

  // Sync ref AFTER runPrediction is defined
  useEffect(() => { runPredictionRef.current = runPrediction; }, [runPrediction]);

  // Initial run + re-run when viewMode changes
  useEffect(() => {
    if (skipNextEffect.current) { skipNextEffect.current = false; return; }
    runPrediction();
  }, [runPrediction]);

  // Real-time: listen to BOTH tables
  // - 'checkpoints' → exit checkpoint config changed (address, deadline, is_exit toggle)
  // - 'locations'   → user scanned a card (new position data)
// Real-time: listen to THREE tables
useEffect(() => {
  const sub = supabase
    .channel('analytics-realtime')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'checkpoints' },
      () => { runPredictionRef.current?.(); }
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'locations' },
      () => { runPredictionRef.current?.(); }
    )
    .on('postgres_changes',  // ← NEW
      { event: 'UPDATE', schema: 'public', table: 'Profiles' },  // ← NEW
      () => { runPredictionRef.current?.(); }  // ← NEW
    )
    .subscribe();

  return () => supabase.removeChannel(sub);
}, []);

  const handleModeChange = (newMode) => {
    if (newMode === viewMode) return;
    skipNextEffect.current = true;
    setViewMode(newMode);
    runPrediction(newMode);
  };

  const isExpired = timeLeft === 'Expired';

  return (
    <div className="min-h-screen bg-[#080808] text-white p-6 lg:p-10" style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif" }}>

      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/20">
              <BrainCircuit className="text-indigo-400" size={20} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Late Occurrence & Analytics
            </h1>
          </div>
          <p className="text-gray-500 text-sm ml-11">Real-time AI Delay Prediction and Risk Assessment</p>
        </div>

        {/* Mode Switcher */}
        <div className="bg-[#111] border border-white/8 p-1 rounded-xl flex gap-1">
          {MODE_CONFIG.map((m) => (
            <button
              key={m.id}
              onClick={() => handleModeChange(m.id)}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 text-xs font-semibold ${
                viewMode === m.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

        {/* Total Members */}
        <div className="bg-[#111] border border-white/8 rounded-2xl p-5 flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20 shrink-0">
            <Activity className="text-blue-400" size={18} />
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold mb-0.5">
              Total Members
            </p>
            <p className="text-3xl font-bold tracking-tight">{stats.total}</p>
          </div>
        </div>

        {/* Risk Alerts */}
        <div className={`border rounded-2xl p-5 flex items-center gap-4 transition-all duration-500 ${
          stats.alerts > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-[#111] border-white/8'
        }`}>
          <div className={`p-3 rounded-xl border shrink-0 ${
            stats.alerts > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-gray-500/10 border-gray-500/20'
          }`}>
            <ShieldAlert className={stats.alerts > 0 ? 'text-red-400' : 'text-gray-500'} size={18} />
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold mb-0.5">Risk Alerts</p>
            <p className={`text-3xl font-bold tracking-tight ${stats.alerts > 0 ? 'text-red-400' : ''}`}>
              {stats.alerts}
            </p>
          </div>
        </div>

        {/* Exit Checkpoint / Countdown */}
        {exitInfo ? (
          <div className={`border rounded-2xl p-5 transition-all duration-500 ${
            isExpired ? 'bg-red-500/5 border-red-500/30' : 'bg-orange-500/5 border-orange-500/20'
          }`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg border ${
                  isExpired ? 'bg-red-500/10 border-red-500/20' : 'bg-orange-500/10 border-orange-500/20'
                }`}>
                  <Flag className={isExpired ? 'text-red-400' : 'text-orange-400'} size={14} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Exit Point</p>
                  <p className="text-sm font-bold text-white">Checkpoint {exitInfo.checkpoint_type}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-0.5">Time Left</p>
                <p className={`text-lg font-bold font-mono tabular-nums ${
                  isExpired ? 'text-red-400' : 'text-emerald-400'
                }`}>
                  {timeLeft || '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <Clock size={11} />
              <span>
                {exitInfo.end_time
                  ? new Date(exitInfo.end_time).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short',
                      hour: '2-digit', minute: '2-digit', hour12: true
                    })
                  : 'No deadline set'}
              </span>
              <span className="mx-1 text-gray-700">·</span>
              <MapPin size={11} />
              <span className="font-mono">
                {exitInfo.latitude?.toFixed(4)}, {exitInfo.longitude?.toFixed(4)}
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-[#111] border border-white/8 rounded-2xl p-5 flex items-center gap-3">
            <div className="p-3 bg-gray-500/10 rounded-xl border border-gray-500/20 shrink-0">
              <Flag className="text-gray-600" size={18} />
            </div>
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold mb-0.5">Exit Point</p>
              <p className="text-sm text-gray-600 font-medium">Not configured</p>
            </div>
          </div>
        )}
      </div>

      {/* Prediction Table */}
      <div className="bg-[#111] rounded-2xl border border-white/8 overflow-hidden relative">
        {isPredicting && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-20 flex items-center justify-center flex-col gap-3">
            <Loader2 className="animate-spin text-indigo-400" size={32} />
            <p className="text-xs font-semibold tracking-[0.15em] text-gray-400 uppercase">
              Running prediction model...
            </p>
          </div>
        )}

        <div className="px-6 py-4 border-b border-white/6 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Prediction Results — {viewMode === 'walk' ? 'Walking' : viewMode === 'vehicle' ? 'Vehicle' : 'Bus'}
          </p>
          <p className="text-xs text-gray-600">{predictions.length} member{predictions.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-6 py-3 text-[15px] font-semibold text-gray-200 uppercase tracking-widest">Member</th>
                <th className="px-6 py-3 text-[15px] font-semibold text-gray-200 uppercase tracking-widest">AI Prediction</th>
                <th className="px-6 py-3 text-[15px] font-semibold text-gray-200 uppercase tracking-widest">Risk</th>
              </tr>
            </thead>
            <tbody>
              {predictions.length === 0 ? (
                <tr>
                  <td colSpan="3" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-30">
                      <Activity size={36} className="text-gray-600" />
                      <p className="text-sm font-medium text-gray-500">
                        No members found for {viewMode} mode
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                predictions.map((p, i) => (
                  <tr
                    key={p.id}
                    className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors last:border-0 ${
                      i % 2 === 0 ? '' : 'bg-white/[0.01]'
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          p.is_late === null ? 'bg-gray-600' :
                          p.is_late ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)] animate-pulse' :
                          'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                        }`} />
                        <div>
                          <p className="text-sm font-semibold text-white leading-tight">{p.label}</p>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 inline-block ${
                            !p.status            ? 'text-gray-600 bg-gray-600/10' :
                            p.status === 'Missing' ? 'text-red-400 bg-red-400/10' :
                                                     'text-indigo-400 bg-indigo-400/10'
                          }`}>
                            {!p.status ? 'Not started' : p.status === 'Missing' ? '⚠ Missing' : `CP ${p.status}`}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span className="text-[11px] font-mono text-gray-400 bg-white/5 border border-white/8 px-3 py-1.5 rounded-lg leading-relaxed">
                        {p.info || 'Analyzing...'} | Left: {timeLeft}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      {p.risk === null ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-gray-700 bg-gray-700/20 text-gray-500 uppercase tracking-wider">
                          No Data
                        </span>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border uppercase tracking-wider ${
                            p.is_late
                              ? 'bg-red-500/10 border-red-500/25 text-red-400'
                              : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                          }`}>
                            {p.is_late ? '⚠ Delay Risk' : '✓ On Track'}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  p.risk > 75 ? 'bg-red-500' :
                                  p.risk > 50 ? 'bg-orange-400' :
                                  p.risk > 25 ? 'bg-yellow-400' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${p.risk}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-mono text-gray-400 w-8">{p.risk}%</span>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, isAlert }) => (
  <div className={`p-8 rounded-[2rem] border transition-all duration-500 ${
    isAlert
      ? 'border-red-500/30 bg-gradient-to-br from-red-500/10 to-transparent'
      : 'border-white/5 bg-[#1A1A1A]'
  }`}>
    <div className="mb-6 p-3 bg-white/5 w-fit rounded-2xl">{icon}</div>
    <p className="text-[11px] text-gray-500 uppercase font-black tracking-[0.1em]">{title}</p>
    <h2 className="text-5xl font-bold mt-2 tracking-tighter">{value}</h2>
  </div>
);

export default AnalyticsPage;