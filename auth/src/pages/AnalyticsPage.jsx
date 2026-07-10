import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../client';
import { BrainCircuit, Loader2, Activity, ShieldAlert, Footprints, Truck, Bus, Flag, Clock, MapPin, AlertCircle } from 'lucide-react';

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

  const formatExtraTime = (min) => {
    if (min <= 0) return null;
    const h = Math.floor(min / 60);
    const m = Math.floor(min % 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m} mins`;
  };

  const useRoadApproximation = import.meta.env.VITE_USE_OSRM !== 'true';

  const estimateDistanceMeters = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const toRadians = (deg) => deg * (Math.PI / 180);
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return 6371000 * c;
  };

  const calculateRoadDistance = async (lat1, lon1, lat2, lon2, transport = 'driving') => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    if (useRoadApproximation) {
      return estimateDistanceMeters(lat1, lon1, lat2, lon2);
    }

    try {
      const profile = transport === 'walk' ? 'foot' : 'driving';
      const url     = `https://router.project-osrm.org/route/v1/${profile}/${lon1},${lat1};${lon2},${lat2}?overview=false`;
      const res     = await fetch(url);
      const data    = await res.json();
      if (data.code === 'Ok' && data.routes?.length > 0) return data.routes[0].distance;
      return estimateDistanceMeters(lat1, lon1, lat2, lon2);
    } catch (err) {
      console.error("OSRM error:", err);
      return estimateDistanceMeters(lat1, lon1, lat2, lon2);
    }
  };

  const runPrediction = useCallback(async (modeToAnalyze) => {
    const activeMode = modeToAnalyze || viewMode;
    setIsPredicting(true);
    try {
      const { count: globalTotal } = await supabase
        .from('Profiles').select('*', { count: 'exact', head: true });

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
      const predictionsWithStatus = (result.predictions || []).map(p => {
        const extraTime = (p.time_needed_min ?? 0) - (p.deadline_min ?? 0);
        return {
          ...p,
          status: statusMap[p.id] || null,
          extra_time: extraTime
        };
      });
      setPredictions(predictionsWithStatus);
      setStats({ total: globalTotal || 0, alerts: predictionsWithStatus.filter(p => p.is_late).length });

    } catch (err) {
      console.error("AI Logic Error:", err);
      setPredictions([]);
    } finally {
      setIsPredicting(false);
    }
  }, [viewMode]);

  useEffect(() => { runPredictionRef.current = runPrediction; }, [runPrediction]);

  useEffect(() => {
    if (skipNextEffect.current) { skipNextEffect.current = false; return; }
    runPrediction();
  }, [runPrediction]);

  useEffect(() => {
    const sub = supabase
      .channel('analytics-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkpoints' }, () => { runPredictionRef.current?.(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, () => { runPredictionRef.current?.(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Profiles' }, () => { runPredictionRef.current?.(); })
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
    <div className="min-h-screen bg-taupe-300 text-stone-900 p-6 lg:p-10" style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif" }}>

      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="p-2.5 rounded-xl bg-indigo-600/10 border border-indigo-600/10">
              <BrainCircuit className="text-indigo-600" size={22} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-950">
              Member's Latest Location and Late Prediction
            </h1>
          </div>
          <p className="text-stone-600 text-sm ml-14">Real-time AI Delay Prediction and Risk Assessment</p>
        </div>

        {/* Mode Switcher */}
        <div className="bg-stone-950 p-1 rounded-xl flex gap-1 shadow-sm">
          {MODE_CONFIG.map((m) => (
            <button
              key={m.id}
              onClick={() => handleModeChange(m.id)}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 text-xs font-semibold ${
                viewMode === m.id
                  ? 'bg-rose-400 text-stone-950 shadow-md'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
              }`}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {/* Total Members */}
        <div className="bg-taupe-400 border border-stone-300/60 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-blue-600/10 rounded-xl border border-blue-200 shrink-0">
            <Activity className="text-blue-600" size={20} />
          </div>
          <div>
            <p className="text-[11px] text-stone-600 uppercase tracking-wider font-bold mb-0.5">Total Members</p>
            <p className="text-3xl font-bold tracking-tight text-stone-950">{stats.total}</p>
          </div>
        </div>

        {/* Risk Alerts */}
        <div className={`border rounded-2xl p-5 flex items-center gap-4 transition-all duration-500 shadow-sm ${
          stats.alerts > 0 ? 'bg-red-50 border-red-200' : 'bg-taupe-400 border-stone-300/60'
        }`}>
          <div className={`p-3 rounded-xl border shrink-0 ${
            stats.alerts > 0 ? 'bg-red-200/50 border-red-300' : 'bg-stone-200 border-stone-300'
          }`}>
            <ShieldAlert className={stats.alerts > 0 ? 'text-red-600' : 'text-stone-500'} size={20} />
          </div>
          <div>
            <p className="text-[11px] text-stone-600 uppercase tracking-wider font-bold mb-0.5">Risk Alerts</p>
            <p className={`text-3xl font-bold tracking-tight ${stats.alerts > 0 ? 'text-red-600' : 'text-stone-900'}`}>
              {stats.alerts}
            </p>
          </div>
        </div>

        {/* Exit Checkpoint / Countdown */}
        {exitInfo ? (
          <div className={`border rounded-2xl p-5 transition-all duration-500 shadow-sm ${
            isExpired ? 'bg-red-50 border-red-200' : 'bg-stone-50 border-stone-300/80'
          }`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg border ${
                  isExpired ? 'bg-red-100 border-red-200' : 'bg-amber-100 border-amber-200'
                }`}>
                  <Flag className={isExpired ? 'text-red-600' : 'text-amber-700'} size={14} />
                </div>
                <div>
                  <p className="text-[10px] text-stone-500 uppercase tracking-wider font-bold">Exit Point</p>
                  <p className="text-sm font-bold text-stone-900">Checkpoint {exitInfo.checkpoint_type}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-stone-500 uppercase tracking-wider font-bold mb-0.5">Time Left</p>
                <p className={`text-lg font-bold font-mono tabular-nums ${
                  isExpired ? 'text-red-600' : 'text-emerald-600'
                }`}>
                  {timeLeft || '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-stone-600 border-t border-stone-200/60 pt-2.5">
              <Clock size={12} className="text-stone-400" />
              <span>
                {exitInfo.end_time
                  ? new Date(exitInfo.end_time).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short',
                      hour: '2-digit', minute: '2-digit', hour12: true
                    })
                  : 'No deadline set'}
              </span>
              <span className="mx-1 text-stone-300">·</span>
              <MapPin size={12} className="text-stone-400" />
              <span className="font-mono">
                {exitInfo.latitude?.toFixed(4)}, {exitInfo.longitude?.toFixed(4)}
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-stone-100 border border-stone-300/60 rounded-2xl p-5 flex items-center gap-3 shadow-sm">
            <div className="p-3 bg-stone-200 rounded-xl border border-stone-300 shrink-0">
              <Flag className="text-stone-400" size={20} />
            </div>
            <div>
              <p className="text-[11px] text-stone-500 uppercase tracking-wider font-bold mb-0.5">Exit Point</p>
              <p className="text-sm text-stone-500 font-medium">Not configured</p>
            </div>
          </div>
        )}
      </div>

      {/* Prediction Table Container */}
      <div className="bg-stone-50 rounded-2xl border border-stone-300/80 shadow-sm overflow-hidden relative">
        {isPredicting && (
          <div className="absolute inset-0 bg-stone-100/80 backdrop-blur-xs z-20 flex items-center justify-center flex-col gap-3">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
            <p className="text-xs font-bold tracking-widest text-stone-600 uppercase">
              Running prediction model...
            </p>
          </div>
        )}

        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-100/50">
          <p className="text-xs font-bold text-stone-700 uppercase tracking-wider">
            Prediction Results — {viewMode === 'walk' ? 'Walking' : viewMode === 'vehicle' ? 'Vehicle' : 'Bus'}
          </p>
          <div className="px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-100 flex items-center gap-1.5">
            <span className="text-indigo-700 font-bold text-xs">{predictions.length}</span>
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Members</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-100/30">
                <th className="px-6 py-3.5 text-xs font-bold text-stone-500 uppercase tracking-wider w-1/4">Member</th>
                <th className="px-6 py-3.5 text-xs font-bold text-stone-500 uppercase tracking-wider w-2/5">AI Prediction Timeline</th>
                <th className="px-6 py-3.5 text-xs font-bold text-stone-500 uppercase tracking-wider w-1/3">Risk Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200/70">
              {predictions.length === 0 ? (
                <tr>
                  <td colSpan="3" className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-2.5 text-stone-400">
                      <Activity size={32} />
                      <p className="text-sm font-medium">No members active in {viewMode} mode</p>
                    </div>
                  </td>
                </tr>
              ) : (
                predictions.map((p, i) => (
                  <tr key={p.id} className="hover:bg-stone-100/40 transition-colors">
                    {/* Column 1: Member Name & Status pill */}
                    <td className="px-6 py-4.5 align-top">
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          p.is_late === null ? 'bg-stone-400' :
                          p.is_late ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse' :
                          'bg-emerald-500'
                        }`} />
                        <div>
                          <p className="text-sm font-bold text-stone-950 leading-none mb-1.5">{p.label}</p>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md inline-block ${
                            !p.status            ? 'text-stone-500 bg-stone-200/60' :
                            p.status === 'Missing' ? 'text-red-700 bg-red-100' :
                                                     'text-indigo-700 bg-indigo-50 border border-indigo-100'
                          }`}>
                            {!p.status ? 'Not started' : p.status === 'Missing' ? '⚠ Missing' : `CP ${p.status}`}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Column 2: Route Prediction details */}
                    <td className="px-6 py-4.5 align-top">
                      <div className="inline-flex items-center gap-2 text-xs font-mono text-stone-800 bg-stone-200/60 border border-stone-300/40 px-3 py-2 rounded-lg">
                        <span className="font-semibold text-stone-900">{p.info || 'Analyzing...'}</span>
                        <span className="text-stone-400">|</span>
                        <span className="text-stone-600">Global Limit: {timeLeft}</span>
                      </div>
                    </td>

                    {/* Column 3: Risk Bar */}
                    <td className="px-6 py-4.5 align-top">
                      {p.risk === null ? (
                        <span className="inline-flex text-[10px] font-bold px-2 py-1 rounded bg-stone-100 text-stone-400 border border-stone-200 uppercase tracking-wider">
                          No Data
                        </span>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2.5">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                              p.is_late
                                ? 'bg-red-50 border-red-200 text-red-700'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            }`}>
                              {p.is_late ? '⚠ Delay Risk' : '✓ On Track'}
                            </span>
                            <span className="text-xs font-bold font-mono text-stone-600">{p.risk}%</span>
                          </div>
                          
                          {/* Visual Meter Bar */}
                          <div className="w-32 h-2 bg-stone-200 rounded-full overflow-hidden border border-stone-300/40">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                p.risk > 75 ? 'bg-red-500' :
                                p.risk > 50 ? 'bg-amber-500' :
                                p.risk > 25 ? 'bg-yellow-400' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${p.risk}%` }}
                            />
                          </div>

                          {/* EXTRA TIME ALERT PILL NOW MOVED HERE (UNDER THE RISK INDICATOR) */}
                          {p.extra_time > 0 && (
                            <div className="flex items-center gap-1 bg-red-50 border border-red-200 text-red-700 px-2 py-1 rounded-md text-[11px] font-bold w-fit animate-pulse mt-1">
                              <AlertCircle size={12} className="shrink-0 text-red-600" />
                              <span>Extra Time Needed: {formatExtraTime(p.extra_time)}</span>
                            </div>
                          )}
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