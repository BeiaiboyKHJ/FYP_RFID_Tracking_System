import React, { useState, useEffect } from 'react';
import { supabase } from '../client';
import { Search, Phone, Shield, User, MapPin, Loader2, CreditCard, Contact2 } from 'lucide-react';

const MemberManagement = ({ role, currentUserId }) => {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [isScanningMode, setIsScanningMode] = useState(false);

useEffect(() => {
    fetchMembers();

    const subscription = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'Profiles' }, 
        (payload) => {
          setMembers(prevMembers => 
            prevMembers.map(member => 
              // Check if the updated record matches the member in our current list
              member.user_id === (payload.new.user_id || payload.new.id)
                ? { ...member, ...payload.new } // Merge new database data into our state
                : member
            )
          );
          if (isScanningMode) {
          setIsScanningMode(false);
          console.log("Card detected and linked!");
          }
        }
      )
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'system_state' },
        (payload) => {
          if (payload.new.is_scanning === false) {
            setIsScanningMode(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

const handleStatusChange = async (userId, newStatus, username) => {
  if (role !== 'admin') return;

  // 1. Update Profiles
  // IMPORTANT: If this still says "No user found", change 'user_id' to 'id' below
  const { data, error } = await supabase
    .from('Profiles')
    .update({ status: newStatus })
    .eq('user_id', userId) 
    .select(); 


  if (error) {
    console.error("Supabase Update Error:", error.message);
    alert("Update failed: " + error.message);
    return;
  }

  // This check now works because 'data' is defined above
  if (!data || data.length === 0) {
    console.error("No user found with ID:", userId);
    console.log("Tip: Check if your Profiles table uses 'id' instead of 'user_id' as the primary key.");
    return;
  }

  // 2. Update local state
  setMembers(prevMembers => 
    prevMembers.map(member => 
      member.user_id === userId ? { ...member, status: newStatus } : member
    )
  );

  // 3. Handle Travel Sessions
  if (newStatus === 'A') {
    const { error: insertError } = await supabase.from('Travel_Sessions').insert({
      user_id: userId,
      check_in_time: new Date().toISOString(),
      status: 'active'
    });
    if (insertError) console.error("Travel Session Insert Error:", insertError);
  } 
  else if (newStatus === 'B') {
    const { data: activeSession } = await supabase
      .from('Travel_Sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('check_in_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeSession) {
      const checkIn = new Date(activeSession.check_in_time);
      const checkOut = new Date();
      const duration = Math.floor((checkOut - checkIn) / 60000);

      await supabase.from('Travel_Sessions')
        .update({ 
          check_out_time: checkOut.toISOString(),
          total_duration_minutes: duration,
          status: 'completed'
        })
        .eq('id', activeSession.id);
    }
  }
  else if (newStatus === 'Missing') {
    console.log(`EMERGENCY: ${username || 'Unknown user'} marked as MISSING`);
  }
};

  const fetchMembers = async () => {
    const { data, error } = await supabase
      .from('Profiles')
      .select('*')
      .order('username', { ascending: true });
    
    if (error) console.error(error);
    if (data) setMembers(data);
    setLoading(false);
  };

  const startScanning = async (userId) => {
    if (isScanningMode) {
    setIsScanningMode(false);
    const { error } = await supabase
      .from('system_state')
      .update({
        is_scanning: false,
        target_user_id: null,
      })
      .eq('id', 1);

    if (error) {
      console.error("Manual Stop Error:", error);} 
    return;
  }
    
    setIsScanningMode(true);
    const { data, error } = await supabase
      .from('system_state')
      .update({ 
        is_scanning: true, 
        target_user_id: userId,
      })
      .eq('id', 1)
      .select();

    if (error) {
      console.error("Scan Trigger Error:", error);
      alert("Could not start scanner: " + error.message);
      setIsScanningMode(false);
    } else if (!data || data.length === 0) {
      alert("Error: system_state row with ID 1 not found!");
      setIsScanningMode(false);
    } else {
      console.log("System ready for scan:", data);
    }
  };

const updateMemberField = async (userId, field, value) => {
    if (role !== 'admin') return;

    // 1. INSTANT UI UPDATE (Optimistic Update)
    setMembers(prevMembers => 
      prevMembers.map(member => 
        member.user_id === userId ? { ...member, [field]: value } : member
      )
    );

    // 2. Background Database Update
    const { error } = await supabase
      .from('Profiles')
      .update({ [field]: value === "" ? null : value }) // Convert empty strings to nulls in DB})
      .eq('user_id', userId);
    
    if (error) {
      console.error(`Failed to update ${field}:`, error.message);
      alert(`Update failed: ${error.message}`);
      // If it fails, refresh from DB to revert the UI to the truth
      fetchMembers(); 
    }
  };

  const filteredMembers = members.filter(m => 
    m.username?.toLowerCase().includes(search.toLowerCase())
  );

  const adminMember = members.find(m => m.role === 'admin');

  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="animate-spin text-blue-600" size={40} />
    </div>
  );

  const formatLastSeen = (timestamp) => {
  if (!timestamp) return 'Never';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getRelativeTime = (timestamp) => {
  if (!timestamp) return 'No scans yet';
  
  const now = new Date();
  const then = new Date(timestamp);
  const diffInSeconds = Math.floor((now - then) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  
  return then.toLocaleDateString(); // Fallback to date if > 1 day
};
  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {role === 'admin' ? "Member Management" : "Member Directory"}
          </h1>
        </div>
        
        {role === 'member' && adminMember && (
          <div className="bg-white border border-red-100 p-3 rounded-xl shadow-sm flex items-center gap-3">
            <div className="bg-red-500 p-2 rounded-lg text-white"><Phone size={18} /></div>
            <div>
              <p className="text-[10px] uppercase font-bold text-red-600 tracking-wider">Admin Support</p>
              <p className="text-sm font-bold text-slate-800">{adminMember.phone_number || "No contact set"}</p>
            </div>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative mb-6 text-stone-600">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-600 font-bold" size={20} />
        <input 
          type="text"
          placeholder="Search members by name..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Button Quick Guide */}
      {role === 'admin' && (
        <div className="mb-6 bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-xl shadow-sm">
          <div className="flex gap-3">
            <Shield className="text-blue-600 shrink-0" size={20} />
            <div>
              <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide">Button Guide: RFID Tag Registration</h3>
              <ul className="mt-2 space-y-1 text-xs text-blue-800 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="font-bold">1.</span> 
                  Click the <span className="bg-blue-600 text-white px-1 rounded inline-flex items-center"><Contact2 size={10}/></span> button to start scanning. The button will turn <span className="text-amber-600 font-bold">Orange</span> and spin.
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold">2.</span> 
                  Tap the physical RFID card on the reader. The system will auto-save and stop spinning once detected.
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold">3.</span> 
                  <span className="underline">Manual Control:</span> You can click the spinning button again to cancel the scan, or manually type/backspace in the RFID box to update values.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Table Section */}
      <div className="bg-olive-50 rounded-2xl shadow-sm border border-stone-900 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-olive-100 border-b border-stone-900">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-700 uppercase">Member</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-700 uppercase">Group</th>
              {role === 'admin' && <th className="px-6 py-4 text-xs font-bold text-slate-700 uppercase">RFID Tag</th>}
              <th className="px-6 py-4 text-xs font-bold text-slate-700 uppercase">Current Status</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Last Seen</th>
              {role === 'admin' && <th className="px-6 py-4 text-xs font-bold text-slate-700 uppercase text-center">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredMembers.map((member) => (
              <tr key={member.user_id} className={`hover:bg-slate-50/50 transition-colors ${member.user_id === currentUserId ? "bg-blue-50/40" : ""}`}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {/* Profile Image with Fallback */}
                    <img
                    src={member.avatar_url || `https://ui-avatars.com/api/?name=${member.username}&background=2563eb&color=fff&bold=true`}
                    alt="avatar"
                    className={`w-10 h-10 rounded-full object-cover shadow-sm border-3 ${
                    member.role === 'admin' ? 'border-red-500/70' : 'border-blue-500/30'
                    }`} 
                    />

                    {/* Small Shield overlay for Admins */}
                    {member.role === 'admin' && (
                      <div className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 border border-white">
                        <Shield size={8} className="text-white" />
                      </div>
                    )}

                    <div>
                      <p className="font-semibold text-slate-700 flex items-center gap-1">{member.username} {member.user_id === currentUserId && "(Me)"}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${member.role === 'admin' ? 'border-red-500 text-red-500 bg-red-50' : 'border-blue-200 text-blue-500 bg-blue-50'}`}>
                        {member.role}
                      </span>
                    </div>
                  </div>
                </td>

                <td className="px-6 py-4">
                  {role === 'admin' ? (
                    <select 
                      value={member.group || ""} 
                      onChange={(e) => updateMemberField(member.user_id, 'group', e.target.value)}
                      className="text-sm text-slate-800 bg-white border border-slate-800 rounded-lg p-1.5 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Unassigned</option>
                      <option value="Team 1">Team 1</option>
                      <option value="Team 2">Team 2</option>
                      <option value="Team 3">Team 3</option>
                      <option value="Team 4">Team 4</option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                      <User size={14} className="text-slate-800" />
                      {member.group || "No Team"}
                    </div>
                  )}
                </td>


                {/* Only show this cell if user is admin */}
              {role === 'admin' && (
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="relative flex items-center">
                      <CreditCard size={14} className="absolute left-2 text-slate-400" />
                      <input 
                        type="text"
                        placeholder="Scan Card..."
                        value={member.rfid_uid || ""} 
                        onChange={(e) => updateMemberField(member.user_id, 'rfid_uid', e.target.value)}
                        className="text-xs bg-white border border-slate-800 text-slate-800 rounded-lg pl-7 pr-2 py-1.5 w-32 outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    </div>
                    <button 
                      onClick={() => startScanning(member.user_id)}
                      className={`shrink-0 p-2 rounded-lg transition-all shadow-md flex items-center justify-center ${
                        isScanningMode 
                          ? "bg-amber-500 animate-pulse cursor-wait" 
                          : "bg-blue-600 hover:bg-blue-700 active:scale-95 text-white"
                      }`}
                    >
                      {isScanningMode ? (
                        <Loader2 size={14} className="animate-spin text-white" />
                      ) : (
                        <Contact2 size={14} />
                      )}
                    </button>
                  </div>
                </td>
              )}
                



                <td className="px-6 py-4">
                  {role === 'admin' ? (
                    <select 
                      value={member.status || ""} 
                      onChange={(e) => handleStatusChange(member.user_id, e.target.value, member.username)}
                      className={`text-xs font-bold px-2.5 py-1.5 rounded-full border-none outline-none cursor-pointer ${
                        !member.status ? 'bg-slate-100 text-slate-500' : 
                        member.status === 'A' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
                      }`}
                    >
                      <option value="">Not Started</option>
                      <option value="A">Checkpoint A (Entry)</option>
                      <option value="B">Checkpoint B (Exit)</option>
                      <option value="Missing">Missing</option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-slate-400" />
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                        member.status === 'A' ? 'bg-blue-100 text-blue-600' : 
                        member.status === 'B' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {member.status === 'A' ? "Entered A" : member.status === 'B' ? "Completed B" : "Not Started"}
                      </span>
                    </div>
                  )}
                </td>

                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm text-slate-600 font-semibold">
                      {getRelativeTime(member.last_seen)}
                    </span>
                    <span className="text-[10px] text-slate-600 uppercase">
                      {member.last_checkpoint || 'Unknown Station'}
                    </span>
                  </div>
                </td>

                {role === 'admin' && (
                  <td className="px-6 py-4 text-center">
                    <button 
                      onClick={() => updateMemberField(member.user_id, 'role', member.role === 'admin' ? 'member' : 'admin')}
                      className={`p-2 rounded-lg transition-all ${
                        member.role === 'admin' ? 'bg-red-50 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Shield size={18} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MemberManagement;