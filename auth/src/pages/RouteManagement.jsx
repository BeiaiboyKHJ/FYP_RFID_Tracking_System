import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../client';
import { BrainCircuit, Loader2 } from 'lucide-react';
import {
  Plus, Trash2, MapPin, Clock,
  Save, ChevronRight, ChevronDown, ChevronUp, ArrowLeft, Pencil, Flag
} from 'lucide-react';

const RouteManagement = () => {
  const { tourId } = useParams();
  const navigate = useNavigate();

  const [routes, setRoutes]                   = useState([]);
  const [checkpoints, setCheckpoints]         = useState([]);
  const [tour, setTour]                       = useState(null);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState('');
  const [selectedRoute, setSelectedRoute]     = useState(null);
  const [isCreating, setIsCreating]           = useState(false);
  const [savingRoute, setSavingRoute]         = useState(false);
  const [expandedRoutes, setExpandedRoutes]   = useState({});
  const [routePrediction, setRoutePrediction] = useState(null);
  const [predictingRoute, setPredictingRoute] = useState(false);
  const [predictionError, setPredictionError] = useState('');
  const [memberProfiles, setMemberProfiles]   = useState([]);
  const [selectedMember, setSelectedMember]   = useState('');

  const [formData, setFormData] = useState({
    route_name: '',
    description: '',
    segments: [{ from_cp: '', to_cp: '', transport_mode: 'walk' }]
  });

  const FLASK_URL = import.meta.env.VITE_FLASK_URL || 'http://127.0.0.1:5000';

  const exitCheckpoint = checkpoints.find(cp => cp.is_exit) || null;

  // ── Fetch routes, checkpoints, tour ──────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: tourData, error: tourErr } = await supabase
          .from('tours').select('id, tour_name').eq('id', tourId).single();
        if (tourErr) throw tourErr;
        setTour(tourData);

        const { data: routesData, error: routesErr } = await supabase
          .from('routes')
          .select('id, route_name, description, is_active, created_at, route_segments(*)')
          .eq('tour_id', tourId)
          .order('created_at', { ascending: false });
        if (routesErr) throw routesErr;
        setRoutes(routesData || []);

        const { data: cpData, error: cpErr } = await supabase
          .from('checkpoints')
          .select('checkpoint_type, latitude, longitude, address, is_exit, end_time')
          .order('checkpoint_type');
        if (cpErr) throw cpErr;
        setCheckpoints(cpData || []);

      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    if (tourId) fetchData();
  }, [tourId]);

  // ── Fetch members for prediction dropdown ─────────────────────
  useEffect(() => {
    const fetchMembers = async () => {
      if (!tourId) return;
      const { data, error } = await supabase
        .from('Profiles')
        .select('user_id, username, age, gender, body_mass, body_size, shoe_size, vehicle_type')
        .not('rfid_uid', 'is', null);
      if (!error) setMemberProfiles(data || []);
    };
    fetchMembers();
  }, [tourId]);

  // ── Prediction helpers ────────────────────────────────────────
  const formatMin = (min) => {
    if (!min || min <= 0) return '—';
    const h = Math.floor(min / 60);
    const m = Math.floor(min % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const transportIcon = (mode) => {
    if (mode === 'walk') return '🚶';
    if (mode === 'car')  return '🚗';
    if (mode === 'bus')  return '🚌';
    return '📍';
  };

  const transportLabel = (mode) => {
    if (mode === 'walk') return 'Walking';
    if (mode === 'car')  return 'Car';
    if (mode === 'bus')  return 'Bus';
    return mode;
  };

  const calcDistance = async (fromCp, toCp, mode, cpMap) => {
    const from = cpMap[fromCp];
    const to   = cpMap[toCp];
    if (!from || !to) return 0;
    try {
      const profile = mode === 'walk' ? 'foot' : 'driving';
      const url = `https://router.project-osrm.org/route/v1/${profile}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=false`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.length > 0) return data.routes[0].distance;
      return 0;
    } catch { return 0; }
  };

  const handlePredictRoute = async (route) => {
    if (!route?.route_segments?.length) {
      setPredictionError('No segments found for this route.');
      return;
    }
    const member = memberProfiles.find(m => m.user_id === selectedMember);
    if (!member) {
      setPredictionError('Please select a member to predict for.');
      return;
    }

    setPredictingRoute(true);
    setPredictionError('');
    setRoutePrediction(null);

    try {
      const sorted = [...route.route_segments].sort((a, b) => (a.segment_order ?? 0) - (b.segment_order ?? 0));

      // Build checkpoint lat/lon map
      const cpTypes = [...new Set(sorted.flatMap(s => [s.from_checkpoint, s.to_checkpoint]))];
      const { data: cpData } = await supabase
        .from('checkpoints').select('checkpoint_type, latitude, longitude').in('checkpoint_type', cpTypes);
      const cpMap = {};
      (cpData || []).forEach(cp => { cpMap[cp.checkpoint_type] = cp; });

      // Predict segment by segment
      const segmentResults = [];
      let totalPredictedTime = 0;

      for (const seg of sorted) {
        const distanceM = await calcDistance(seg.from_checkpoint, seg.to_checkpoint, seg.transport_mode, cpMap);

        const payload = {
          items: [{
            id:             member.user_id,
            label:          member.username,
            transport_mode: seg.transport_mode,
            distance:       distanceM,
            age:            member.age || 25,
            mass:           member.body_mass || 70,
            height:         member.body_size || 1.7,
            shoe:           member.shoe_size || 40,
            gender:         member.gender || 'm',
            deadline:       9999,
          }]
        };

        const res  = await fetch(`${FLASK_URL}/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        const pred = data.predictions?.[0];
        const segTime = pred?.time_needed_min || 0;
        totalPredictedTime += segTime;

        segmentResults.push({
          segment_order:   seg.segment_order,
          from_checkpoint: seg.from_checkpoint,
          to_checkpoint:   seg.to_checkpoint,
          transport_mode:  seg.transport_mode,
          distance_m:      distanceM,
          predicted_min:   segTime,
          info:            pred?.info || '',
        });
      }

      // Fetch exit deadline
      const { data: exitData } = await supabase
        .from('checkpoints').select('end_time').eq('is_exit', true).limit(1).maybeSingle();

      const deadlineMin = exitData?.end_time
        ? (new Date(exitData.end_time) - new Date()) / 1000 / 60
        : null;

      const riskPercent = deadlineMin
        ? Math.min(Math.round((totalPredictedTime / deadlineMin) * 100), 100)
        : null;
      // NOTE: threshold raised to 75 — under-50% "late" was flagging healthy
      // margins (e.g. 74% remaining) as at-risk. Bands below stay in sync
      // with the risk bar's color stops (25 / 50 / 75).
      const isLate = riskPercent !== null ? riskPercent > 75 : false;

      setRoutePrediction({
        member_name:  member.username,
        segments:     segmentResults,
        total_min:    totalPredictedTime,
        deadline_min: deadlineMin,
        risk_percent: riskPercent,
        is_late:      isLate,
      });

    } catch (err) {
      console.error('Route prediction error:', err);
      setPredictionError('Prediction failed: ' + err.message);
    } finally {
      setPredictingRoute(false);
    }
  };

  // ── Route CRUD ────────────────────────────────────────────────
  const handleEditRoute = (route) => {
    setSelectedRoute(route);
    setIsCreating(false);
    setRoutePrediction(null);   // clear old prediction when switching routes
    setPredictionError('');
    setSelectedMember('');
    setFormData({
      route_name:  route.route_name,
      description: route.description || '',
      segments: (route.route_segments || [])
        .sort((a, b) => (a.segment_order ?? 0) - (b.segment_order ?? 0))  // FIX: sort here too
        .map(seg => ({
          from_cp:        seg.from_checkpoint,
          to_cp:          seg.to_checkpoint,
          transport_mode: seg.transport_mode,
          segment_order:  seg.segment_order,   // FIX: preserve segment_order
          id:             seg.id
        }))
    });
    setError('');
  };

  const toggleExpand = (routeId, e) => {
    if (e?.stopPropagation) e.stopPropagation();
    setExpandedRoutes(prev => ({ ...prev, [routeId]: !prev[routeId] }));
  };

  const handleNewRoute = () => {
    setSelectedRoute(null);
    setIsCreating(true);
    setRoutePrediction(null);
    setPredictionError('');
    setSelectedMember('');
    setFormData({ route_name: '', description: '', segments: [{ from_cp: '', to_cp: '', transport_mode: 'walk' }] });
    setError('');
  };

  const addSegment = () =>
    setFormData({ ...formData, segments: [...formData.segments, { from_cp: '', to_cp: '', transport_mode: 'walk' }] });

  const removeSegment = (index) => {
    if (formData.segments.length === 1) { setError('Route must have at least 1 segment'); return; }
    setFormData({ ...formData, segments: formData.segments.filter((_, i) => i !== index) });
  };

  const updateSegment = (index, field, value) => {
    const newSegments = [...formData.segments];
    newSegments[index][field] = value;
    setFormData({ ...formData, segments: newSegments });
  };

  const validateRoute = () => {
    setError('');
    if (!formData.route_name.trim()) { setError('Route name is required'); return false; }
    for (let i = 0; i < formData.segments.length; i++) {
      const seg = formData.segments[i];
      if (!seg.from_cp || !seg.to_cp) { setError(`Segment ${i + 1}: Select both checkpoints`); return false; }
      if (seg.from_cp === seg.to_cp)  { setError(`Segment ${i + 1}: From and To cannot be the same`); return false; }
    }
    return true;
  };

  const handleSaveRoute = async () => {
    if (!validateRoute()) return;
    setSavingRoute(true);
    try {
      if (selectedRoute) {
        const { error: updateErr } = await supabase.from('routes')
          .update({ route_name: formData.route_name, description: formData.description, updated_at: new Date().toISOString() })
          .eq('id', selectedRoute.id);
        if (updateErr) throw updateErr;

        const { error: delErr } = await supabase.from('route_segments').delete().eq('route_id', selectedRoute.id);
        if (delErr) throw delErr;

        const segments = formData.segments.map((seg, idx) => ({
          route_id: selectedRoute.id, segment_order: idx + 1,
          from_checkpoint: seg.from_cp, to_checkpoint: seg.to_cp, transport_mode: seg.transport_mode
        }));
        const { error: insErr } = await supabase.from('route_segments').insert(segments);
        if (insErr) throw insErr;

        setRoutes(routes.map(r => r.id === selectedRoute.id
          ? { ...r, route_name: formData.route_name, description: formData.description, route_segments: segments }
          : r));
      } else {
        const { data: newRoute, error: createErr } = await supabase.from('routes')
          .insert({ tour_id: tourId, route_name: formData.route_name, description: formData.description, is_active: true })
          .select().single();
        if (createErr) throw createErr;

        const segments = formData.segments.map((seg, idx) => ({
          route_id: newRoute.id, segment_order: idx + 1,
          from_checkpoint: seg.from_cp, to_checkpoint: seg.to_cp, transport_mode: seg.transport_mode
        }));
        const { error: segErr } = await supabase.from('route_segments').insert(segments);
        if (segErr) throw segErr;

        setRoutes([{ ...newRoute, route_segments: segments }, ...routes]);
      }

      setSelectedRoute(null); setIsCreating(false);
      setFormData({ route_name: '', description: '', segments: [{ from_cp: '', to_cp: '', transport_mode: 'walk' }] });
    } catch (err) {
      console.error('Error saving route:', err);
      setError(err.message || 'Failed to save route');
    } finally {
      setSavingRoute(false);
    }
  };

  const handleDeleteRoute = async (routeId) => {
    if (!window.confirm('Delete this route? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('routes').delete().eq('id', routeId);
      if (error) throw error;
      setRoutes(routes.filter(r => r.id !== routeId));
      if (selectedRoute?.id === routeId) { setSelectedRoute(null); setIsCreating(false); }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancel = () => {
    setSelectedRoute(null); setIsCreating(false); setError('');
    setRoutePrediction(null); setPredictionError(''); setSelectedMember('');
    setFormData({ route_name: '', description: '', segments: [{ from_cp: '', to_cp: '', transport_mode: 'walk' }] });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto text-indigo-600 animate-spin mb-4" />
          <p className="text-slate-500 text-sm">Loading routes…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-700">

      {/* ── Header ── */}
      <div className="bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Route Management</h1>
              <p className="text-slate-500 text-xs mt-0.5">{tour?.tour_name}</p>
            </div>
          </div>
          <button onClick={handleNewRoute}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-500 transition">
            <Plus size={16} /> New Route
          </button>
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT: Routes List */}
          <div className="lg:col-span-1 space-y-4">

            {/* Current Exit Checkpoint */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Flag size={12} className="text-orange-500" /> Current Exit Checkpoint
              </p>
              {exitCheckpoint ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-orange-500 text-white font-bold text-xs shrink-0">
                      {exitCheckpoint.checkpoint_type}
                    </span>
                    <h2 className="text-lg font-bold text-slate-900">
                      Checkpoint {exitCheckpoint.checkpoint_type}
                    </h2>
                  </div>
                  <p className="text-sm text-slate-500 mt-1.5 line-clamp-2">
                    {exitCheckpoint.address || 'No address set'}
                  </p>
                  {exitCheckpoint.end_time && (
                    <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                      <Clock size={11} /> Deadline: {new Date(exitCheckpoint.end_time).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400">No exit checkpoint set yet</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden sticky top-24">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <MapPin size={16} className="text-indigo-600" /> Routes
                </h2>
                <span className="text-xs text-slate-500">{routes.length} total</span>
              </div>
              <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-3 space-y-2">
                {routes.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">
                    <MapPin size={28} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-sm">No routes yet</p>
                  </div>
                ) : (
                  routes.map((route) => {
                    const isSelected = selectedRoute?.id === route.id;
                    const segs = (route.route_segments || []).sort(
                      (a, b) => (a.segment_order ?? 0) - (b.segment_order ?? 0)
                    );
                    return (
                      <div key={route.id}
                        onClick={() => handleEditRoute(route)}
                        className={`w-full text-left p-4 rounded-lg border cursor-pointer transition ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-500/10'
                            : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                        }`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-slate-900 text-sm truncate">{route.route_name}</h3>
                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                              <Clock size={11} /> {segs.length} segment{segs.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <button onClick={(e) => toggleExpand(route.id, e)}
                            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition shrink-0">
                            {expandedRoutes[route.id] ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </button>
                        </div>
                        {expandedRoutes[route.id] && (
                          <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center gap-1.5 text-xs">
                            {segs.map((seg, sIdx) => (
                              <React.Fragment key={seg.id ?? sIdx}>
                                <span className="text-slate-600 font-medium">{seg.from_checkpoint}</span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {transportLabel(seg.transport_mode)}
                                </span>
                                {sIdx === segs.length - 1 && (
                                  <span className="text-slate-600 font-medium">→ {seg.to_checkpoint}</span>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Form */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 lg:p-8">
              {!selectedRoute && !isCreating ? (
                <div className="text-center py-16">
                  <MapPin size={40} className="mx-auto text-slate-300 mb-4" />
                  <h3 className="text-lg font-bold text-slate-900 mb-2">No route selected</h3>
                  <p className="text-slate-500 text-sm mb-6">Select a route from the list to edit, or create a new one</p>
                  <button onClick={handleNewRoute}
                    className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-500 transition">
                    <Plus size={16} /> Create Route
                  </button>
                </div>
              ) : (
                <>
                  {/* Form Header */}
                  <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        {formData.route_name || (selectedRoute ? 'Edit Route' : 'New Route')}
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        {formData.description || 'Define the checkpoints and transport for each leg'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedRoute && (
                        <button onClick={() => handleDeleteRoute(selectedRoute.id)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/10 px-3 py-2 rounded-lg transition">
                          <Trash2 size={14} /> Delete
                        </button>
                      )}
                      <button onClick={handleCancel}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 px-3 py-2 rounded-lg transition">
                        Cancel
                      </button>
                      <button onClick={handleSaveRoute} disabled={savingRoute}
                        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition ${
                          savingRoute
                            ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                            : 'bg-emerald-600 text-white hover:bg-emerald-500'
                        }`}>
                        <Save size={14} /> {savingRoute ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-6">
                      <p className="text-red-600 text-sm font-medium">⚠️ {error}</p>
                    </div>
                  )}

                  {/* Route Name & Description */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 pb-8 border-b border-slate-200">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Route Name *</label>
                      <input type="text" value={formData.route_name}
                        onChange={(e) => setFormData({ ...formData, route_name: e.target.value })}
                        placeholder="e.g., Main Circuit"
                        className="w-full bg-slate-100 border border-slate-300 text-slate-700 placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Description</label>
                      <input type="text" value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Walking + vehicle segments to exit"
                        className="w-full bg-slate-100 border border-slate-300 text-slate-700 placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition" />
                    </div>
                  </div>

                  {/* Segments */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Route Segments</h3>
                    </div>
                    {checkpoints.length === 0 && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 mb-4">
                        <p className="text-amber-600 text-sm">⚠️ No checkpoints available. Create checkpoints first in Location Management.</p>
                      </div>
                    )}
                    <div className="relative space-y-3">
                      {formData.segments.map((segment, idx) => (
                        <div key={idx} className="relative flex gap-4">
                          {/* Connector line + numbered dot */}
                          <div className="flex flex-col items-center pt-1">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-xs shrink-0">
                              {idx + 1}
                            </span>
                            {idx < formData.segments.length - 1 && (
                              <span className="w-px flex-1 bg-slate-300 mt-1" />
                            )}
                          </div>

                          <div className="flex-1 bg-slate-50 border border-slate-300 rounded-lg p-4 mb-1">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">From</label>
                                <select value={segment.from_cp} onChange={(e) => updateSegment(idx, 'from_cp', e.target.value)}
                                  className="w-full bg-white border border-slate-300 text-slate-700 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition">
                                  <option value="">Select checkpoint</option>
                                  {checkpoints.map((cp) => (
                                    <option key={cp.checkpoint_type} value={cp.checkpoint_type}>{cp.checkpoint_type}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">To</label>
                                <select value={segment.to_cp} onChange={(e) => updateSegment(idx, 'to_cp', e.target.value)}
                                  className="w-full bg-white border border-slate-300 text-slate-700 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition">
                                  <option value="">Select checkpoint</option>
                                  {checkpoints.map((cp) => (
                                    <option key={cp.checkpoint_type} value={cp.checkpoint_type}>{cp.checkpoint_type}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Transport</label>
                                <select value={segment.transport_mode} onChange={(e) => updateSegment(idx, 'transport_mode', e.target.value)}
                                  className="w-full bg-white border border-slate-300 text-slate-700 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition">
                                  <option value="walk">🚶 Walk</option>
                                  <option value="car">🚗 Car</option>
                                  <option value="bus">🚌 Bus</option>
                                </select>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-3">
                              {segment.from_cp && segment.to_cp ? (
                                <p className="text-xs text-slate-500">
                                  {segment.from_cp} <span className="mx-1">{transportIcon(segment.transport_mode)}</span> {segment.to_cp}
                                </p>
                              ) : <span />}
                              {formData.segments.length > 1 && (
                                <button onClick={() => removeSegment(idx)}
                                  className="text-slate-500 hover:text-red-600 hover:bg-red-500/10 p-1.5 rounded transition">
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={addSegment}
                      className="w-full mt-2 flex items-center justify-center gap-2 text-slate-500 hover:text-indigo-600 hover:border-indigo-500/50 px-4 py-3 rounded-lg text-sm font-semibold transition border border-dashed border-slate-300">
                      <Plus size={16} /> Add Segment
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* ── ROUTE RISK PREDICTION PANEL ── */}
            {selectedRoute && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 lg:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-indigo-500/10 rounded-lg">
                    <BrainCircuit size={20} className="text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Risk prediction</h2>
                    <p className="text-xs text-slate-500">Estimate journey time and delay risk for a member</p>
                  </div>
                </div>

                {/* Member Selector + Button */}
                <div className="flex items-end gap-3 mb-6 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <select value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)}
                      className="w-full bg-slate-100 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition text-slate-700">
                      <option value="">— Choose a member —</option>
                      {memberProfiles.map(m => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.username} ({m.vehicle_type || 'walk'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button onClick={() => handlePredictRoute(selectedRoute)}
                    disabled={predictingRoute || !selectedMember}
                    className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
                      predictingRoute || !selectedMember
                        ? 'bg-slate-100 text-slate-500 cursor-not-allowed'
                        : 'bg-indigo-600 text-white hover:bg-indigo-500'
                    }`}>
                    {predictingRoute
                      ? <><Loader2 size={16} className="animate-spin" /> Predicting…</>
                      : <><BrainCircuit size={16} /> Run prediction</>}
                  </button>
                </div>

                {predictionError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-6">
                    <p className="text-red-600 text-sm font-medium">⚠️ {predictionError}</p>
                  </div>
                )}

                {routePrediction && (
                  <div className="space-y-6">

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-slate-50 border border-slate-300 rounded-xl p-4">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Total Journey</p>
                        <p className="text-2xl font-bold text-indigo-600">{formatMin(routePrediction.total_min)}</p>
                        <p className="text-xs text-slate-500 mt-1">{routePrediction.segments.length} segments</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-300 rounded-xl p-4">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Deadline Left</p>
                        <p className="text-2xl font-bold text-amber-600">
                          {routePrediction.deadline_min ? formatMin(routePrediction.deadline_min) : 'No deadline'}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Exit checkpoint</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-300 rounded-xl p-4">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Risk</p>
                        <p className={`text-2xl font-bold ${routePrediction.is_late ? 'text-red-600' : 'text-emerald-600'}`}>
                          {routePrediction.risk_percent !== null ? `${routePrediction.risk_percent}%` : '—'}
                        </p>
                        <span className={`inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          routePrediction.is_late
                            ? 'bg-red-500/15 text-red-600'
                            : 'bg-emerald-500/15 text-emerald-600'
                        }`}>
                          {routePrediction.is_late ? 'Delay risk' : 'On track'}
                        </span>
                      </div>
                    </div>

                    {/* Risk Bar */}
                    {routePrediction.risk_percent !== null && (
                      <div>
                        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                          <span>0%</span>
                          <span className="text-slate-600 font-medium">
                            Risk: {routePrediction.risk_percent}% — {routePrediction.member_name}
                          </span>
                          <span>100%</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${
                            routePrediction.risk_percent > 75 ? 'bg-red-500' :
                            routePrediction.risk_percent > 50 ? 'bg-orange-400' :
                            routePrediction.risk_percent > 25 ? 'bg-yellow-400' : 'bg-emerald-500'
                          }`} style={{ width: `${routePrediction.risk_percent}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Per-Segment Breakdown */}
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Segment Breakdown</h3>
                      <div className="space-y-2.5">
                        {routePrediction.segments.map((seg, idx) => (
                          <div key={idx} className="flex items-center gap-4 bg-slate-50 border border-slate-300 rounded-xl p-4">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-xs shrink-0">
                              {seg.segment_order}
                            </span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                <span>{seg.from_checkpoint}</span>
                                <span>→</span>
                                <span>{seg.to_checkpoint}</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {transportLabel(seg.transport_mode)} · {(seg.distance_m / 1000).toFixed(1)} km
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-base font-bold text-indigo-600">{formatMin(seg.predicted_min)}</p>
                              <p className="text-[11px] text-slate-500">predicted</p>
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between bg-indigo-600 text-white rounded-xl px-5 py-3.5">
                          <span className="font-bold text-xs uppercase tracking-wide">Total Journey</span>
                          <span className="text-xl font-bold">{formatMin(routePrediction.total_min)}</span>
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            )}

          </div>{/* end lg:col-span-2 */}
        </div>{/* end grid */}
      </div>{/* end max-w-7xl */}
    </div>
  );
};

export default RouteManagement;