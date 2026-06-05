import React, { useState, useEffect } from 'react';
import { supabase } from '../client'; 
import { MapPin, Clock, Loader2, AlertTriangle, UserX, Cloud, Users, Footprints } from 'lucide-react';

const Homepage = ({ token }) => {
  const [profile, setProfile] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);
  const [memberStats, setMemberStats] = useState({ total: 0, missing: 0 });
  const [missingMembers, setMissingMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Fire all independent database requests simultaneously
        const [profileRes, checkpointsRes, membersRes] = await Promise.all([
          supabase.from('Profiles').select('*').eq('user_id', user.id).single(),
          supabase.from('checkpoints').select('*').order('checkpoint_type', { ascending: true }),
          supabase.from('Profiles').select('*')
        ]);

        if (profileRes.data) setProfile(profileRes.data);
        
        if (checkpointsRes.data) {
          setCheckpoints(checkpointsRes.data);
          
          if (membersRes.data) {
            const allMembers = membersRes.data;
            const stats = {
              total: allMembers.length,
              missing: allMembers.filter(m => m.status === 'Missing').length,
            };

            checkpointsRes.data.forEach(cp => {
              stats[cp.checkpoint_type] = allMembers.filter(m => m.status === cp.checkpoint_type).length;
            });

            setMemberStats(stats);
            setMissingMembers(allMembers.filter(m => m.status === 'Missing'));
          }
        }
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      // Ensures the loading screen turns off even if an error occurs
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchData();
    const subscription = supabase.channel('hp-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Profiles' }, () => fetchData())
      .subscribe();
    return () => supabase.removeChannel(subscription);
  }, [token]);

  const userStatus = profile?.status;
  const currentLocation = checkpoints.find(cp => cp.checkpoint_type === userStatus) || null;
  const currentLocationAddress = currentLocation?.address || "Not Checked In";

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-indigo-500" size={40} />
          <p className="text-slate-400 font-medium">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-taupe-900 min-h-screen text-slate-50 font-sans overflow-x-hidden">
      
      {/* 1. HERO SECTION */}
      <div className="relative h-[40vh] min-h-[320px] w-full flex items-center px-4 sm:px-8 md:px-16 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center opacity-90" style={{ backgroundImage: `url('/img/travel1.jpg')` }}></div>
        <div className="absolute inset-0 bg-gradient-to-r from-taupe-900 via-taupe-700/60 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-taupe-900/50"></div>
        
        <div className="relative z-10 w-full max-w-6xl mx-auto">
          <p className="text-indigo-400 font-semibold tracking-widest uppercase text-sm mb-2 flex items-center gap-2">
            <Footprints size={16} /> RFID Travel System
          </p>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2 text-white">
            Welcome back, {profile?.username || "Admin"}
          </h1>
          <p className="text-slate-400 max-w-xl text-sm md:text-base">
            Monitor real-time checkpoint data, group locations, and track active member statuses across your entire route.
          </p>
        </div>
      </div>

      {/* 2. CURRENT LOCATION BAR */}
      <div className="max-w-6xl mx-auto -mt-10 relative z-20 px-4 mb-12">
        <div className="bg-cyan-950 border border-lime-400 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-5">
              <div className="p-3.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400">
                <MapPin size={28} />
              </div>
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Your Current Location</p>
                <div className="flex items-baseline gap-3">
                  <h2 className="text-2xl font-bold text-white">
                    {currentLocation ? `Checkpoint ${currentLocation.checkpoint_type}` : "Status Pending"}
                  </h2>
                </div>
                <p className="text-slate-400 text-sm mt-0.5">{currentLocationAddress}</p>
              </div>
            </div>

            {memberStats.missing > 0 && (
              <div className="flex items-center gap-2 bg-red-500/10 text-red-400 px-5 py-2.5 rounded-lg border border-red-500/20 shadow-sm animate-pulse">
                <AlertTriangle size={18} />
                <span className="font-semibold text-sm">{memberStats.missing} Members Overdue</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. MEMBER COUNTS */}
      <div className="max-w-6xl mx-auto px-4 mb-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white">
            <Users size={20} className="text-indigo-400" /> Member Overview
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {/* Primary Stats */}
          <div className="col-span-2 lg:col-span-3 bg-slate-800 border border-slate-700 p-6 rounded-2xl">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Total Members</p>
            <p className="text-4xl font-extrabold text-white">{memberStats.total || 0}</p>
          </div>

          <div className="col-span-2 lg:col-span-3 bg-slate-800 border border-red-500/30 p-6 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 text-red-500">
              <AlertTriangle size={64} />
            </div>
            {/* Fixed the typo from text-xm to text-sm */}
            <p className="text-red-400 text-sm font-bold uppercase tracking-wider mb-2">Missing / Overdue</p>
            <p className="text-4xl font-extrabold text-red-400">{memberStats.missing || 0}</p>
          </div>

          {/* Checkpoints Stats */}
          {checkpoints.map((cp) => (
            <div key={cp.id} className="col-span-1 lg:col-span-2 bg-slate-800 border border-slate-700 p-5 rounded-2xl">
              <p className="text-slate-400 text-[15px] font-bold uppercase tracking-wider mb-1">Checkpoint {cp.checkpoint_type}</p>
              <div className="flex items-baseline gap-1.5">
                <p className="text-2xl font-bold text-white">{memberStats[cp.checkpoint_type] || 0}</p>
                <span className="text-[20px] text-slate-500 font-medium">Scanned</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. CHECKPOINT INFORMATION */}
      <div className="max-w-6xl mx-auto px-4 mb-16">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-white">
          <Clock size={20} className="text-indigo-400" /> Route Information
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {checkpoints.map((cp) => (
            <div key={cp.id} className={`border rounded-2xl p-6 flex flex-col h-full transition-colors ${
              cp.is_exit
                ? 'bg-orange-500/5 border-orange-500/30 hover:border-orange-500/60'
                : 'bg-slate-800 border-slate-700 hover:border-indigo-500/50'
            }`}>
              <div className="flex justify-between items-start mb-5">
                <div className="flex items-center gap-2">
                  <h3 className={`text-lg font-bold ${cp.is_exit ? 'text-orange-300' : 'text-white'}`}>
                    Checkpoint {cp.checkpoint_type}
                  </h3>
                  {cp.is_exit && (
                    <span className="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest bg-orange-500 text-white animate-pulse">
                      EXIT
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider ${
                  cp.is_exit
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                    : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                }`}>
                  {cp.is_exit ? '🚩 Exit Point' : 'Waypoint'}
                </span>
              </div>
            
              <div className="space-y-3.5 text-sm mt-auto">
                <div className="flex items-start gap-3 text-slate-300">
                  <MapPin size={16} className="text-slate-500 mt-0.5 shrink-0" /> 
                  <span className="leading-snug">{cp.address}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-300">
                  <Clock size={16} className="text-slate-500 shrink-0" /> 
                  <span> Deadline: {cp.end_time ? new Date(cp.end_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "No active deadline"}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-300">
                  <Cloud size={16} className="text-slate-500 shrink-0" /> 
                  <span>{cp.weather || "Conditions clear"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. EMERGENCY CONTACT LIST */}
      {missingMembers.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 mb-16">
          <div className="bg-slate-800 border border-red-500/30 rounded-2xl overflow-hidden shadow-lg">
            <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-4 flex items-center justify-between">
              <h2 className="font-bold text-red-400 flex items-center gap-2">
                <UserX size={18} /> Emergency : Missing Members
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-800/50 text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="px-6 py-3.5 font-medium">Member Name</th>
                    <th className="px-6 py-3.5 font-medium">Assigned Group</th>
                    <th className="px-6 py-3.5 font-medium text-right">Contact Number</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 text-slate-300">
                  {missingMembers.map(m => (
                    <tr key={m.user_id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-6 py-4 font-semibold text-white">{m.username}</td>
                      <td className="px-6 py-4">{m.group || "Solo Traveler"}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-mono text-red-300 bg-red-500/10 px-2 py-1 rounded text-xs border border-red-500/20">
                          {m.phone_number || "Unavailable"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. BOTTOM IMAGE SECTION */}
      <div className="relative h-[40vh] w-full mt-10 overflow-hidden group">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-[2000ms] group-hover:scale-105"
          style={{ backgroundImage: `url('/img/travel2.jpg')`, opacity: 0.7 }}
        ></div>
        
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-500 via-taupe-900/20 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-taupe-900 to-transparent h-32"></div>

        <div className="relative z-10 h-full flex flex-col items-center justify-center px-4 text-center">
          <h2 className="text-white text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Safe Travels
          </h2>
          <p className="text-slate-400 uppercase tracking-widest text-xs font-semibold max-w-md">
            Wander for distraction, travel for fulfilment. Ensure all checkpoints are cleared before proceeding.
          </p>
        </div>
      </div>
      
    </div>
  );
};

export default Homepage;