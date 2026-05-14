import React, { useState, useEffect } from 'react';
import { supabase } from '../client';
import { Search, Phone, Shield, User, MapPin, Loader2, CreditCard, Contact2, CheckCircle2 } from 'lucide-react';

const MemberManagement = ({ role, currentUserId }) => {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [isScanningMode, setIsScanningMode] = useState(false);
  const [availableCheckpoints, setAvailableCheckpoints] = useState([]);
 
  // NEW: State to control the scanning popup box
  const [scanModal, setScanModal] = useState({
    isOpen: false,
    status: 'idle', // 'idle' | 'scanning' | 'success'
    username: ''
  });

  useEffect(() => {
    fetchMembers();

    const subscription = supabase
      .channel('schema-db-changes')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'Profiles' },
        (payload) => {
          setMembers(prevMembers =>
            prevMembers.map(member =>
              member.user_id === (payload.new.user_id || payload.new.id)
                ? { ...member, ...payload.new }
                : member
            )
          );

          // NEW: Safely check if we are scanning without relying on stale closure state
          setScanModal(prevModal => {
            if (prevModal.status === 'scanning') {
              console.log("Card detected and linked!");
              return { ...prevModal, status: 'success' };
            }
            return prevModal;
          });

          // Also turn off scanning mode globally
          setIsScanningMode(prev => prev ? false : prev);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'system_state' },
        (payload) => {
          if (payload.new.is_scanning === false) {
            setIsScanningMode(false);
            // If scanning stopped externally, close the modal
            setScanModal(prev => prev.status === 'scanning' ? { ...prev, isOpen: false } : prev);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

useEffect(() => {
const fetchCheckpoints = async () => {
  const { data, error } = await supabase
    .from('locations')
    .select('checkpoint_type, address, created_at, end_time, is_exit') // Try selecting all first to verify names
    .order('created_at', { ascending: false });

    if (data) {
    // 2. Filter to keep only the UNIQUE/LATEST checkpoint types
    const uniqueTypes = {};
    const activeCheckpoints = data.reduce((acc, curr) => {
      if (!uniqueTypes[curr.checkpoint_type]) {
        uniqueTypes[curr.checkpoint_type] = true;
        acc.push(curr);
      }
      return acc;
    }, []);

    const sortedCheckpoints = activeCheckpoints.sort((a, b) =>
      a.checkpoint_type.localeCompare(b.checkpoint_type)
    );

    setAvailableCheckpoints(sortedCheckpoints);
    }
    if (error) console.error("Error fetching checkpoints:", error);
};

  fetchCheckpoints();

  const checkpointSub = supabase
    .channel('location-updates')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'locations' },
      () => fetchCheckpoints()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(checkpointSub);
  };
}, []); // Empty dependency array means this only runs once on mount

  const handleStatusChange = async (userId, newStatus, username) => {
    if (role !== 'admin') return;

    // 1. Update Profiles
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
 
// NEW: Deadline Watchdog Rule
useEffect(() => {
  // Only the Admin dashboard should process this logic to prevent multi-device conflicts
  if (role !== 'admin' || availableCheckpoints.length === 0) return;

  const checkDeadlines = async () => {
    // 1. Find the specific checkpoint marked as the exit
    const exitCheckpoint = availableCheckpoints.find(cp => cp.is_exit === true);
    
    if (!exitCheckpoint || !exitCheckpoint.end_time) {
      console.log("Watchdog: Waiting for an exit checkpoint with a valid end_time...");
      return;
    }

    const now = new Date();
    const deadline = new Date(exitCheckpoint.end_time);

    // 2. Check if the current local time has passed the deadline
    if (now > deadline) {
      console.log("🚨 DEADLINE EXPIRED: Checking for members not at the exit...");

      // 3. Identify members who:
      // - Are NOT admins
      // - Are NOT already marked "Missing"
      // - Their current status DOES NOT match the exit checkpoint name (e.g., 'C')
      const stragglers = members.filter(m =>
        m.status !== 'Missing' &&
        m.status !== exitCheckpoint.checkpoint_type
      );

      if (stragglers.length > 0) {
        const stragglerIds = stragglers.map(s => s.user_id);
        console.warn(`Found ${stragglerIds.length} stragglers. Updating status to 'Missing'...`);

        // 4. INSTANT DATABASE UPDATE
        const { error } = await supabase
          .from('Profiles')
          .update({ status: 'Missing' })
          .in('user_id', stragglerIds);

        if (error) {
          console.error("Database Update Error:", error.message);
        } else {
          console.log("Successfully flagged stragglers as Missing.");
        }
      } else {
        console.log("All members accounted for. No updates needed.");
      }
    }
  };

  // Run the check immediately on load
  checkDeadlines();

  // Check every 10 seconds (for testing purposes, you can change this to 60000 for 1 minute)
  const interval = setInterval(checkDeadlines, 10000);
 
  return () => clearInterval(interval);
}, [availableCheckpoints, members, role]);

  // MODIFIED: Added username to parameters for the Modal UI
  const startScanning = async (userId, username) => {
    if (isScanningMode) {
      // Manual stop triggered from table button
      setIsScanningMode(false);
      setScanModal({ isOpen: false, status: 'idle', username: '' });
      
      const { error } = await supabase
        .from('system_state')
        .update({
          is_scanning: false,
          target_user_id: null,
        })
        .eq('id', 1);

      if (error) {
        console.error("Manual Stop Error:", error);
        }
      return;
    }
    
    // Start scan and open modal
    setIsScanningMode(true);
    setScanModal({ isOpen: true, status: 'scanning', username: username });
    
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
      setScanModal({ isOpen: false, status: 'idle', username: '' });
    } else if (!data || data.length === 0) {
      alert("Error: system_state row with ID 1 not found!");
      setIsScanningMode(false);
      setScanModal({ isOpen: false, status: 'idle', username: '' });
    } else {
      console.log("System ready for scan:", data);
    }
  };

  // NEW: Function to handle modal closing & stopping DB scan
  const closeModal = async () => {
    if (scanModal.status === 'scanning') {
      setIsScanningMode(false);
      await supabase.from('system_state').update({ is_scanning: false, target_user_id: null }).eq('id', 1);
    }
    setScanModal({ isOpen: false, status: 'idle', username: '' });
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
      .update({ [field]: value === "" ? null : value })
      .eq('user_id', userId);
    
    if (error) {
      console.error(`Failed to update ${field}:`, error.message);
      alert(`Update failed: ${error.message}`);
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

  const getRelativeTime = (timestamp) => {
    if (!timestamp) return 'No scans yet';
    
    const now = new Date();
    const then = new Date(timestamp);
    const diffInSeconds = Math.floor((now - then) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    
    return then.toLocaleDateString();
  };

  return (
    <div className="p-8 bg-slate-50 min-h-screen relative">
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
                  Click the <span className="bg-blue-600 text-white px-1 rounded inline-flex items-center"><Contact2 size={10}/></span> button to start scanning. A popup box will appear.
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold">2.</span>
                  Tap the physical RFID card on the reader. The system will auto-save and notify you.
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold">3.</span>
                  <span className="underline">Manual Control:</span> You can click "Cancel" on the popup, or manually type in the RFID box to update values.
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
              <th className="px-6 py-4 text-xs font-bold text-slate-700 uppercase w-75">Current Status</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Last Seen</th>
              {role === 'admin' && <th className="px-6 py-4 text-xs font-bold text-slate-700 uppercase text-center">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredMembers.map((member) => (
              <tr key={member.user_id} className={`hover:bg-slate-50/50 transition-colors ${member.user_id === currentUserId ? "bg-blue-50/40" : ""}`}>
                <td className="px-6 py-4 ">
                  <div className="flex items-center gap-3">
                    <img
                    src={member.avatar_url || `https://ui-avatars.com/api/?name=${member.username}&background=2563eb&color=fff&bold=true`}
                    alt="avatar"
                    className={`w-10 h-10 rounded-full object-cover shadow-sm border-3 ${
                    member.role === 'admin' ? 'border-red-500/70' : 'border-blue-500/30'
                    }`}
                    />

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
                      onClick={() => startScanning(member.user_id, member.username)}
                      className={`shrink-0 p-2 rounded-lg transition-all shadow-md flex items-center justify-center ${
                        isScanningMode && scanModal.username === member.username
                          ? "bg-amber-500 animate-pulse cursor-wait"
                          : "bg-blue-600 hover:bg-blue-700 active:scale-95 text-white"
                      }`}
                    >
                      {isScanningMode && scanModal.username === member.username ? (
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
                  className={`text-xs font-bold px-2.5 py-1.5 rounded-full border-none outline-none cursor-pointer w-full truncate ${
                    !member.status ? 'bg-slate-100 text-slate-500' :
                    member.status === 'A' ? 'bg-blue-100 text-blue-600' :
                    member.status === 'B' ? 'bg-emerald-100 text-emerald-600' :
                    member.status === 'C' ? 'bg-cyan-300 text-cyan-900' :
                    member.status === 'Missing' ? 'bg-red-300 text-red-900' :
                    'bg-amber-100 text-amber-700'
                  }`}
                >
                  <option value="">Not Started</option>
                  
                  {/* DYNAMIC CHECKPOINTS FROM DB */}
                  {availableCheckpoints.length === 0 ? (
                    <option disabled>No active checkpoints found</option>
                  ) : (
                    availableCheckpoints.map((cp) => (
                      <option key={cp.checkpoint_type} value={cp.checkpoint_type}>
                        Checkpoint {cp.checkpoint_type} ({cp.address})
                      </option>
                    ))
                  )}
                  <option value="Missing" className="text-red-600 font-bold">Missing</option>
                </select>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin size={14} className="text-slate-400" />
                      <span className={`text-xs font-bold px-2.5 py-1.5 rounded-full w-full truncate ${
                        !member.status ? 'bg-slate-100 text-slate-600' :
                        member.status === 'A' ? 'bg-blue-100 text-blue-600' :
                        member.status === 'B' ? 'bg-emerald-100 text-emerald-600' :
                        member.status === 'C' ? 'bg-cyan-300 text-cyan-900' :
                        member.status === 'Missing' ? 'bg-red-300 text-red-900' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {!member.status ? 'Not Started' : member.status === 'Missing' ? 'Missing' : `At Checkpoint ${member.status}`}
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

      {/* SCANNING MODAL POPUP */}
      {scanModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl relative">
            
            {scanModal.status === 'scanning' ? (
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                  <Loader2 size={32} className="text-blue-600 animate-spin" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Awaiting Scan</h3>
                <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                  Please tap the physical RFID card on the reader to link it to <span className="font-bold text-slate-800">{scanModal.username}</span>.
                </p>
                <button
                  onClick={closeModal}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  Cancel Scanning
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 size={32} className="text-emerald-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Card Scanned!</h3>
                <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                  The RFID tag was successfully linked to <span className="font-bold text-slate-800">{scanModal.username}</span>.
                </p>
                <button
                  onClick={closeModal}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-colors shadow-sm"
                >
                  Done
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};

export default MemberManagement;