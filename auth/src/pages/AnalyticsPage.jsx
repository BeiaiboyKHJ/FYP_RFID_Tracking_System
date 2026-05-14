import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../client';
import { BrainCircuit, Loader2, Activity, ShieldAlert, Footprints, Truck, Bus} from 'lucide-react';

const AnalyticsPage = ({ role }) => {
  const [viewMode, setViewMode] = useState('walk'); 
  const [isPredicting, setIsPredicting] = useState(false);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [predictions, setPredictions] = useState([]);
  const [stats, setStats] = useState({ total: 0, alerts: 0 });

  const runPrediction = useCallback(async (modeToAnalyze) => {
    const activeMode = modeToAnalyze || viewMode;
    setIsPredicting(true);
    
    try {
      // 1. FETCH TOTAL GLOBAL MEMBERS (Real-time count from Profiles)
      const { count: globalTotal, error: countError } = await supabase
        .from('Profiles')
        .select('*', { count: 'exact', head: true });

      if (countError) console.error("Database Count Error:", countError);

      // 2. FETCH FILTERED DATA (The Inner Join)
      // Only gets members who are in the 'locations' table and haven't exited
      const { data, error } = await supabase
        .from('locations')
        .select(`
          *,
          Profiles!fk_profiles!inner ( 
            username, gender, age, body_mass, body_size, shoe_size, vehicle_type 
          )
        `)
        .eq('is_exit', false)
        .eq('Profiles.vehicle_type', activeMode);

      if (error) throw error;

      if (!data || data.length === 0) {
        setPredictions([]);
        setStats({ total: globalTotal || 0, alerts: 0 });
        return;
      }

      // 3. MAP DATA FOR FLASK AI (Calculates deadline on the fly)
      const data_list = data.map(item => {
        const bio = item.Profiles || {};
        const now = new Date();
        const deadlineDate = new Date(item.end_time);
        const minutesRemaining = (deadlineDate - now) / 1000 / 60;

        return {
          id: item.id,
          transport_mode: bio.vehicle_type || 'walk',
          distance: item.current_distance || 0,
          age: bio.age || 25,
          mass: bio.body_mass || 70,
          height: bio.body_size || 1.7,
          shoe: bio.shoe_size || 40,
          deadline: minutesRemaining,
          label: bio.username || `Member ${item.id.slice(0,4)}`
        };
      });

      // 4. CALL FLASK AI SERVER (LSTM/Prediction Logic)
      const response = await fetch("http://127.0.0.1:5000/predict", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: data_list })
      });

      if (!response.ok) throw new Error("Flask AI Server is offline");

      const result = await response.json();
      
      setPredictions(result.predictions || []);
      setStats({
        total: globalTotal || 0,
        alerts: (result.predictions || []).filter(p => p.is_late).length
      });

    } catch (err) {
      console.error("Analytics Logic Error:", err);
      setPredictions([]);
    } finally {
      setIsPredicting(false);
    }
  }, [viewMode]);

  // Admin Function: Batch update all users to a new transport mode
  const handleGlobalModeChange = async (newMode) => {
    if (role?.toLowerCase() !== 'admin') {
        setViewMode(newMode); 
        return;
    }

    setIsUpdatingAll(true);
    setViewMode(newMode);
    
    try {
      const { error } = await supabase
        .from('Profiles')
        .update({ vehicle_type: newMode })
        .not('user_id', 'is', null);

      if (error) throw error;
      await runPrediction(newMode); // Re-run AI analysis immediately after update
    } catch (err) {
      console.error("Batch Update Error:", err.message);
    } finally {
      setIsUpdatingAll(false);
    }
  };

  useEffect(() => {
    runPrediction();
  }, [runPrediction]);

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-white p-8 font-sans">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <BrainCircuit className="text-indigo-500" size={32} /> VNFCPASS Analytics
          </h1>
          <p className="text-gray-500 mt-1">Real-time risk assessment and AI delay prediction</p>
        </div>

        {/* Transport Mode Switcher */}
        <div className={`bg-[#1A1A1A] p-1.5 rounded-2xl flex gap-1 border border-white/5 ${isUpdatingAll ? 'opacity-50 pointer-events-none' : ''}`}>
          {[
            { id: 'walk', icon: <Footprints size={16}/>, label: 'Walking' },
            { id: 'vehicle', icon: <Truck size={16}/>, label: 'Vehicle' },
            { id: 'bus', icon: <Bus size={16}/>, label: 'Bus' }
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => handleGlobalModeChange(m.id)}
              className={`px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all text-sm font-bold ${
                viewMode === m.id 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              } ${role?.toLowerCase() !== 'admin' ? 'cursor-default' : 'cursor-pointer'}`}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Level Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <StatCard 
          title="Total Registered Members" 
          value={stats.total} 
          icon={<Activity className="text-blue-500" />} 
        />
        <StatCard 
          title="Risk Alerts (High Delay)" 
          value={stats.alerts} 
          icon={<ShieldAlert className="text-red-500" />} 
          isAlert={stats.alerts > 0} 
        />
      </div>

      {/* Analytics Main Table */}
      <div className="bg-[#1A1A1A] rounded-3xl border border-white/10 overflow-hidden relative shadow-2xl">
        {(isUpdatingAll || isPredicting) && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-20 flex items-center justify-center flex-col gap-4">
             <Loader2 className="animate-spin text-indigo-500" size={48} />
             <p className="text-sm font-black tracking-[0.2em] text-indigo-200 uppercase animate-pulse">Running AI Prediction Model...</p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white/5 text-gray-500 text-[11px] uppercase tracking-[0.15em] font-black">
              <tr>
                <th className="p-6 border-b border-white/5">Member Identity</th>
                <th className="p-6 border-b border-white/5">AI Prediction Data</th>
                <th className="p-6 border-b border-white/5">Risk Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {predictions.length === 0 ? (
                <tr>
                  <td colSpan="3" className="p-24 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-20">
                       <Activity size={48} />
                       <p className="text-lg font-medium tracking-tight">No active tracking data for {viewMode} mode.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                predictions.map((p) => (
                  <tr key={p.id} className="group hover:bg-white/[0.03] transition-all">
                    <td className="p-6 font-bold flex items-center gap-4">
                      <div className={`w-2.5 h-2.5 rounded-full ${p.is_late ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'} shadow-[0_0_10px_rgba(16,185,129,0.4)]`}></div>
                      <span className="group-hover:translate-x-1 transition-transform">{p.label}</span>
                    </td>
                    <td className="p-6">
                      <code className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-lg text-xs font-mono border border-indigo-500/20">
                        {p.info || 'Analyzing metrics...'}
                      </code>
                    </td>
                    <td className="p-6">
                      <span className={`inline-flex items-center gap-2 text-[11px] font-black px-3 py-1.5 rounded-lg border tracking-wider ${
                        p.is_late 
                          ? 'bg-red-500/10 border-red-500/20 text-red-500' 
                          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                      }`}>
                        {p.is_late ? 'DELAY RISK' : 'ON TRACK'} ({p.risk}%)
                      </span>
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

// Reusable Stat Component
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