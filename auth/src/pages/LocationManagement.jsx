import React, { useState, useEffect } from 'react';
import { supabase } from '../client';
import { MapPin, X, History, Trash2, Cloud, Plus, Loader2, Navigation, Clock, Flag, ChevronRight, Search } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({ iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

// Haversine distance
const getDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return d > 1 ? `${d.toFixed(2)} km` : `${(d*1000).toFixed(0)} m`;
};

// Labeled colored pin icon
const createLabeledIcon = (label, isExit = false, isNew = false) => {
  const color = isNew ? '#94a3b8' : isExit ? '#f97316' : '#2563eb';
  const html = `<div style="background:${color};color:white;width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2.5px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.15);"><span style="transform:rotate(45deg);font-size:13px;font-weight:800;font-family:system-ui,sans-serif;line-height:1;">${label}</span></div>`;
  return L.divIcon({ html, className: '', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -36] });
};

const RecenterMap = ({ position }) => {
  const map = useMap();
  useEffect(() => {
    if (Array.isArray(position) && typeof position[0]==='number' && typeof position[1]==='number')
      map.flyTo(position, 15, { animate: true });
  }, [position, map]);
  return null;
};

const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({ click: (e) => onMapClick([e.latlng.lat, e.latlng.lng]) });
  return null;
};

