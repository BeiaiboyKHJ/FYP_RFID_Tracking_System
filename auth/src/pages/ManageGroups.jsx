import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../client'; 
import { 
  ArrowLeft, UserPlus, Trash2, Plus, Edit2,
  Footprints, Truck, Bus, Loader2 
} from 'lucide-react';

// --- 1. SUB-COMPONENT: MEMBER LIST VIEW ---
const MemberListView = ({ teamName, onBack, role }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [currentMembers, setCurrentMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCurrentMembers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('Profiles')
      .select('*')
      .eq('group', teamName);
    if (data) setCurrentMembers(data);
    if (error) console.error("Error fetching members:", error.message);
    setLoading(false);
  };

  useEffect(() => {
    fetchCurrentMembers();
  }, [teamName]);

  const fetchAvailableUsers = async () => {
    const { data } = await supabase
      .from('Profiles')
      .select('*')
      .or('group.is.null,group.eq.""');
    if (data) setAvailableUsers(data);
    setIsAdding(true);
  };

  const handleAddMember = async (userId) => {
    const currentGroupMode = currentMembers.length > 0 
      ? currentMembers[0].vehicle_type 
      : 'walk';

    const { error } = await supabase
      .from('Profiles')
      .update({ group: teamName, vehicle_type: currentGroupMode })
      .eq('user_id', userId);

    if (!error) {
      setIsAdding(false);
      fetchCurrentMembers();
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm("Remove this member from the team?")) return;
    const { error } = await supabase
      .from('Profiles')
      .update({ group: null })
      .eq('user_id', userId);

    if (!error) fetchCurrentMembers();
  };

  return (
    <div className="p-8 animate-in fade-in duration-500">
      <button onClick={onBack} className="flex items-center text-slate-500 mb-6 hover:text-slate-800 transition-colors group">
        <ArrowLeft size={20} className="mr-2 group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
      </button>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">{teamName}</h2>
            <p className="text-sm text-slate-500">Manage individuals assigned to this logistics group</p>
          </div>
          {role?.toLowerCase() === 'admin' && (
            <button 
              onClick={fetchAvailableUsers}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl flex items-center text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
            >
              <UserPlus size={18} className="mr-2" /> Add Member
            </button>
          )}
        </div>

        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-widest font-black">
            <tr>
              <th className="px-8 py-4">Member Name</th>
              <th className="px-8 py-4">Role</th>
              <th className="px-8 py-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="3" className="text-center p-20"><Loader2 className="animate-spin mx-auto text-slate-300" /></td></tr>
            ) : currentMembers.length > 0 ? (
              currentMembers.map((member) => (
                <tr key={member.user_id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-5 font-bold text-slate-700">{member.username || "Unnamed User"}</td>
                  <td className="px-8 py-5">
                    <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold capitalize">
                      {member.role}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-center">
                    {role?.toLowerCase() === 'admin' && (
                      <button onClick={() => handleRemoveMember(member.user_id)} className="text-slate-300 hover:text-red-500 transition-colors p-2">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="3" className="text-center p-20 text-slate-400 italic">No members found in this group.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white p-8 rounded-[32px] w-full max-w-md shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Assign Member</h3>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 transition-colors">✕</button>
            </div>
            <div className="max-h-80 overflow-y-auto pr-2 custom-scrollbar">
              {availableUsers.length > 0 ? availableUsers.map(user => (
                <div key={user.user_id} className="flex justify-between items-center p-4 mb-3 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-colors">
                  <div>
                    <p className="text-sm font-bold text-slate-700">{user.username || 'Unnamed'}</p>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-tighter">{user.role}</p>
                  </div>
                  <button onClick={() => handleAddMember(user.user_id)} className="bg-white text-indigo-600 border border-indigo-100 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all shadow-sm">Add</button>
                </div>
              )) : <p className="text-center text-slate-400 py-10">All users are currently assigned to groups.</p>}
            </div>
            <button onClick={() => setIsAdding(false)} className="mt-6 w-full py-4 text-sm font-bold text-slate-500 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- 2. SUB-COMPONENT: TEAM CARD ---
const TeamCard = ({ teamName, onShowMembers, stats, role, onUpdateTransport, onDeleteTeam, onRenameTeam }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(teamName);

  const handleModeChange = async (newMode) => {
    setIsUpdating(true);
    await onUpdateTransport(teamName, newMode);
    setIsUpdating(false);
  };

  const handleRename = async (e) => {
    e.preventDefault();
    if (!newName.trim() || newName === teamName) {
      setIsRenaming(false);
      setNewName(teamName);
      return;
    }

    await onRenameTeam(teamName, newName);
    setIsRenaming(false);
  };

  return (
    <div className="bg-white p-7 rounded-[32px] shadow-sm border border-slate-200 relative hover:shadow-xl hover:shadow-slate-200/50 transition-all group">
      {isUpdating && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center rounded-[32px] z-20">
          <Loader2 className="animate-spin text-indigo-600" size={32} />
        </div>
      )}
      
      <div className="flex justify-between items-start mb-6">
        <h2 className="text-xl font-black text-slate-800 tracking-tight">{teamName}</h2>
        <div className="flex gap-2">
          <div className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase">Active</div>
          {role?.toLowerCase() === 'admin' && (
            <>
              <button
                onClick={() => setIsRenaming(true)}
                className="text-slate-300 hover:text-indigo-500 transition-colors p-1"
                title="Rename team"
              >
                <Edit2 size={16} />
              </button>
              
                <button
                  onClick={() => {
                    if (window.confirm(`Delete team "${teamName}"?`)) onDeleteTeam(teamName);
                  }}
                  className="text-slate-300 hover:text-red-500 transition-colors p-1"
                  title="Delete empty team"
                >
                  <Trash2 size={16} />
                </button>
              
            </>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-slate-50 p-3 rounded-2xl">
          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Members</p>
          <p className="text-xl font-black text-slate-700">{stats.total}</p>
        </div>
        <div className="bg-slate-50 p-3 rounded-2xl">
          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Transport</p>
          <p className="text-sm font-black text-indigo-600 capitalize">{stats.currentMode}</p>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1">
          {[
            { id: 'walk', icon: <Footprints size={16} /> },
            { id: 'vehicle', icon: <Truck size={16} /> },
            { id: 'bus', icon: <Bus size={16} /> }
          ].map((item) => (
            <button
              key={item.id}
              disabled={role?.toLowerCase() !== 'admin'} 
              title={role?.toLowerCase() !== 'admin' ? "Admin permission required" : ""}
              onClick={() => handleModeChange(item.id)}
              className={`flex-1 flex justify-center py-3 rounded-xl transition-all ${
                stats.currentMode === item.id 
                  ? 'bg-white shadow-md text-indigo-600 scale-100' 
                  : 'text-slate-400 hover:text-slate-600'
              } ${role?.toLowerCase() !== 'admin' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer active:scale-90'}`}
            >
              {item.icon}
            </button>
          ))}
        </div>
      </div>
      
      <button 
        onClick={onShowMembers} 
        className="w-full bg-slate-900 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg shadow-slate-200 hover:shadow-indigo-200"
      >
        View Members
      </button>

      {/* Rename Modal */}
      {isRenaming && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white p-8 rounded-[32px] w-full max-w-md shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-800 mb-6">Rename Team</h3>
            <form onSubmit={handleRename}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New team name"
                className="w-full text-slate-700 placeholder:text-slate-500 border border-slate-200 rounded-2xl mb-6 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsRenaming(false);
                    setNewName(teamName);
                  }}
                  className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- 3. MAIN PAGE COMPONENT ---
const ManageGroups = ({ role }) => {
  const [view, setView] = useState('dashboard');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamStats, setTeamStats] = useState({});
  const [teamNames, setTeamNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  
  const fetchAllStatsRef = useRef(null);

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('groups')
        .select('group_name')
        .order('group_name', { ascending: true });

      if (error) throw error;
      const names = data?.map(g => g.group_name) || [];
      setTeamNames(names);
      await fetchAllStats(names);
    } catch (err) {
      console.error("Error fetching teams:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllStats = async (teams) => {
    try {
      const { data: profiles, error } = await supabase
        .from('Profiles')
        .select('group, vehicle_type');
      
      if (error) throw error;

      const newStats = {};
      teams.forEach(name => {
        const teamMembers = profiles?.filter(m => m.group === name) || [];
        const currentMode = teamMembers.length > 0 ? teamMembers[0].vehicle_type : 'walk';
        
        newStats[name] = { 
          total: teamMembers.length, 
          currentMode: currentMode || 'walk' 
        };
      });
      setTeamStats(newStats);
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  };

  useEffect(() => {
    fetchAllStatsRef.current = fetchAllStats;
  }, []);

  useEffect(() => {
    fetchTeams();

    const groupChannel = supabase
      .channel('groups-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'groups' },
        () => fetchTeams()
      )
      .subscribe();

    const profileChannel = supabase
      .channel('profile-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Profiles' },
        async () => {
          if (fetchAllStatsRef.current) {
            const { data } = await supabase
              .from('groups')
              .select('group_name')
              .order('group_name', { ascending: true });
            const names = data?.map(g => g.group_name) || [];
            fetchAllStatsRef.current(names);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(groupChannel);
      supabase.removeChannel(profileChannel);
    };
  }, []);

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    try {
      const { error } = await supabase
        .from('groups')
        .insert({ group_name: newTeamName });

      if (error) throw error;
      
      setNewTeamName('');
      setIsCreating(false);
      fetchTeams();
    } catch (err) {
      alert("Failed to create team: " + err.message);
    }
  };

  // ← NEW: Handle team rename
  const handleRenameTeam = async (oldName, newName) => {
    try {
      // Update group name in groups table
      const { error: groupError } = await supabase
        .from('groups')
        .update({ group_name: newName })
        .eq('group_name', oldName);

      if (groupError) throw groupError;

      // Update all profiles that reference the old group name
      const { error: profileError } = await supabase
        .from('Profiles')
        .update({ group: newName })
        .eq('group', oldName);

      if (profileError) throw profileError;

      // Refresh teams
      fetchTeams();
    } catch (err) {
      alert("Failed to rename team: " + err.message);
    }
  };

  const handleDeleteTeam = async (teamName) => {
    try {
      const { error } = await supabase
        .from('groups')
        .delete()
        .eq('group_name', teamName);

      if (error) throw error;
      fetchTeams();
    } catch (err) {
      alert("Failed to delete team: " + err.message);
    }
  };

  const handleUpdateTransport = async (teamName, newMode) => {
    try {
      const { data, error } = await supabase
        .from('Profiles')
        .update({ vehicle_type: newMode })
        .eq('group', teamName)
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        console.log(`Updated ${data.length} profiles to ${newMode}`);
      }
    } catch (err) {
      console.error("Update Error:", err.message);
      alert("Failed to update group mode: " + err.message);
    }
  };

  if (view === 'detail') {
    return <MemberListView teamName={selectedTeam} onBack={() => setView('dashboard')} role={role} />;
  }

  return (
    <div className="p-8 bg-[#FBFBFE] min-h-screen font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Group Management</h1>
            <div className="flex items-center gap-2">
              <div className="h-1 w-12 bg-indigo-600 rounded-full"></div>
              <p className="text-slate-500 font-medium">Create Team and Manage Member's Groups</p>
            </div>
          </div>
          {role?.toLowerCase() === 'admin' && (
            <button
              onClick={() => setIsCreating(true)}
              className="bg-indigo-600 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
            >
              <Plus size={20} /> Create Team
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin text-indigo-600" size={40} />
          </div>
        ) : teamNames.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {teamNames.map(t => (
              <TeamCard 
                key={t} 
                teamName={t} 
                role={role} 
                stats={teamStats[t] || { total: 0, currentMode: 'walk' }} 
                onUpdateTransport={handleUpdateTransport}
                onDeleteTeam={handleDeleteTeam}
                onRenameTeam={handleRenameTeam}
                onShowMembers={() => {
                  setSelectedTeam(t);
                  setView('detail');
                }} 
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-slate-400 mb-4">No teams created yet</p>
            {role?.toLowerCase() === 'admin' && (
              <button
                onClick={() => setIsCreating(true)}
                className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700"
              >
                Create First Team
              </button>
            )}
          </div>
        )}

        {isCreating && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <div className="bg-white p-8 rounded-[32px] w-full max-w-md shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
              <h3 className="text-xl font-bold text-slate-800 mb-6">Create New Team</h3>
              <form onSubmit={handleCreateTeam}>
                <input
                  type="text"
                  placeholder="Team name (e.g., Team 5, Group A)"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="w-full text-slate-700 placeholder:text-slate-500 border border-slate-200 rounded-2xl mb-6 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setNewTeamName('');
                    }}
                    className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageGroups;