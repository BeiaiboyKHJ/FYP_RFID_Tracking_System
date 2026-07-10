import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../client';

const CheckpointLatencyTest = () => {
  const [wsResults, setWsResults] = useState([]);
  const [pollResults, setPollResults] = useState([]);
  const [isPolling, setIsPolling] = useState(false);
  const [pollReady, setPollReady] = useState(false);
  const [isWsListening, setIsWsListening] = useState(false);
  const [log, setLog] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('A');
  const [isTriggeringWs, setIsTriggeringWs] = useState(false);
  const [isTriggeringPoll, setIsTriggeringPoll] = useState(false);

  const pollRef = useRef(null);
  const wsChannelRef = useRef(null);
  const triggerTimeRef = useRef(null);
  const baselineRef = useRef(null);
  const lastKnownRef = useRef({});

  const CHECKPOINTS = ['A', 'B', 'C', 'D', 'E'];

  // Fetch members on mount
  useEffect(() => {
    const fetchMembers = async () => {
      const { data } = await supabase
        .from('Profiles')
        .select('user_id, username')
        .eq('role', 'member')
        .order('username');
      if (data) {
        setMembers(data);
        if (data.length > 0) setSelectedMember(data[0].user_id);
      }
    };
    fetchMembers();
  }, []);

  // ── METHOD 1: WebSocket ──
  const startWsListening = () => {
    if (wsChannelRef.current) return;
    setIsWsListening(true);

    wsChannelRef.current = supabase
      .channel('latency-checkpoint-ws-' + Date.now())
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'Profiles' },
        (payload) => {
          const receivedAt = Date.now();
          const triggerTime = triggerTimeRef.current;

          // Try updated_at first, fall back to commit_timestamp
        const dbTimestamp =
        payload.commit_timestamp
            ? new Date(payload.commit_timestamp).getTime()
            : payload.new?.updated_at
            ? new Date(payload.new.updated_at).getTime()
            : null;

          const dbLatency = dbTimestamp ? receivedAt - dbTimestamp : null;
          const e2eLatency = triggerTime ? receivedAt - triggerTime : null;

          setWsResults(prev => {
            const trialNumber = prev.length + 1;
            const entry = {
              trial: trialNumber,
              member: payload.new?.username || 'Unknown',
              status: payload.new?.status || '-',
              e2eLatency,
              dbLatency,
              timestamp: new Date().toLocaleTimeString()
            };
            setLog(prevLog => [
              `[WS] Trial ${trialNumber} | ${entry.member} → ${entry.status} | DB: ${dbLatency ?? 'N/A'}ms | E2E: ${e2eLatency ?? 'N/A'}ms`,
              ...prevLog
            ]);
            return [...prev, entry];
          });

          triggerTimeRef.current = null;
          setIsTriggeringWs(false);
        }
      )
      .subscribe((status) => {
        setLog(prev => [`[WS] Channel status: ${status}`, ...prev]);
      });
  };

  const stopWsListening = () => {
    if (wsChannelRef.current) {
      supabase.removeChannel(wsChannelRef.current);
      wsChannelRef.current = null;
    }
    setIsWsListening(false);
  };

  // ── METHOD 2: HTTP Polling ──
  // Uses status string comparison only — no updated_at needed
  const startPolling = () => {
    if (pollRef.current) return;
    setIsPolling(true);
    setPollReady(false);
    lastKnownRef.current = {};
    baselineRef.current = null;

    addLog('[POLL] Starting... fetching baseline now.');

    const fetchBaseline = async () => {
      const { data, error } = await supabase
        .from('Profiles')
        .select('user_id, username, status, updated_at')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) {
        addLog(`[POLL] ❌ Baseline fetch failed: ${error.message}`);
        return;
      }
      if (!data || data.length === 0) {
        addLog('[POLL] Baseline fetch returned no data');
        return;
      }

      baselineRef.current = {};
      data.forEach(r => {
        baselineRef.current[r.user_id] = {
          status: r.status,
          updated_at: r.updated_at
        };
      });
      setPollReady(true);
      addLog(`[POLL] ✅ Baseline set for ${data.length} members. Trigger a status update now.`);
    };

    fetchBaseline();

    pollRef.current = setInterval(async () => {
      if (!baselineRef.current) return;

      const pollStart = Date.now();

      const { data, error } = await supabase
        .from('Profiles')
        .select('user_id, username, status, updated_at')
        .order('updated_at', { ascending: false })
        .limit(50);

      const roundTrip = Date.now() - pollStart;

      if (error) {
        addLog(`[POLL] ❌ Error: ${error.message}`);
        return;
      }
      if (!data || data.length === 0) {
        addLog('[POLL] No data returned');
        return;
      }

      const changes = [];
      data.forEach(row => {
        const prev = baselineRef.current[row.user_id];
        if (!prev) {
          baselineRef.current[row.user_id] = {
            status: row.status,
            updated_at: row.updated_at
          };
          return;
        }

        const statusChanged = row.status !== prev.status;
        const updatedAtChanged = row.updated_at !== prev.updated_at;

        if (statusChanged || updatedAtChanged) {
          baselineRef.current[row.user_id] = {
            status: row.status,
            updated_at: row.updated_at
          };
          changes.push({
            member: row.username || 'Unknown',
            status: row.status || 'null',
            roundTrip,
            timestamp: new Date().toLocaleTimeString()
          });
        }
      });

      if (changes.length > 0) {
        setPollResults(prevResults => {
          const entries = changes.map((entry, index) => ({
            trial: prevResults.length + index + 1,
            ...entry
          }));
          return [...prevResults, ...entries];
        });
        addLog(`[POLL] Detected ${changes.length} change(s) this cycle (round-trip: ${roundTrip}ms)`);
        setIsTriggeringPoll(false);
      } else {
        addLog(`[POLL] No change detected (round-trip: ${roundTrip}ms)`);
      }
    }, 3000);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    baselineRef.current = null;
    lastKnownRef.current = {};
    setIsPolling(false);
    setIsTriggeringPoll(false);
    addLog('[POLL] Stopped.');
  };

  // Helper to add log without stale closure issues
  const addLog = (msg) => {
    setLog(prev => [msg, ...prev]);
  };

  // ── Trigger update ──
  const triggerUpdate = async (method) => {
    if (!selectedMember) return alert('Select a member first');
    if (method === 'poll' && !pollReady) return alert('Polling is still initializing. Wait until baseline is recorded.');

    if (method === 'ws') setIsTriggeringWs(true);
    if (method === 'poll') {
      setIsTriggeringPoll(true);
      // Auto-reset after 10s in case detection fails
      setTimeout(() => setIsTriggeringPoll(false), 10000);
    }

    triggerTimeRef.current = Date.now();

    addLog(`[TRIGGER] Updating member to status: "${selectedStatus}"...`);

    const { error } = await supabase
      .from('Profiles')
      .update({ status: selectedStatus })
      .eq('user_id', selectedMember);

    if (error) {
      addLog(`[TRIGGER] ❌ Failed: ${error.message}`);
      setIsTriggeringWs(false);
      setIsTriggeringPoll(false);
    } else {
      addLog(`[TRIGGER] ✅ DB write done. Waiting for ${method === 'ws' ? 'WebSocket push' : 'next poll cycle (up to 3s)'}...`);
    }
  };

  // ── Stats ──
  const wsStats = calcStats(wsResults.map(r => r.dbLatency).filter(v => v !== null));
  const pollStats = calcStats(pollResults.map(r => r.roundTrip));

  const copyResults = () => {
    const output = {
      websocket: { results: wsResults, stats: wsStats },
      polling: { results: pollResults, stats: pollStats }
    };
    navigator.clipboard.writeText(JSON.stringify(output, null, 2));
    alert('Copied!');
  };

  const clearAll = () => {
    setWsResults([]);
    setPollResults([]);
    setLog([]);
    baselineRef.current = null;
  };

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', background: '#1a1a1a', color: '#fff', minHeight: '100vh' }}>
      <h2 style={{ color: '#4ecdc4', marginBottom: 4 }}>Checkpoint Status Update — Latency Test</h2>
      <p style={{ color: '#aaa', marginBottom: 24, fontSize: 13 }}>
        Simulates MemberManagement checkpoint status changes. Tests Supabase WebSocket vs HTTP Polling latency.
      </p>

      {/* ── Trigger Controls ── */}
      <div style={{ background: '#2a2a2a', padding: 16, borderRadius: 8, marginBottom: 24 }}>
        <h3 style={{ color: '#f39c12', marginBottom: 12 }}>Trigger a Status Update</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: 11, color: '#aaa', display: 'block', marginBottom: 4 }}>MEMBER</label>
            <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)} style={selectStyle}>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.username}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, color: '#aaa', display: 'block', marginBottom: 4 }}>CHECKPOINT</label>
            <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} style={selectStyle}>
              {CHECKPOINTS.map(cp => <option key={cp} value={cp}>Checkpoint {cp}</option>)}
              <option value="Missing">Missing</option>
              <option value="">Not Started (null)</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 16 }}>
            <button
              onClick={() => triggerUpdate('ws')}
              disabled={!isWsListening || isTriggeringWs}
              style={btnStyle(isTriggeringWs ? '#555' : '#4ecdc4')}
            >
              {isTriggeringWs ? '⏳ Waiting WS...' : '⚡ Trigger (WS Test)'}
            </button>
            <button
              onClick={() => triggerUpdate('poll')}
              disabled={!isPolling || !pollReady || isTriggeringPoll}
              style={btnStyle(isTriggeringPoll || !pollReady ? '#555' : '#f39c12')}
            >
              {isTriggeringPoll ? '⏳ Waiting Poll...' : pollReady ? '⚡ Trigger (Poll Test)' : '⏳ Initializing...'}
            </button>
          </div>
        </div>
        <p style={{ color: '#666', fontSize: 11, marginTop: 8 }}>
          ⚠️ Start a method first → wait for baseline log → then Trigger. Change checkpoint each trial to force a status change.
        </p>
      </div>

      {/* ── Method Controls ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ background: '#2a2a2a', padding: 16, borderRadius: 8, flex: 1, minWidth: 220 }}>
          <h4 style={{ color: '#4ecdc4', marginBottom: 8 }}>Method 1: WebSocket</h4>
          <p style={{ color: '#aaa', fontSize: 11, marginBottom: 12 }}>Supabase Realtime — same as MemberManagement.jsx</p>
          {!isWsListening
            ? <button onClick={startWsListening} style={btnStyle('#2ecc71')}>▶ Start Listening</button>
            : <button onClick={stopWsListening} style={btnStyle('#e74c3c')}>⏹ Stop</button>
          }
          <span style={{ marginLeft: 8, fontSize: 11, color: isWsListening ? '#2ecc71' : '#666' }}>
            {isWsListening ? '● ACTIVE' : '○ idle'}
          </span>
        </div>

        <div style={{ background: '#2a2a2a', padding: 16, borderRadius: 8, flex: 1, minWidth: 220 }}>
          <h4 style={{ color: '#f39c12', marginBottom: 8 }}>Method 2: HTTP Polling (3s)</h4>
          <p style={{ color: '#aaa', fontSize: 11, marginBottom: 12 }}>Polls Supabase every 3s — no updated_at needed</p>
          {!isPolling
            ? <button onClick={startPolling} style={btnStyle('#2ecc71')}>▶ Start Polling</button>
            : <button onClick={stopPolling} style={btnStyle('#e74c3c')}>⏹ Stop</button>
          }
          <span style={{ marginLeft: 8, fontSize: 11, color: isPolling ? '#f39c12' : '#666' }}>
            {isPolling ? '● ACTIVE' : '○ idle'}
          </span>
        </div>
      </div>

      {/* ── Summary Table ── */}
      <h3 style={{ color: '#f39c12', marginBottom: 8 }}>Summary Comparison</h3>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 24 }}>
        <thead>
          <tr style={{ background: '#333' }}>
            {['Metric', 'Supabase WebSocket', 'HTTP Polling (3s)'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ['Samples collected', wsStats.count, pollStats.count],
            ['Min latency (ms)', wsStats.min ?? '-', pollStats.min ?? '-'],
            ['Max latency (ms)', wsStats.max ?? '-', pollStats.max ?? '-'],
            ['Mean latency (ms)', wsStats.mean ?? '-', pollStats.mean ?? '-'],
            ['Std deviation (ms)', wsStats.std ?? '-', pollStats.std ?? '-'],
            ['Worst-case staleness', `${wsStats.max ?? '-'}ms`, 'Up to 3000ms'],
          ].map(([label, ws, poll]) => (
            <tr key={label}>
              <td style={tdStyle}>{label}</td>
              <td style={{ ...tdStyle, color: '#4ecdc4' }}>{ws}</td>
              <td style={{ ...tdStyle, color: '#f39c12' }}>{poll}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Raw Trial Tables ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <h4 style={{ color: '#4ecdc4' }}>WebSocket Trials ({wsResults.length})</h4>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#333' }}>
                {['#', 'Member', 'Status', 'DB Prop (ms)', 'E2E (ms)', 'Time'].map(h => (
                  <th key={h} style={{ ...thStyle, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wsResults.map((r, i) => (
                <tr key={`ws-${i}`}>
                  <td style={tdStyle}>{r.trial}</td>
                  <td style={tdStyle}>{r.member}</td>
                  <td style={{ ...tdStyle, color: '#4ecdc4' }}>{r.status}</td>
                  <td style={{ ...tdStyle, color: '#2ecc71' }}>{r.dbLatency ?? 'N/A'}</td>
                  <td style={{ ...tdStyle, color: '#aaa' }}>{r.e2eLatency ?? '-'}</td>
                  <td style={{ ...tdStyle, color: '#666', fontSize: 10 }}>{r.timestamp}</td>
                </tr>
              ))}
              {wsResults.length === 0 && (
                <tr><td colSpan={6} style={{ ...tdStyle, color: '#555', textAlign: 'center' }}>No data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <h4 style={{ color: '#f39c12' }}>Polling Trials ({pollResults.length})</h4>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#333' }}>
                {['#', 'Member', 'Status', 'Round-trip (ms)', 'Time'].map(h => (
                  <th key={h} style={{ ...thStyle, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pollResults.map((r, i) => (
                <tr key={`poll-${i}`}>
                  <td style={tdStyle}>{r.trial}</td>
                  <td style={tdStyle}>{r.member}</td>
                  <td style={{ ...tdStyle, color: '#f39c12' }}>{r.status}</td>
                  <td style={{ ...tdStyle, color: '#e74c3c' }}>{r.roundTrip}</td>
                  <td style={{ ...tdStyle, color: '#666', fontSize: 10 }}>{r.timestamp}</td>
                </tr>
              ))}
              {pollResults.length === 0 && (
                <tr><td colSpan={5} style={{ ...tdStyle, color: '#555', textAlign: 'center' }}>No data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Live Log ── */}
      <h3 style={{ color: '#f39c12' }}>Live Event Log</h3>
      <div style={{ background: '#111', padding: 12, borderRadius: 8, maxHeight: 250, overflowY: 'auto', marginBottom: 16 }}>
        {log.length === 0
          ? <p style={{ color: '#555' }}>Waiting for events...</p>
          : log.map((entry, i) => (
            <div key={i} style={{
              color: entry.includes('[WS]') ? '#4ecdc4' : entry.includes('[TRIGGER]') ? '#fff' : '#f39c12',
              marginBottom: 4, fontSize: 12
            }}>
              {entry}
            </div>
          ))
        }
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={copyResults} style={btnStyle('#3498db')}>📋 Copy Results</button>
        <button onClick={clearAll} style={btnStyle('#95a5a6')}>🗑 Clear All</button>
      </div>
    </div>
  );
};

function calcStats(arr) {
  if (!arr.length) return { min: null, max: null, mean: null, std: null, count: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
  return {
    min: Math.min(...arr),
    max: Math.max(...arr),
    mean: mean.toFixed(1),
    std: std.toFixed(1),
    count: arr.length
  };
}

const btnStyle = (color) => ({
  background: color, color: '#fff', border: 'none',
  padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
  fontWeight: 'bold', fontSize: 13
});

const selectStyle = {
  background: '#333', color: '#fff', border: '1px solid #555',
  padding: '6px 10px', borderRadius: 6, fontSize: 13
};

const thStyle = { padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #444', fontSize: 12 };
const tdStyle = { padding: '6px 12px', borderBottom: '1px solid #2a2a2a', fontSize: 12 };

export default CheckpointLatencyTest;
