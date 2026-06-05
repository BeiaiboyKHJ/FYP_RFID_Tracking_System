import React, { useState, useEffect } from 'react';
import { supabase } from '../client';
import { Search, Phone, Shield, User, MapPin, Loader2, CreditCard, Contact2, CheckCircle2 } from 'lucide-react';

const MemberManagement = ({ role, currentUserId }) => {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [isScanningMode, setIsScanningMode] = useState(false);
  const [availableCheckpoints, setAvailableCheckpoints] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);  // ← NEW
 
  const [scanModal, setScanModal] = useState({
    isOpen: false,
    status: 'idle',
    username: ''
  });

  const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

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
          setScanModal(prevModal => {
            if (prevModal.status === 'scanning') {
              console.log("Card detected and linked!");
              return { ...prevModal, status: 'success' };
            }
            return prevModal;
          });
          setIsScanningMode(prev => prev ? false : prev);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'system_state' },
        (payload) => {
          if (payload.new.is_scanning === false) {
            setIsScanningMode(false);
            setScanModal(prev => prev.status === 'scanning' ? { ...prev, isOpen: false } : prev);
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(subscription);
  }, []);

  // NEW: Fetch groups from 'groups' table dynamically
  useEffect(() => {
    const fetchGroups = async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('group_name')
        .order('group_name', { ascending: true });

      if (data) {
        const groupNames = data.map(g => g.group_name);
        setAvailableGroups(groupNames);
      }
      if (error) console.error("Error fetching groups:", error);
    };

    fetchGroups();

    // Listen to groups table changes
    const groupSub = supabase
      .channel('groups-updates')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'groups' },
        () => fetchGroups()
      )
      .subscribe();

    return () => supabase.removeChannel(groupSub);
  }, []);

  // Fetch checkpoints from 'checkpoints' table
  useEffect(() => {
    const fetchCheckpoints = async () => {
      const { data, error } = await supabase
        .from('checkpoints')
        .select('checkpoint_type, address, end_time, is_exit')
        .order('checkpoint_type', { ascending: true });

      if (data) setAvailableCheckpoints(data);
      if (error) console.error("Error fetching checkpoints:", error);
    };

    fetchCheckpoints();

    // Listen to 'checkpoints' table changes
    const checkpointSub = supabase
      .channel('checkpoint-config-updates')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'checkpoints' },
        () => fetchCheckpoints()
      )
      .subscribe();

    return () => supabase.removeChannel(checkpointSub);
  }, []);

  const handleStatusChange = async (userId, newStatus, username) => {
    if (role !== 'admin') return;

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

      if (newStatus === 'Missing') {
      try {
        const response = await fetch('http://127.0.0.1:5000/send-missing-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: username,
            userId: userId,
            timestamp: new Date().toISOString()
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Alert API Error:", errorText);
          alert("Failed to send alert: " + errorText);
        } else {
          console.log("Alert sent successfully for user:", username);
        }
      } catch (err) {
        console.error("Failed to send alert:", err);
      }
    }

    setMembers(prevMembers =>
      prevMembers.map(member =>
        member.user_id === userId ? { ...member, status: newStatus } : member
      )
    );

    if (newStatus === 'Missing') {
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

  // Deadline Watchdog
  useEffect(() => {
    if (role !== 'admin' || availableCheckpoints.length === 0) return;

    const checkDeadlines = async () => {
      const exitCheckpoint = availableCheckpoints.find(cp => cp.is_exit === true);

      if (!exitCheckpoint || !exitCheckpoint.end_time) {
        console.log("Watchdog: Waiting for an exit checkpoint with a valid end_time...");
        return;
      }

      const now = new Date();
      const deadline = new Date(exitCheckpoint.end_time);

      if (now > deadline) {
        console.log("🚨 DEADLINE EXPIRED: Checking for members not at the exit...");

        const stragglers = members.filter(m =>
          m.status !== 'Missing' &&
          m.status !== exitCheckpoint.checkpoint_type
        );

        if (stragglers.length > 0) {
          const stragglerIds = stragglers.map(s => s.user_id);
          console.warn(`Found ${stragglerIds.length} stragglers. Updating status to 'Missing'...`);

          const { error } = await supabase
            .from('Profiles')
            .update({ status: 'Missing' })
            .in('user_id', stragglerIds);

          if (error) console.error("Database Update Error:", error.message);
          else console.log("Successfully flagged stragglers as Missing.");
        } else {
          console.log("All members accounted for. No updates needed.");
        }
      }
    };

    checkDeadlines();
    const interval = setInterval(checkDeadlines, 10000);
    return () => clearInterval(interval);
  }, [availableCheckpoints, members, role]);

  const startScanning = async (userId, username) => {
    if (isScanningMode) {
      setIsScanningMode(false);
      setScanModal({ isOpen: false, status: 'idle', username: '' });
      await supabase.from('system_state').update({ is_scanning: false, target_user_id: null }).eq('id', 1);
      return;
    }

    setIsScanningMode(true);
    setScanModal({ isOpen: true, status: 'scanning', username: username });

    const { data, error } = await supabase
      .from('system_state')
      .update({ is_scanning: true, target_user_id: userId })
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
    }
  };

  const closeModal = async () => {
    if (scanModal.status === 'scanning') {
      setIsScanningMode(false);
      await supabase.from('system_state').update({ is_scanning: false, target_user_id: null }).eq('id', 1);
    }
    setScanModal({ isOpen: false, status: 'idle', username: '' });
  };

  const updateMemberField = async (userId, field, value) => {
    if (role !== 'admin') return;
    setMembers(prevMembers =>
      prevMembers.map(member =>
        member.user_id === userId ? { ...member, [field]: value } : member
      )
    );
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

      <div className="relative mb-6 text-stone-600">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-600 font-bold" size={20} />
        <input
          type="text"
          placeholder="Search members by name..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

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
                <td className="px-6 py-4">
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
                      <p className="font-semibold text-slate-700 flex items-center gap-1">
                        {member.username} {member.user_id === currentUserId && "(Me)"}
                      </p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                        member.role === 'admin' ? 'border-red-500 text-red-500 bg-red-50' : 'border-blue-200 text-blue-500 bg-blue-50'
                      }`}>
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
                      {/* UPDATED: Dynamic groups from database */}
                      {availableGroups.length > 0 ? (
                        availableGroups.map((group) => (
                          <option key={group} value={group}>
                            {group}
                          </option>
                        ))
                      ) : (
                        <option disabled>No groups available</option>
                      )}
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
                <button onClick={closeModal} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">
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
                <button onClick={closeModal} className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-colors shadow-sm">
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