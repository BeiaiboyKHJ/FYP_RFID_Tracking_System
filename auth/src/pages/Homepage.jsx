import React, { useState, useEffect } from 'react';
import { supabase } from '../client'; 
import { MapPin, Clock, Loader2, AlertTriangle, UserCheck, UserX, Cloud, Users, CheckCircle2, HelpCircle, Footprints } from 'lucide-react';

const Homepage = ({ token }) => {
  const [profile, setProfile] = useState(null);
  const [checkpoints, setCheckpoints] = useState({ A: null, B: null });
  const [memberStats, setMemberStats] = useState({ total: 0, atA: 0, atB: 0, missing: 0 });
  const [missingMembers, setMissingMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Logic remains the same as your existing code ---
  const fetchData = async () => {
    try {
      if (token?.user?.id) {
        const { data: profileData } = await supabase
          .from('Profiles')
          .select('username,status')
          .eq('user_id', token.user.id)
          .single();
        setProfile(profileData);
      }
      const { data: locData } = await supabase.from('locations').select('*').order('created_at', { ascending: false });
      if (locData) {
        setCheckpoints({
          A: locData.find(l => l.checkpoint_type === 'A'),
          B: locData.find(l => l.checkpoint_type === 'B')
        });
      }
      const { data: allMembers } = await supabase.from('Profiles').select('*');
      if (allMembers) {
        const usersAtB = allMembers.filter(m => m.status === 'B');
        const missingList = allMembers.filter(m => m.status === 'Missing');
        setMissingMembers(missingList);
        setMemberStats({
          total: allMembers.length,
          atA: allMembers.filter(m => m.status === 'A').length,
          atB: usersAtB.length,
          missing: missingList.length
        });
      }
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (token) fetchData();
    const subscription = supabase.channel('hp-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'Profiles' }, () => fetchData()).subscribe();
    return () => supabase.removeChannel(subscription);
  }, [token]);

  const userStatus = profile?.status;
  const currentLocationName = userStatus === 'B' ? checkpoints.B?.address : userStatus === 'A' ? checkpoints.A?.address : "Not Checked In";

  if (loading) return <div className="flex h-screen items-center justify-center bg-[#0f172a]"><Loader2 className="animate-spin text-white" size={40} /></div>;

  return (
    <div className="bg-stone-900 min-h-screen text-white font-sans">
      
      {/* 1. HERO SECTION (Header with Half-Transparent Image) */}
      <div className="relative h-[60vh] w-full flex items-center justify-center overflow-hidden">
        {/* The Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-1000 hover:scale-105"
          style={{ 
            backgroundImage: `url('/img/travel1.jpg')`, 
            opacity: 0.5
          }}
        ></div>
        {/* Gradient Overlay for Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#1c1917]/20 to-[#1c1917]"></div>
        {/* Hero Text */}
        <div className="relative z-10 text-center px-4">
          <h1 className="font-sans text-8xl md:text-6xl font-black tracking-tighter uppercase mb-2 drop-shadow-2xl">
            RFID TRAVEL SYSTEM
          </h1>
          <p className="text-xl md:text-2xl font-normal font-josefin tracking-widest text-slate-300 uppercase">
            Welcome Back, {profile?.username || "Admin"}
          </p>
          <div className="mt-8 flex justify-center">
            <div className="animate-bounce p-2 bg-white/10 rounded-full backdrop-blur-sm">
               <Footprints size={20} className="text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. CURRENT LOCATION BAR */}
      <div className="max-w-6xl mx-auto -mt-12 relative z-20 px-4">
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between shadow-2xl">
          <div className="flex items-center gap-4">
            {/* Icon Container */}
            <div className="p-3 bg-indigo-300 rounded-xl shadow-lg shadow-white/30 text-slate-900 shrink-0">
              <MapPin size={24} />
            </div>

            {/* Vertical Text Stack */}
            <div className="flex flex-col">
              {/* Line 1: Header */}
              <p className="text-2xl font-sans uppercase tracking-widest text-orange-200 shadow-lg-white/70">
                Your Current Location
              </p>
              
              {/* Line 2: Checkpoint Identifier */}
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-olive-300 uppercase tracking-tighter font-josefin shadow-lg-white/70"> 
                  {userStatus ? `Checkpoint ${userStatus}` : "Status: Pending"}
                </span>
                {userStatus && (
                   <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                )}
              </div>

              {/* Line 3: Exact Address */}
              <h2 className="text-xl font-bold text-white leading-tight">
                {currentLocationName}
              </h2>
            </div>
          </div>

          {/* Overdue Alert */}
          {memberStats.missing > 0 && (
            <div className="mt-4 md:mt-0 flex items-center gap-2 bg-red-500/20 text-red-400 px-4 py-2 rounded-full border border-red-500/30 animate-pulse">
              <AlertTriangle size={18} />
              <span className="text-sm font-bold tracking-tight">
                {memberStats.missing} Members Overdue
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 3. MEMBER COUNTS (GRID) */}
      <div className="max-w-6xl mx-auto py-16 px-4">
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
            <Users size={24} className="text-blue-400" /> Member Statistics
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <StatBox label="Total" value={memberStats.total} icon={<Users />} color="blue" />
          <StatBox label="At A" value={memberStats.atA} icon={<UserCheck />} color="amber" />
          <StatBox label="At B" value={memberStats.atB} icon={<CheckCircle2 />} color="fuchsia" />
          <StatBox label="Missing" value={memberStats.missing} icon={<HelpCircle />} color="red" isCritical={memberStats.missing > 0} />
        </div>
      </div>

      {/* 4. CHECKPOINT DETAILS */}
      <div className="max-w-6xl mx-auto pb-16 px-4">
         <h2 className="text-2xl font-bold mb-8 flex items-center gap-2 text-white">
            <MapPin size={24} className="text-blue-400" /> Checkpoint Information
        </h2>
        <div className="grid md:grid-cols-2 gap-8 ">
          {['A', 'B'].map((type) => {
            const data = checkpoints[type];
            return (
              <div key={type} className="group bg-white/5 border border-white/10 p-8 rounded-3xl hover:bg-white/10 transition-all duration-300 ">
                <div className="flex justify-between items-start mb-6">
                   <h3 className="text-3xl font-bold">Checkpoint {type}</h3>
                   <span className="text-xs font-black px-3 py-1 bg-white/10 rounded-full tracking-tighter uppercase">
                     {type === 'A' ? 'Entry' : 'Exit'}
                   </span>
                </div>
                {data ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 text-slate-300">
                      <MapPin size={18} className="text-blue-400" /> 
                      <span className="text-lg">{data.address}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-300">
                      <Clock size={18} className="text-blue-400" />
                      <span>Deadline: {new Date(data.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-300">
                      <Cloud size={18} className="text-blue-400" />
                      <span>{data.weather || "Weather data pending"}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 italic">Configuration Required</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. MISSING MEMBERS LIST (Only if exists) */}
      {missingMembers.length > 0 && (
        <div className="max-w-6xl mx-auto pb-24 px-4">
           <div className="bg-red-400/10 border border-red-500/20 rounded-3xl overflow-hidden shadow-2xl">
             <div className="bg-red-300 px-8 py-4 flex items-center justify-between">
                <h2 className="font-black uppercase tracking-tighter text-xl">Emergency Contact List</h2>
                <UserX size={24} />
             </div>
             <div className="p-4 overflow-x-auto">
               <table className="w-full">
                 <thead>
                   <tr className="text-left text-xs uppercase tracking-widest text-red-400">
                     <th className="px-6 py-4">Name</th>
                     <th className="px-6 py-4">Group</th>
                     <th className="px-6 py-4">Phone</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-white/5">
                   {missingMembers.map(m => (
                     <tr key={m.user_id} className="hover:bg-white/5 transition-colors">
                       <td className="px-6 py-4 font-bold">{m.username}</td>
                       <td className="px-6 py-4 text-slate-400">{m.group || "Solo"}</td>
                       <td className="px-6 py-4 font-mono text-red-400">{m.phone_number || "Unavailable"}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           </div>
        </div>
      )}

      {/* 6. BOTTOM IMAGE SECTION */}
      <div className="relative h-[90vh] w-full mt-20 overflow-hidden group">
        {/* The Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-700 group-hover:scale-110"
          style={{ 
            backgroundImage: `url('/img/travel2.jpg')`, 
            opacity: 0.8
          }}
        ></div>
        
        {/* Gradient Transition (Fades from Stone-900 into the image) */}
        <div className="absolute inset-0 bg-gradient-to-t from-transparent to-stone-900"></div>

        {/* Overlay Content */}
        <div className="relative z-10 h-full flex flex-col items-center justify-center px-4 text-center">
          <h2 className="font-marker text-4xl md:text-5xl text-white opacity-90 rotate-[-2deg] tracking-wider">
            Safe Travels
          </h2>
          <p className="font-josefin text-stone-300 uppercase tracking-[0.4em] text-sm mt-4">
            Wander for Distraction, Travel for Fulfilment
          </p>
          
          {/* A small decorative line */}
          <div className="w-12 h-[1px] bg-indigo-500 mt-6 shadow-[0_0_10px_rgba(99,102,241,0.8)]"></div>
        </div>
      </div>
    </div>
  );
};

const StatBox = ({ label, value, icon, color, isCritical }) => {
  // 1. Every color MUST have these exact keys: bgBox, bgIcon, text, border, hover
  const theme = {
    rose: { 
      bgBox: "bg-rose-500/10",
      bgIcon: "bg-rose-600/20",
      text: "text-rose-400",
      border: "border-rose-500/30",
      hover: "hover:border-rose-500/60" 
    },
    amber: { 
      bgBox: "bg-amber-500/10", 
      bgIcon: "bg-amber-600/20", 
      text: "text-amber-400", 
      border: "border-amber-500/30", 
      hover: "hover:border-amber-500/60" 
    },
    fuchsia: { 
      bgBox: "bg-fuchsia-500/10", 
      bgIcon: "bg-fuchsia-600/20", 
      text: "text-fuchsia-400", 
      border: "border-fuchsia-500/30", 
      hover: "hover:border-fuchsia-500/60" 
    },
    blue: { 
      bgBox: "bg-blue-500/10", 
      bgIcon: "bg-blue-600/20", 
      text: "text-blue-400", 
      border: "border-blue-500/30", 
      hover: "hover:border-blue-500/60" 
    }
  };

  // 2. SAFETY CHECK: If 'color' is missing or wrong, use 'blue'
  const activeTheme = theme[color] || theme.blue;

  return (
    <div className={`p-8 border rounded-3xl transition-all hover:-translate-y-1 backdrop-blur-sm
      ${isCritical 
        ? 'border-red-500 bg-red-500/15' 
        : `${activeTheme.bgBox} ${activeTheme.border} ${activeTheme.hover}`}`}>
      
      <div className={`mb-4 w-10 h-10 flex items-center justify-center rounded-xl ${activeTheme.bgIcon} ${activeTheme.text}`}>
        {icon && React.isValidElement(icon) ? React.cloneElement(icon, { size: 20 }) : null}
      </div>

      <p className={`text-4xl font-black mb-1 ${isCritical ? 'text-red-400' : activeTheme.text}`}>
        {value}
      </p>
      
      <p className="text-xs uppercase tracking-widest text-white/50 font-bold">
        {label}
      </p>
    </div>
  );
};

export default Homepage;