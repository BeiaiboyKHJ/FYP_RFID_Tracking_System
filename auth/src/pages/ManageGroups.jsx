import React, { useState, useEffect } from 'react';
import { supabase } from '../client'; 
import { ArrowLeft, UserPlus, Trash2 } from 'lucide-react';

// --- 1. SUB-COMPONENT: TEAM CARD ---
const TeamCard = ({ teamName, onShowMembers, stats }) => {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
      <h2 className="text-xl font-bold text-slate-800 mb-4">{teamName}</h2>
      
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Total Members:</span>
          <span className="font-bold text-slate-800">{stats.total}</span>
        </div>
        <div className="flex justify-between text-blue-600">
          <span>Checkpoint A:</span>
          <span className="font-semibold">{stats.pointA}</span>
        </div>
        <div className="flex justify-between text-indigo-600">
          <span>Checkpoint B:</span>
          <span className="font-semibold">{stats.pointB}</span>
        </div>
        <div className="flex justify-between pt-2 border-t text-red-600 font-bold">
          <span>Missing:</span>
          <span>{stats.total - (stats.pointA + stats.pointB)}</span>
        </div>
      </div>

      <button 
        onClick={onShowMembers}
        className="w-full mt-6 bg-slate-800 text-white py-2 rounded-lg hover:bg-slate-700 transition-colors font-medium"
      >
        Show Members
      </button>
    </div>
  );
};

// --- 2. SUB-COMPONENT: MEMBER LIST VIEW ---
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
    const { data, error } = await supabase
      .from('Profiles')
      .select('*')
      .or('group.is.null,group.eq.""');

    if (data) setAvailableUsers(data);
    setIsAdding(true);
  };

  const handleAddMember = async (userId) => {
    const { error } = await supabase
      .from('Profiles')
      .update({ group: teamName })
      .eq('user_id', userId);

    if (error) {
      alert("Error adding member: " + error.message);
    } else {
      setIsAdding(false);
      fetchCurrentMembers();
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm("Remove this member?")) return;
    const { error } = await supabase
      .from('Profiles')
      .update({ group: null })
      .eq('user_id', userId);

    if (!error) fetchCurrentMembers();
  };

  return (
    <div className="p-8">
      <button onClick={onBack} className="flex items-center text-slate-500 mb-6 hover:text-slate-800">
        <ArrowLeft size={20} className="mr-2" /> Back to Dashboard
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
          <h2 className="text-2xl font-bold text-slate-800">{teamName} Members</h2>
          {role === 'admin' && (
            <button 
              onClick={fetchAvailableUsers}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center text-sm font-medium hover:bg-blue-700"
            >
              <UserPlus size={18} className="mr-2" /> Add Member
            </button>
          )}
        </div>

        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-6 py-4">Member Name</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="3" className="text-center p-10 text-slate-400">Loading...</td></tr>
            ) : currentMembers.length > 0 ? (
              currentMembers.map((member) => (
                <tr key={member.user_id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-medium text-slate-700">{member.username || "Unnamed"}</td>
                  <td className="px-6 py-4 text-slate-500 capitalize">{member.role}</td>
                  <td className="px-6 py-4 text-center">
                    {role === 'admin' && (
                      <button onClick={() => handleRemoveMember(member.user_id)} className="text-red-400 hover:text-red-600 p-2">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="3" className="text-center p-10 text-slate-400 italic">No members in this team.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Assign to {teamName}</h3>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
            </div>
            <div className="max-h-64 overflow-y-auto pr-2">
              {availableUsers.map(user => (
                <div key={user.user_id} className="flex justify-between items-center p-3 mb-2 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{user.username || 'Unnamed'}</p>
                    <p className="text-[10px] text-slate-400 uppercase">{user.role}</p>
                  </div>
                  <button onClick={() => handleAddMember(user.user_id)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700">Add</button>
                </div>
              ))}
            </div>
            <button onClick={() => setIsAdding(false)} className="mt-4 w-full py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200">Close</button>
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
  const teamNames = ['Team 1', 'Team 2', 'Team 3', 'Team 4'];

const fetchAllStats = async () => {
    const { data: allMembers } = await supabase.from('Profiles').select('*');
    
    const newStats = {};
    teamNames.forEach(name => {
      const teamMembers = allMembers.filter(m => m.group === name);
      newStats[name] = {
        total: teamMembers.length,
        pointA: teamMembers.filter(m => m.last_checkpoint === 'A').length,
        pointB: teamMembers.filter(m => m.last_checkpoint === 'B').length
      };
    });
    setTeamStats(newStats);
  };

  useEffect(() => {
    fetchAllStats();
  }, [view]); // Refetch when returning to dashboard

  if (view === 'detail') {
    return <MemberListView teamName={selectedTeam} onBack={() => setView('dashboard')} role={role} />;
  }

  return (
    <div className="p-8 bg-[#f8fafc] min-h-screen">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Manage Groups</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {teamNames.map((team) => (
          <TeamCard 
            key={team} 
            teamName={team} 
            stats={teamStats[team] || { total: 0, pointA: 0, pointB: 0 }}
            onShowMembers={() => {
              setSelectedTeam(team);
              setView('detail');
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default ManageGroups;