const LocationManagement = ({ userRole }) => {
  const [activeNodes, setActiveNodes]       = useState([]);
  const [isSavedView, setIsSavedView]       = useState(false);
  const [savedLocations, setSavedLocations] = useState([]);
  const [editingType, setEditingType]       = useState(null);
  const [loading, setLoading]               = useState(true);
  const [formData, setFormData]             = useState({ address: '', weather: '', checkpointType: '', endTime: '' });
  const [shouldSaveToHistory, setShouldSaveToHistory] = useState(false);
  const [searchQuery, setSearchQuery]       = useState('');
  const [isSearching, setIsSearching]       = useState(false);
  const [tempMarker, setTempMarker]         = useState(null);
  const [searchResults, setSearchResults]   = useState([]);
  const [searchTimer, setSearchTimer]       = useState(null);
  const [panelOpen, setPanelOpen]           = useState(false);

  const isAdmin = userRole === 'admin';

  useEffect(() => {
    fetchActiveNodes();
    fetchSavedLibrary();
  }, []);

  useEffect(() => {
    if (editingType) setPanelOpen(true);
    else setPanelOpen(false);
  }, [editingType]);

  const getNextLabel = () => {
    if (activeNodes.length === 0) return 'A';
    // Sort ascending to get correct alphabetically sequential character calculations
    const labels = activeNodes.map(n => n.checkpoint_type.toUpperCase()).sort();
    return String.fromCharCode(labels[labels.length - 1].charCodeAt(0) + 1);
  };

  const getCurrentLocation = () => {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      const pos = [lat, lon];
      setTempMarker(pos);

      // Reverse geocoding using OpenStreetMap
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
        );

        const data = await response.json();

        const weather = await fetchWeather(lat, lon);

        setFormData(prev => ({
          ...prev,
          address: data.display_name || `${lat}, ${lon}`,
          weather
        }));
      } catch (err) {
        console.error(err);
      }
    },
    (error) => {
      alert("Unable to retrieve your location.");
      console.error(error);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
};

  const fetchActiveNodes = async () => {
    setLoading(true);
    // REMOVED .is('user_id', null) since checkpoints master table doesn't track specific users
    // Sorted ascending (A -> B -> C) so the ordered route manifest flows naturally
    const { data, error } = await supabase
      .from('checkpoints')
      .select('*')
      .order('checkpoint_type', { ascending: true });
      
    if (!error && data) setActiveNodes(data);
    setLoading(false);
  };

  const fetchSavedLibrary = async () => {
    // Fetches templates stored in locations table that aren't tied to an active user trace log
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('is_saved', true)
      .is('user_id', null)
      .order('created_at', { ascending: false });
    if (data) setSavedLocations(data);
  };

  const closePanel = () => { 
    setEditingType(null); 
    setTempMarker(null); 
    setFormData({ address: '', weather: '', checkpointType: '', endTime: '' }); 
    setSearchResults([]); 
    setShouldSaveToHistory(false); 
  };

  const handleUpdate = async () => {
    if (!isAdmin) return;
    if (!tempMarker || !formData.checkpointType) { alert("Please select a location and assign a label."); return; }
    setLoading(true);

    const cpType = formData.checkpointType.toUpperCase();

    // 1. Commit the primary configuration node update to master checkpoints table
    const { error: checkpointError } = await supabase.from('checkpoints').upsert({
      checkpoint_type: cpType,
      address:         formData.address,
      latitude:        tempMarker[0],
      longitude:       tempMarker[1],
      weather:         formData.weather,
      end_time:        formData.endTime ? new Date(formData.endTime).toISOString() : null,
    }, { onConflict: 'checkpoint_type' });

    if (checkpointError) {
      alert("Checkpoint error: " + checkpointError.message);
      setLoading(false);
      return;
    }

    // 2. If archive toggle is switched on, store a copy inside the location asset pool template library
    if (shouldSaveToHistory) {
      await supabase.from('locations').insert({
        address: formData.address,
        latitude: tempMarker[0],
        longitude: tempMarker[1],
        weather: formData.weather,
        is_saved: true,
        user_id: null // Kept blank to maintain template scope integrity
      });
    }

    closePanel(); 
    fetchActiveNodes(); 
    fetchSavedLibrary();
    setLoading(false);
  };

  const handleToggleExit = async (loc) => {
    if (!isAdmin) return;
    const newStatus = !loc.is_exit;
    try {
      if (newStatus) {
        // Clear old structural exit configurations to ensure a unified master target node system mapping
        await supabase.from('checkpoints').update({ is_exit: false }).neq('checkpoint_type', '');
      }
      const { error } = await supabase.from('checkpoints').update({ is_exit: newStatus }).eq('checkpoint_type', loc.checkpoint_type);
      if (error) throw error;
      fetchActiveNodes();
    } catch (err) { alert("Failed: " + err.message); }
  };

  const handleOpenEdit = (type, current = null) => {
    if (!isAdmin) return;
    const label = type || getNextLabel();
    setEditingType(label);
    setFormData({ 
      checkpointType: label, 
      address: current?.address || '', 
      weather: current?.weather || '', 
      endTime: current?.end_time ? new Date(current.end_time).toISOString().slice(0, 16) : '' 
    });
    if (current?.latitude && current?.longitude) setTempMarker([current.latitude, current.longitude]);
    else setTempMarker(null);
  };

  const handleDeleteCheckpoint = async (targetLabel) => {
    if (!isAdmin) return;
    if (!window.confirm(`Delete Checkpoint ${targetLabel}?`)) return;
    setLoading(true);
    try {
      await supabase.from('checkpoints').delete().eq('checkpoint_type', targetLabel);
      
      // Cascading index adjustment to re-align remaining system nodes systematically
      const subsequent = activeNodes.filter(n => n.checkpoint_type > targetLabel);
      for (const node of subsequent) {
        const newLetter = String.fromCharCode(node.checkpoint_type.charCodeAt(0) - 1);
        await supabase.from('checkpoints').update({ checkpoint_type: newLetter }).eq('checkpoint_type', node.checkpoint_type);
      }
      fetchActiveNodes();
    } catch (e) { alert(e.message); }
    setLoading(false);
  };

  const updateSearch = (query) => {
    setSearchQuery(query);
    if (searchTimer) clearTimeout(searchTimer);
    if (query.length < 3) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=en&addressdetails=1`);
      const data = await res.json();
      setSearchResults(data || []);
      setIsSearching(false);
    }, 600);
    searchTimer(timer);
  };

  const fetchWeather = async (lat, lon) => {
    try {
      const res = await fetch(`https://api.weatherapi.com/v1/current.json?key=001b4135f8e54c2eaf4135754261304&q=${lat},${lon}`);
      const data = await res.json();
      return data.current ? `${data.current.temp_c}°C, ${data.current.condition.text}` : 'N/A';
    } catch { return 'N/A'; }
  };

  const selectLocation = async (result) => {
    const pos = [parseFloat(result.lat), parseFloat(result.lon)];
    setTempMarker(pos);
    const weather = await fetchWeather(result.lat, result.lon);
    setFormData(prev => ({ ...prev, address: result.display_name, weather }));
    setSearchResults([]);
    setSearchQuery('');
  };

  // ── Saved Library View ─────────────────────────────────────────────────────
  if (isSavedView) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="max-w-4xl mx-auto">
          <header className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <History className="text-blue-600" size={24}/> Library Templates
              </h1>
              <p className="text-slate-500 text-sm mt-1">Select a saved location preset to generate a checkpoint</p>
            </div>
            <button onClick={() => setIsSavedView(false)} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-semibold shadow-sm hover:bg-slate-50 text-slate-700 text-sm transition-all">
              ← Back to Dashboard
            </button>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedLocations.length === 0 ? (
              <div className="col-span-2 p-16 text-center bg-white rounded-2xl border border-slate-200 border-dashed text-slate-400 font-medium">
                No locations saved to library yet.
              </div>
            ) : savedLocations.map(loc => (
              <div key={loc.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-slate-300 transition-all">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg font-semibold text-xs mb-3">
                    <Cloud size={12}/> {loc.weather || 'Weather data unavailable'}
                  </div>
                  <p className="text-sm font-medium text-slate-800 leading-relaxed mb-4">{loc.address}</p>
                </div>
                <button onClick={() => { setFormData({ ...formData, address: loc.address, weather: loc.weather || '' }); setTempMarker([loc.latitude, loc.longitude]); setIsSavedView(false); setEditingType(getNextLabel()); }} className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-xs tracking-wide uppercase hover:bg-blue-700 transition-all shadow-sm">
                  Deploy Location Preset
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Main View ──────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
            <MapPin size={20} />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900 tracking-tight">Checkpoint Dispatch</h1>
            <p className="text-xs text-slate-400 font-medium">{activeNodes.length} route hub{activeNodes.length !== 1 ? 's' : ''} established</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSavedView(true)} className="flex items-center gap-1.5 bg-white border border-slate-200 px-3.5 py-2 rounded-xl font-semibold text-xs text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
              <History size={14} className="text-slate-400" /> Use Saved Location
            </button>
            <button onClick={() => handleOpenEdit(null)} className="flex items-center gap-1.5 bg-blue-600 px-4 py-2 rounded-xl font-semibold text-xs text-white hover:bg-blue-700 transition-all shadow-sm">
              <Plus size={14} /> Create Checkpoint
            </button>
          </div>
        )}
      </header>

      {/* Workspace Area Layout */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* LEFT COMPONENT — Map Interface Container */}
        <div className={`flex-1 h-full transition-all duration-300 ${panelOpen ? 'mr-[400px]' : 'mr-[380px]'}`}>
          <MapContainer center={[6.4435, 100.2165]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />

            {isAdmin && editingType && (
              <MapClickHandler onMapClick={async (pos) => {
                setTempMarker(pos);
                const weather = await fetchWeather(pos[0], pos[1]);
                setFormData(prev => ({ ...prev, address: `${pos[0].toFixed(4)}, ${pos[1].toFixed(4)}`, weather }));
              }} />
            )}

            {/* Active configured marker layers */}
            {activeNodes.map(cp => (
              cp.latitude && cp.longitude ? (
                <Marker key={cp.checkpoint_type} position={[cp.latitude, cp.longitude]} icon={createLabeledIcon(cp.checkpoint_type, cp.is_exit)}>
                  <Popup>
                    <div className="p-1 min-w-[150px]">
                      <p className="font-bold text-slate-900 text-sm mb-0.5">Checkpoint {cp.checkpoint_type}</p>
                      {cp.is_exit && <p className="text-orange-600 text-xs font-bold mb-1 flex items-center gap-1">🚩 Exit Point</p>}
                      <p className="text-slate-500 text-xs leading-normal font-medium">{cp.address}</p>
                      {isAdmin && (
                        <button onClick={() => handleOpenEdit(cp.checkpoint_type, cp)} className="mt-2.5 w-full text-xs font-semibold bg-blue-600 text-white py-1.5 rounded-lg hover:bg-blue-700 transition-all">
                          Edit Properties
                        </button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ) : null
            ))}

            {/* Unsaved dynamic temporary pin placement */}
            {tempMarker && (
              <Marker position={tempMarker} icon={createLabeledIcon(formData.checkpointType || '?', false, true)} eventHandlers={{ add: (e) => e.target.openPopup() }}>
                <Popup>
                  <div className="p-1">
                    <p className="font-bold text-slate-500 text-xs tracking-wider uppercase">Staging Location</p>
                    <p className="text-xs text-slate-400 mt-0.5 font-medium">{formData.weather || "Acquiring metrics..."}</p>
                  </div>
                </Popup>
              </Marker>
            )}

            {tempMarker && <RecenterMap position={tempMarker} />}
          </MapContainer>

          {/* Interactive Legend Badge overlay */}
          <div className="absolute bottom-4 left-4 z-[999] bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-slate-200 px-4 py-2.5 flex items-center gap-4 text-xs font-bold text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> Transit Node
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> Exit Hub
            </span>
            {isAdmin && editingType && (
              <span className="flex items-center gap-1.5 text-slate-400 font-medium border-l pl-4 border-slate-200">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" /> Tap map canvas to re-locate
              </span>
            )}
          </div>
        </div>

        {/* RIGHT COMPONENT — Control Panel */}
        <div className={`absolute right-0 top-0 bottom-0 bg-slate-50 border-l border-slate-200 flex flex-col transition-all duration-300 shadow-xl ${panelOpen ? 'w-[400px]' : 'w-[380px]'}`}
          style={{ zIndex: panelOpen ? 20 : 5 }}>

          {/* Configuration Form Slider Overlay */}
          {panelOpen && editingType && (
            <div className="absolute inset-0 bg-white z-30 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <div>
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Configuration Panel</p>
                  <h2 className="text-base font-black text-slate-900 mt-0.5">Setup Checkpoint {editingType}</h2>
                </div>
                <button onClick={closePanel} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
                {formData.weather && (
                  <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100/70 p-3 rounded-xl shadow-sm">
                    <div className="p-2 bg-white rounded-lg text-blue-500 shadow-xs">
                      <Cloud size={16} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-blue-400">Live Station Telemetry</p>
                      <p className="text-xs font-bold text-blue-900 mt-0.5">{formData.weather}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <label className="text-[10px] font-bold text-slate-400 tracking-wider block mb-1.5 uppercase">Node ID</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white font-black text-slate-900 text-sm transition-all uppercase text-center"
                      placeholder="A"
                      value={formData.checkpointType}
                      onChange={(e) => setFormData({...formData, checkpointType: e.target.value})}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 tracking-wider block mb-1.5 uppercase">Arrival Window Deadline</label>
                    <input
                      type="datetime-local"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white font-semibold text-slate-800 text-xs transition-all"
                      value={formData.endTime}
                      onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider block uppercase">Search & Geo-locate Coordinates</label>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white text-xs font-medium text-slate-800 shadow-inner transition-all placeholder:text-slate-400"
                      placeholder="Type city, facility, landmark or highway mile..."
                      value={searchQuery}
                      onChange={(e) => updateSearch(e.target.value)}
                    />
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                    {isSearching && <Loader2 className="absolute right-3 top-2.5 animate-spin text-blue-500" size={14} />}
                  </div>
                  
                  {searchResults.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 divide-y divide-slate-50 relative">
                      {searchResults.map(r => (
                        <button key={r.place_id} onClick={() => selectLocation(r)} className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex flex-col transition-colors">
                          <span className="text-xs font-bold text-slate-800 truncate w-full">{r.display_name.split(',')[0]}</span>
                          <span className="text-[10px] text-slate-400 font-medium truncate w-full mt-0.5">{r.display_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 font-medium italic">Alternatively, drop a pin by selecting any point directly across the map space.</p>
                </div>

                <button
                  onClick={getCurrentLocation}
                  className="w-full py-2 bg-green-600 text-white rounded-xl font-semibold text-xs"
                >
                  Use Current Location
                </button>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider block mb-1.5 uppercase">Assigned Target Address Name</label>
                  <textarea
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white font-medium text-slate-800 text-xs h-16 resize-none shadow-inner leading-relaxed transition-all"
                    placeholder="Populated automatically via coordinate selection..."
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                  <div>
                    <p className="text-xs font-bold text-slate-800">Archive to Hub Presets</p>
                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">Allows rapid redeployment of this configuration structure</p>
                  </div>
                  <button
                    onClick={() => setShouldSaveToHistory(!shouldSaveToHistory)}
                    className={`w-10 h-5.5 rounded-full transition-colors duration-200 relative shrink-0 outline-none ${shouldSaveToHistory ? 'bg-blue-600' : 'bg-slate-200'}`}
                  >
                    <span className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow-sm transition-all duration-200 ${shouldSaveToHistory ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>

              <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0 flex gap-2">
                <button onClick={closePanel} className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-xs">
                  Discard
                </button>
                <button onClick={handleUpdate} disabled={loading} className="flex-1 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-1.5">
                  {loading ? <Loader2 className="animate-spin" size={12} /> : null}
                  Commit Hub Change
                </button>
              </div>
            </div>
          )}

          {/* Ordered Route Cards Container List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            <div className="flex justify-between items-center px-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Checkpoints</p>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{activeNodes.length} Stations</span>
            </div>

            {activeNodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                <div className="p-4 bg-slate-100 rounded-2xl text-slate-300 mb-3">
                  <MapPin size={28} strokeWidth={1.5} />
                </div>
                <p className="text-xs font-bold text-slate-500">Manifest Empty</p>
                {isAdmin && <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Deploy standard checkpoints to begin tracking</p>}
              </div>
            ) : (
              activeNodes.map((cp, index) => {
                const prevCp = activeNodes[index - 1];
                const distance = prevCp ? getDistance(prevCp.latitude, prevCp.longitude, cp.latitude, cp.longitude) : null;

                return (
                  <div key={cp.checkpoint_type} className="group relative">
                    {index > 0 && (
                      <div className="absolute -top-3.5 left-7 w-0.5 h-3.5 bg-dashed border-l-2 border-dashed border-slate-200 z-0" />
                    )}
                    
                    <div className={`bg-white rounded-2xl border shadow-xs overflow-hidden transition-all relative z-10 ${cp.is_exit ? 'border-orange-200 bg-orange-50/5' : 'border-slate-200/80 hover:border-slate-300'}`}>
                      <div className={`px-4 py-2.5 flex items-center justify-between border-b ${cp.is_exit ? 'bg-orange-50/40 border-orange-100' : 'bg-slate-50/50 border-slate-100'}`}>
                        <div className="flex items-center gap-2.5">
                          <span className={`w-5.5 h-5.5 rounded-lg flex items-center justify-center text-[11px] font-black text-white shadow-xs ${cp.is_exit ? 'bg-orange-500' : 'bg-blue-600'}`}>
                            {cp.checkpoint_type}
                          </span>
                          <span className={`text-xs font-bold ${cp.is_exit ? 'text-orange-700' : 'text-slate-800'}`}>
                            Station Node {cp.checkpoint_type}
                          </span>
                        </div>
                        {isAdmin && (
                          <button onClick={() => handleDeleteCheckpoint(cp.checkpoint_type)} className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>

                      <div className="px-4 py-3 space-y-2">
                        <div className="flex items-start gap-2 text-slate-600">
                          <MapPin size={12} className="text-slate-400 shrink-0 mt-0.5" />
                          <p className="text-xs font-medium leading-normal text-slate-600 line-clamp-2">{cp.address || 'No location signature established'}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-0.5 border-t border-slate-50 mt-1">
                          {cp.end_time ? (
                            <div className="flex items-center gap-1.5 text-slate-500">
                              <Clock size={11} className="text-slate-400 shrink-0" />
                              <p className="text-[10px] font-semibold tracking-tight text-slate-500 truncate">
                                {new Date(cp.end_time).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                              </p>
                            </div>
                          ) : <div />}

                          {cp.weather ? (
                            <div className="flex items-center gap-1.5 text-slate-500 justify-end">
                              <Cloud size={11} className="text-slate-400 shrink-0" />
                              <p className="text-[10px] font-semibold text-slate-500 truncate">{cp.weather.split(',')[0]}</p>
                            </div>
                          ) : <div />}
                        </div>

                        {distance && (
                          <div className="flex items-center gap-1.5 text-blue-600 bg-blue-50/60 rounded-xl px-2.5 py-1 w-full mt-1 border border-blue-100/30">
                            <Navigation size={10} className="rotate-90 shrink-0" />
                            <p className="text-[10px] font-bold tracking-tight">Leg distance from hub {prevCp.checkpoint_type}: <span className="font-black underline">{distance}</span></p>
                          </div>
                        )}
                      </div>

                      {isAdmin && (
                        <div className="px-4 pb-3 pt-1 flex gap-2">
                          <button onClick={() => handleOpenEdit(cp.checkpoint_type, cp)} className="flex-1 py-1.5 text-[10px] font-bold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-1 shadow-xs">
                            Edit <ChevronRight size={10} />
                          </button>
                          <button onClick={() => handleToggleExit(cp)} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border transition-all shadow-xs ${cp.is_exit ? 'border-orange-300 text-orange-600 bg-orange-100/40 hover:bg-orange-100/80' : 'border-slate-200 text-slate-500 bg-white hover:border-orange-200 hover:text-orange-600'}`}>
                            {cp.is_exit ? '🚩 Active Exit Point' : 'Designate Exit'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default LocationManagement;