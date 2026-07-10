import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../client'; 
import { MapPin, Clock, Loader2, AlertTriangle, UserX, Cloud, Users, Footprints, ArrowRight, Star, ShieldCheck, Globe } from 'lucide-react';

const Homepage = ({ token, theme = 'dark' }) => {
  const [profile, setProfile] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);
  const [memberStats, setMemberStats] = useState({ total: 0, missing: 0 });
  const [missingMembers, setMissingMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const isDark = theme === 'dark';

  // References for automatic scrolling functionality
  const routeInfoRef = useRef(null);
  const missingMembersRef = useRef(null);

  const scrollToRouteInfo = () => {
    routeInfoRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToMissingMembers = () => {
    missingMembersRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
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
      <div className={`flex h-screen items-center justify-center transition-colors duration-300 ${isDark ? 'bg-[#1f1a17]' : 'bg-[#f6efe9]'}`}>
        <div className={`flex flex-col items-center gap-3 px-8 py-10 rounded-3xl shadow-xl border max-w-xs w-full text-center ${isDark ? 'bg-[#2a221e] border-[#433a32] text-[#fdf7ef]' : 'bg-[#fffaf5] border-[#e6d8c8] text-[#2f241f]'}`}>
          {/* Creative, moving/shaking location tracking layout */}
          <div className="relative flex items-center justify-center w-16 h-16 mb-2">
            <Loader2 className="animate-spin text-teal-600/30 absolute inset-0 w-full h-full" size={64} />
            <MapPin className="text-orange-500 animate-bounce drop-shadow-md z-10" size={32} />
            <span className="absolute bottom-2 w-4 h-1 bg-slate-300 rounded-full blur-[1px] opacity-70 animate-pulse"></span>
          </div>
          <p className={`font-bold text-base tracking-wide ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Syncing Routes...</p>
          <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Fetching live RFID checkpoint data</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans overflow-x-hidden pb-16 transition-colors duration-300 ${isDark ? 'bg-[#1f1a17] text-[#fdf7ef]' : 'bg-[#f6efe9] text-[#2f241f]'}`}>
      
      {/* 1. HERO SECTION (Teal Island Overlay Design) */}
      <div className="relative h-[65vh] min-h-[480px] w-full flex items-center px-4 sm:px-8 md:px-16 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('/img/travel1.jpg')` }}></div>
        <div className="absolute inset-0 bg-gradient-to-b from-teal-900/40 via-teal-900/20 to-slate-50"></div>
        
        <div className="relative z-10 w-full max-w-6xl mx-auto text-center md:text-left text-white mt-[-40px]">
          <p className="text-orange-400 font-bold tracking-widest uppercase text-xs sm:text-sm mb-3 flex items-center justify-center md:justify-start gap-2 drop-shadow-sm">
            <Footprints size={16} /> RFID Travel System
          </p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-4 max-w-2xl leading-tight text-white drop-shadow-md">
            The Best <span className="text-orange-400">Trips</span> Around The World With Us
          </h1>
          <p className="text-slate-100 max-w-xl text-sm sm:text-base mb-6 font-medium drop-shadow-sm">
            Welcome back, <span className="font-bold underline decoration-orange-400 decoration-2">{profile?.username || "Admin"}</span>! Monitor real-time checkpoint data, group locations, and track active member statuses across your entire route.
          </p>
          <button 
            onClick={scrollToRouteInfo}
            className="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm px-6 py-3 rounded-full transition-all duration-300 shadow-md hover:shadow-lg flex items-center gap-2 mx-auto md:mx-0"
          >
            View Current Checkpoint <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* 2. FLOATING SEARCH/STATUS BAR (Current Location) */}
      <div className="max-w-4xl mx-auto -mt-16 relative z-20 px-4 mb-16">
        <div className={`rounded-full p-3 shadow-xl border flex flex-col md:flex-row items-center gap-4 justify-between ${isDark ? 'bg-[#2a221e] border-[#433a32]' : 'bg-[#fffaf5] border-[#e6d8c8]'}`}>
          <div className="flex items-center gap-4 pl-4 w-full md:w-auto">
            <MapPin className="text-orange-500 shrink-0" size={24} />
            <div className="text-left">
              <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Your Location Status</p>
              <h2 className={`text-base font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                {currentLocation ? `Checkpoint ${currentLocation.checkpoint_type}` : "Status Pending"}
              </h2>
              <p className={`text-xs truncate max-w-[240px] md:max-w-xs ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>{currentLocationAddress}</p>
            </div>
          </div>
          
          <div className="h-px md:h-8 w-full md:w-px bg-slate-200"></div>

          <div className={`w-full md:w-auto flex items-center justify-between md:justify-end gap-4 px-4 md:px-0 py-2 md:py-0 rounded-full ${isDark ? 'bg-[#211b17] md:bg-transparent' : 'bg-[#f3e7db] md:bg-transparent'}`}>
            {memberStats.missing > 0 ? (
              <div className="flex items-center gap-2 text-red-500 px-3 py-1 rounded-full text-xs font-semibold bg-red-50">
                <AlertTriangle size={14} className="animate-pulse" />
                <span>{memberStats.missing} Members Overdue</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                All Members Accounted For
              </div>
            )}
            
            <button 
              disabled={!(memberStats.missing > 0)}
              onClick={scrollToMissingMembers}
              className={`font-bold text-xs uppercase tracking-wider px-6 py-3 rounded-full shadow-sm transition-all ${
                memberStats.missing > 0 
                  ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer animate-bounce' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
              }`}
            >
              Search
            </button>
          </div>
        </div>
      </div>

      {/* 3. MEMBER OVERVIEW (Reordered Layout Grid) */}
      <div className="max-w-6xl mx-auto px-4 mb-16">
        <div className="text-center mb-10">
          <h2 className={`text-3xl font-extrabold tracking-tight mb-2 ${isDark ? 'text-[#fdf7ef]' : 'text-slate-900'}`}>Member Overview</h2>
          <p className={`text-sm max-w-md mx-auto ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Real-time headcount filters of active travelers sorted by their registered checkpoint destinations.</p>
        </div>

        <div className="flex flex-col gap-6">
          {/* Row 1: Global Stats Boxes (Group Size and Missing/Overdue side-by-side) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className={`p-6 rounded-3xl shadow-md border relative group overflow-hidden ${isDark ? 'bg-[#2a221e] border-[#433a32]' : 'bg-[#fffaf5] border-[#e6d8c8]'}`}>
              <div className="absolute top-0 left-0 w-full h-1.5 bg-teal-600"></div>
              <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total Members</p>
              <p className={`text-4xl font-black mb-2 ${isDark ? 'text-[#fdf7ef]' : 'text-slate-900'}`}>{memberStats.total || 0}</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${isDark ? 'text-teal-300 bg-teal-500/10' : 'text-teal-600 bg-teal-50'}`}>Total Registered</span>
            </div>

            <div className={`p-6 rounded-3xl shadow-md border relative group overflow-hidden ${isDark ? 'bg-[#2a221e] border-[#433a32]' : 'bg-[#fffaf5] border-[#e6d8c8]'}`}>
              <div className={`absolute top-0 left-0 w-full h-1.5 ${memberStats.missing > 0 ? 'bg-red-500' : 'bg-slate-200'}`}></div>
              <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Missing / Overdue</p>
              <p className={`text-4xl font-black mb-2 ${memberStats.missing > 0 ? 'text-red-500' : isDark ? 'text-slate-400' : 'text-slate-400'}`}>{memberStats.missing || 0}</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${memberStats.missing > 0 ? 'bg-red-500/10 text-red-600' : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                Missing Members
              </span>
            </div>
          </div>

          {/* Row 2: Checkpoint specific headcount boxes rendered cleanly directly underneath */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {checkpoints.map((cp) => (
              <div key={cp.id} className={`min-h-[152px] p-6 rounded-3xl shadow-sm border hover:shadow-md transition-all ${isDark ? 'bg-[#2a221e] border-[#433a32]' : 'bg-[#fffaf5] border-[#e6d8c8]'}`}>
                <div className="flex justify-between items-start mb-3 gap-2">
                  <p className={`text-sm font-bold truncate ${isDark ? 'text-[#fdf7ef]' : 'text-slate-800'}`}>Checkpoint {cp.checkpoint_type}</p>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>ID: {cp.checkpoint_type}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <p className={`text-3xl font-black ${isDark ? 'text-teal-300' : 'text-teal-900'}`}>{memberStats[cp.checkpoint_type] || 0}</p>
                  <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Scanned In</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. WHY CHOOSE US (Route Information Cards) */}
      <div ref={routeInfoRef} className="max-w-6xl mx-auto px-4 mb-16 scroll-mt-6">
        <div className="text-center mb-12">
          <h2 className={`text-3xl font-extrabold tracking-tight mb-2 ${isDark ? 'text-[#fdf7ef]' : 'text-slate-900'}`}>More About Checkpoints</h2>
          <p className={`text-sm max-w-md mx-auto ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Explore the detailed information about each checkpoint and where to meet up in the journey</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {checkpoints.map((cp) => (
            <div key={cp.id} className={`rounded-3xl shadow-sm border p-6 flex flex-col justify-between transition-all hover:shadow-md relative overflow-hidden ${
              cp.is_exit ? 'border-orange-200 ring-4 ring-orange-500/5' : isDark ? 'border-[#433a32]' : 'border-[#e6d8c8]'
            } ${isDark ? 'bg-[#2a221e]' : 'bg-[#fffaf5]'}`}>
              {cp.is_exit && (
                <div className="absolute top-0 right-0 bg-orange-500 text-white text-[9px] font-black tracking-widest px-3 py-1 rounded-bl-xl uppercase">
                  EXIT
                </div>
              )}
              
              <div>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className={`p-2.5 rounded-2xl ${cp.is_exit ? 'bg-orange-50 text-orange-500' : 'bg-teal-50 text-teal-700'}`}>
                    {cp.is_exit ? <Globe size={20} /> : <ShieldCheck size={20} />}
                  </div>
                  <div>
                    <h3 className={`font-bold text-base ${isDark ? 'text-[#fdf7ef]' : 'text-slate-900'}`}>Checkpoint {cp.checkpoint_type}</h3>
                    <p className={`text-[11px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{cp.is_exit ? 'Final Exit Gate' : 'Verified Waypoint'}</p>
                  </div>
                </div>

                <div className={`space-y-3 text-xs border-t pt-4 ${isDark ? 'text-slate-300 border-[#433a32]' : 'text-slate-600 border-slate-50'}`}>
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
                    <span className="line-clamp-2 leading-relaxed">{cp.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-slate-400 shrink-0" />
                    <span>Target: {cp.end_time ? new Date(cp.end_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "Open Schedule"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Cloud size={14} className="text-slate-400 shrink-0" />
                    <span className="capitalize">{cp.weather || "Conditions clear"}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. EMERGENCY SECTION (Target Anchor Point for Search Box Click) */}
      <div ref={missingMembersRef} className="scroll-mt-24">
        {missingMembers.length > 0 && (
          <div className="max-w-6xl mx-auto px-4 mb-16">
            <div className="bg-white border border-red-100 rounded-3xl shadow-xl overflow-hidden">
              <div className="bg-red-500 px-6 py-4 flex items-center justify-between text-white">
                <h2 className="font-bold flex items-center gap-2 text-sm sm:text-base">
                  <UserX size={18} /> Urgent Incident Room: Missing Members
                </h2>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">Requires Immediate Contact</span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Member Details</th>
                      <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">Assigned Squad</th>
                      <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-right">Emergency Contact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {missingMembers.map(m => (
                      <tr key={m.user_id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900 block">{m.username}</span>
                          <span className="text-[11px] text-slate-400 font-mono">{m.user_id?.substring(0, 8)}...</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs inline-flex items-center px-2.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-800">
                            {m.group || "Solo Traveler"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <a href={`tel:${m.phone_number}`} className="font-mono text-xs text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-full font-bold border border-orange-100 transition-colors inline-block">
                            {m.phone_number || "Unavailable"}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 6. ABOUT US / STATS SUMMARY */}
      <div className="max-w-6xl mx-auto px-4 mb-8">
        <div className="bg-teal-950 text-white rounded-[2rem] p-8 md:p-12 relative overflow-hidden shadow-xl text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="absolute inset-0 bg-cover bg-center mix-blend-overlay opacity-15" style={{ backgroundImage: `url('/img/travel2.jpg')` }}></div>
          
          <div className="relative z-10 max-w-md">
            <h3 className="text-2xl font-bold mb-2">Safe Travels Ahead</h3>
            <p className="text-teal-200/80 text-xs sm:text-sm leading-relaxed">
              Wander for distraction, travel for fulfillment. Ensure all checkpoints are fully cleared and synchronizations pass prior to proceeding to subsequent nodes.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-6 sm:gap-10 shrink-0 border-t md:border-t-0 md:border-l border-teal-800 pt-6 md:pt-0 md:pl-10">
            <div className="text-center">
              <p className="text-2xl sm:text-3xl font-black text-orange-400">5+</p>
              <p className="text-[10px] text-teal-200 uppercase font-bold tracking-wider mt-1">Years Exp</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-3xl font-black text-orange-400">15+</p>
              <p className="text-[10px] text-teal-200 uppercase font-bold tracking-wider mt-1">Happy Clients</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-3xl font-black text-orange-400">4.7</p>
              <div className="flex items-center justify-center gap-0.5 text-orange-400 mt-1">
                <Star size={10} fill="currentColor" />
                <span className="text-[10px] text-teal-200 uppercase font-bold tracking-wider">Rating</span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Homepage;