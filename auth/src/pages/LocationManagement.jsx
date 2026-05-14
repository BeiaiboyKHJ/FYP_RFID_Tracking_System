import React, { useState, useEffect } from 'react';
import { supabase } from '../client';
import { MapPin, X, History, Trash2, Flag, Search, Cloud, Plus, Loader2, Navigation, Clock} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for Leaflet default icons
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// --- Helper: Haversine Distance Calculation ---
const getDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; 
  return d > 1 ? `${d.toFixed(2)} km` : `${(d * 1000).toFixed(0)} m`;
};

const RecenterMap = ({ position }) => {
  const map = useMap();
  useEffect(() => {
      // Strict check: only fly if position is an array with 2 valid numbers
      if (Array.isArray(position) && typeof position[0] === 'number' && typeof position[1] === 'number') {
        map.flyTo(position, 15, { animate: true });
      }
  }, [position, map]);
  return null;
};

const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({ click: (e) => onMapClick([e.latlng.lat, e.latlng.lng]) });
  return null;
};

const LocationManagement = ({ userRole }) => {
  const [activeNodes, setActiveNodes] = useState([]);
  const [isSavedView, setIsSavedView] = useState(false);
  const [savedLocations, setSavedLocations] = useState([]);
  const [editingType, setEditingType] = useState(null); 
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({ address: '', weather: '', checkpointType: '', endTime: '' });
  const [shouldSaveToHistory, setShouldSaveToHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [tempMarker, setTempMarker] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchTimer, setSearchTimer] = useState(null);
  const [currentAdminId, setCurrentAdminId] = useState(null);

  const isAdmin = userRole === 'admin';

  useEffect(() => {
    // Get current logged in user ID for foreign key constraint
    const getSession = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setCurrentAdminId(user.id);
    };
    getSession();
    fetchActiveNodes();
    fetchSavedLibrary();
  }, []);

  const getNextLabel = () => {
    if (activeNodes.length === 0) return 'A';
    const labels = activeNodes.map(n => n.checkpoint_type.toUpperCase()).sort();
    const lastLabel = labels[labels.length - 1];
    return String.fromCharCode(lastLabel.charCodeAt(0) + 1);
  };

  const fetchActiveNodes = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('locations').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      const uniqueTypes = {};
      const filtered = data.reduce((acc, current) => {
        if (!uniqueTypes[current.checkpoint_type]) {
          uniqueTypes[current.checkpoint_type] = true;
          acc.push(current);
        }
        return acc;
      }, []);
      setActiveNodes(filtered.sort((a, b) => a.checkpoint_type.localeCompare(b.checkpoint_type)));
    }
    setLoading(false);
  };

  const fetchSavedLibrary = async () => {
    const { data } = await supabase.from('locations').select('*').eq('is_saved', true).order('created_at', { ascending: false });
    if (data) setSavedLocations(data);
  };

  const handleUpdate = async () => {
    if (!isAdmin) {
      alert("Unauthorized: Only admins can manage checkpoints.");
      return;
    }
    if (!tempMarker || !formData.checkpointType) { 
        alert("Please select a location and assign a label."); 
        return; 
    }
    setLoading(true);
    const { error } = await supabase.from('locations').insert([{
      user_id: currentAdminId,
      address: formData.address,
      checkpoint_type: formData.checkpointType.toUpperCase(),
      is_saved: shouldSaveToHistory,
      latitude: tempMarker[0],
      longitude: tempMarker[1],
      weather: formData.weather,
      end_time: formData.endTime ? new Date(formData.endTime).toISOString() : null,
      is_exit: false
    }]);

    if (!error) {
      setEditingType(null);
      setTempMarker(null);
      setFormData({ address: '', weather: '', checkpointType: '', endTime: '' });
      fetchActiveNodes();
      fetchSavedLibrary();
    } else { alert(error.message); }
    setLoading(false);
  };

const handleToggleExit = async (loc) => {
  if (!isAdmin) return;
  
  const newStatus = !loc.is_exit;

  try {
    // 1. If setting as exit, reset all other rows
    if (newStatus) {
      const { error: resetError } = await supabase
        .from('locations')
        .update({ is_exit: false })
        .not('id', 'is', null); // Use 'is not null' instead of 'neq 0'

      if (resetError) throw resetError;
    }

    // 2. Update the specific checkpoint
    const { error: updateError } = await supabase
      .from('locations')
      .update({ is_exit: newStatus })
      .eq('id', loc.id);

    if (updateError) throw updateError;

    fetchActiveNodes();
  } catch (err) {
    console.error("Exit Toggle Error:", err.message);
    alert("Failed to update exit status: " + err.message);
  }
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

  if (current && typeof current.latitude === 'number' && typeof current.longitude === 'number') {
    setTempMarker([current.latitude, current.longitude]);
  } else {
    setTempMarker(null);
  }
};

  const handleDeleteCheckpoint = async (targetLabel) => {
    if (!isAdmin) return;
    if (!window.confirm(`Delete Checkpoint ${targetLabel}? Following nodes will be renamed.`)) return;
    setLoading(true);
    try {
      await supabase.from('locations').delete().eq('checkpoint_type', targetLabel);
      const subsequentNodes = activeNodes.filter(node => node.checkpoint_type > targetLabel);
      for (const node of subsequentNodes) {
        const newLetter = String.fromCharCode(node.checkpoint_type.charCodeAt(0) - 1);
        await supabase.from('locations').update({ checkpoint_type: newLetter }).eq('checkpoint_type', node.checkpoint_type);
      }
      fetchActiveNodes();
    } catch (e) { alert(e.message); }
    setLoading(false);
  };

  const updateSearch = (query) => {
    setSearchQuery(query);
    if (searchTimer) clearTimeout(searchTimer);
    if (query.length < 3) { setSearchResults([]); return; }
    const newTimer = setTimeout(async () => {
      setIsSearching(true);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
      const data = await res.json();
      setSearchResults(data || []);
      setIsSearching(false);
    }, 600);
    setSearchTimer(newTimer);
  };

  const fetchWeather = async (lat, lon) => {
    try {
      const API_KEY = '001b4135f8e54c2eaf4135754261304';
      const res = await fetch(`https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${lat},${lon}`);
      const data = await res.json();
      return data.current ? `${data.current.temp_c}°C, ${data.current.condition.text}` : 'N/A';
    } catch (error) {
      console.error("Weather Error:", error);
      return 'N/A';
    }
  };

  const selectLocation = async (result) => {
    const pos = [parseFloat(result.lat), parseFloat(result.lon)];
    setTempMarker(pos);
    const weatherInfo = await fetchWeather(result.lat, result.lon);
    setFormData(prev => ({ 
      ...prev, 
      address: result.display_name, 
      weather: weatherInfo 
    }));
    setSearchResults([]);
  };

  if (isSavedView) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <header className="flex justify-between items-center mb-10">
            <div>
              <h1 className="text-2xl font-black text-slate-900 uppercase flex items-center gap-2">
                <History className="text-blue-600"/> History Library
              </h1>
              <p className="text-slate-500 text-sm">Select a saved location to reuse</p>
            </div>
            <button onClick={() => setIsSavedView(false)} className="px-6 py-2 text-black bg-white border rounded-xl font-bold shadow-sm hover:bg-slate-50 transition-all">Back to Map</button>
          </header>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {savedLocations.length === 0 ? (
                <div className="col-span-2 p-20 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-200 text-slate-400 font-bold">
                    No locations saved in library yet.
                </div>
            ) : (
                savedLocations.map(loc => (
                    <div key={loc.id} className="bg-white p-6 rounded-3xl border shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-3 text-blue-600 font-bold text-xs uppercase tracking-widest">
                                <Cloud size={14}/> {loc.weather}
                            </div>
                            <p className="text-sm font-bold text-slate-800 mb-6">{loc.address}</p>
                        </div>
                        <button 
                            onClick={() => {
                                setFormData({ ...formData, address: loc.address, weather: loc.weather });
                                setTempMarker([loc.latitude, loc.longitude]);
                                setIsSavedView(false);
                                setEditingType(getNextLabel());
                            }}
                            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase hover:bg-blue-700 transition-all"
                        >
                            Select this location
                        </button>
                    </div>
                ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 uppercase">Checkpoint Update</h1>
          </div>
          <div className="flex gap-3">
            {isAdmin && (
              <>
                <button onClick={() => handleOpenEdit(null)} className="flex items-center gap-2 bg-blue-600 px-6 py-3 rounded-2xl shadow-lg font-bold text-white">
                  <Plus size={20} /> Add Checkpoint
                </button>
                <button onClick={() => setIsSavedView(true)} className="flex items-center gap-2 bg-white border px-6 py-3 rounded-2xl font-bold text-slate-700">
                  <History size={20} className="text-blue-600" /> Library
                </button>
              </>
            )}
          </div>
        </header>

        <div className="mb-12 rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-white bg-white">
          <MapContainer center={[6.4435, 100.2165]} zoom={14} style={{ height: '400px', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            
            {isAdmin && editingType && (
              <MapClickHandler onMapClick={async (pos) => {
                setTempMarker(pos);
                const weatherInfo = await fetchWeather(pos[0], pos[1]);
                setFormData(prev => ({ 
                  ...prev, 
                  address: `Coord: ${pos[0].toFixed(4)}, ${pos[1].toFixed(4)}`,
                  weather: weatherInfo 
                }));
              }}/>
            )}

            {tempMarker && (
              <Marker position={tempMarker} eventHandlers={{ add: (e) => e.target.openPopup() }}>
                <Popup autoOpen>
                  <div className="text-center p-1">
                    <p className="font-black text-blue-600 text-[10px] uppercase">New Point</p>
                    <p className="text-[9px] font-bold text-slate-600">{formData.weather || "Fetching weather..."}</p>
                  </div>
                </Popup>
              </Marker>
            )}

            {activeNodes.map(cp => (
              // FIX: Safety check to prevent .lat reading null error
              cp.latitude && cp.longitude ? (
                <Marker key={cp.id} position={[cp.latitude, cp.longitude]}>
                  <Popup><b>{cp.checkpoint_type}</b></Popup>
                </Marker>
              ) : null
            ))}
            
            {tempMarker && <RecenterMap position={tempMarker} />}
          </MapContainer>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {activeNodes.map((cp, index) => {
            const prevCp = activeNodes[index - 1];
            const distance = prevCp ? getDistance(prevCp.latitude, prevCp.longitude, cp.latitude, cp.longitude) : null;

            return (
              <div key={cp.id} className="flex flex-col h-full group">
                <div className={`bg-white rounded-[2.5rem] border-2 shadow-xl overflow-hidden relative flex-1 ${cp.is_exit ? 'border-orange-500' : 'border-slate-100'}`}>
                  <div className={`${cp.is_exit ? 'bg-orange-500' : 'bg-green-600'} p-3 text-white flex justify-between items-center px-6`}>
                    <span className="font-black text-[10px] uppercase tracking-widest">Checkpoint {cp.checkpoint_type}</span>
                    {isAdmin && (
                      <button onClick={() => handleDeleteCheckpoint(cp.checkpoint_type)} className="hover:text-red-200 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  
                  <div className="p-8 text-center space-y-4">
                    <MapPin size={40} className={cp.is_exit ? "text-orange-500 mx-auto" : "text-blue-600 mx-auto"} />
                    <h2 className="text-md font-black truncate px-2 text-slate-800 leading-tight h-10">{cp.address}</h2>
                    <span className="text-sm font-bold text-indigo-600 block">
                    {cp.end_time ? `Deadline: ${new Date(cp.end_time).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
                    })}` : "No deadline"}
                    </span>

                    {cp.weather && (
                      <div className="flex items-center justify-center gap-2 text-stone-800 font-bold text-[10px] uppercase tracking-tighter">
                        <Cloud size={12} className="text-blue-400" />
                        {cp.weather}
                      </div>
                    )}
                    
                    {isAdmin && (
                      <div className="flex gap-2">
                        <button onClick={() => handleOpenEdit(cp.checkpoint_type, cp)} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors">Edit</button>
                        <button onClick={() => handleToggleExit(cp)} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase border-2 transition-all ${cp.is_exit ? 'border-orange-500 text-orange-500 bg-orange-50' : 'border-slate-200 text-slate-400'}`}>
                          {cp.is_exit ? "Exit" : "Set Exit"}
                        </button>
                      </div>
                    )}
                  </div>

                  {distance && (
                    <div className="bg-blue-50/50 border-t border-blue-100 p-4 flex items-center justify-center gap-3">
                      <Navigation size={12} className="text-blue-500 rotate-90" />
                      <span className="text-[10px] font-black text-blue-700 tracking-tighter uppercase">
                        Distance from {prevCp.checkpoint_type}: <span className="text-blue-900 ml-1">{distance}</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isAdmin && editingType && (
            <div className="bg-blue-600 rounded-[2.5rem] shadow-2xl p-8 text-white min-h-[350px]">
              <h2 className="text-xs font-black uppercase mb-6 flex justify-between">
                Checkpoint {editingType} <button onClick={() => { setEditingType(null); setTempMarker(null); }}><X/></button>
              </h2>
              <div className="space-y-4">
                {formData.weather && (
                  <div className="flex items-center gap-3 bg-blue-700/50 p-4 rounded-2xl border border-white/10">
                    <Cloud className="text-blue-200" size={20} />
                    <div>
                      <p className="text-[10px] font-black uppercase opacity-60 leading-none">Current Weather</p>
                      <p className="text-sm font-bold">{formData.weather}</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <input 
                    className="w-1/3 p-4 bg-white rounded-2xl outline-none font-bold text-slate-900 text-xs" 
                    placeholder="Label" 
                    value={formData.checkpointType} 
                    onChange={(e) => setFormData({...formData, checkpointType: e.target.value})} 
                  />
                  <div className="w-2/3 relative">
                    <input 
                      type="datetime-local"
                      className="w-full p-4 bg-white rounded-2xl outline-none font-bold text-slate-900 text-[10px]" 
                      value={formData.endTime} 
                      onChange={(e) => setFormData({...formData, endTime: e.target.value})} 
                    />
                    <Clock size={14} className="absolute right-4 top-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <textarea 
                  className="w-full p-4 bg-white rounded-2xl outline-none font-bold text-slate-900 text-xs h-16 resize-none" 
                  placeholder="Location name..." 
                  value={formData.address} 
                  onChange={(e) => setFormData({...formData, address: e.target.value})} 
                />
                
                <div className="relative">
                  <input className="w-full p-3 bg-blue-700/50 border border-blue-400/30 rounded-xl outline-none font-bold text-white text-[10px]" placeholder="Search..." value={searchQuery} onChange={(e) => updateSearch(e.target.value)} />
                  {isSearching && <Loader2 className="absolute right-4 top-3 animate-spin text-white/50" size={14}/>}
                  {searchResults.length > 0 && (
                    <ul className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-2xl max-h-32 overflow-y-auto text-slate-900 border">
                      {searchResults.map(r => (
                        <li key={r.place_id} onClick={() => selectLocation(r)} className="p-3 hover:bg-blue-50 cursor-pointer text-[9px] font-bold border-b">{r.display_name}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 bg-blue-700/30 rounded-xl border border-white/10">
                    <span className="text-[10px] font-bold opacity-70 uppercase tracking-widest">Add to Library?</span>
                    <button onClick={() => setShouldSaveToHistory(!shouldSaveToHistory)} className={`px-4 py-1 rounded-full text-[9px] font-black uppercase transition-all ${shouldSaveToHistory ? 'bg-white text-blue-600' : 'bg-blue-800 text-blue-400'}`}>
                        {shouldSaveToHistory ? 'YES' : 'NO'}
                    </button>
                </div>

                <button onClick={handleUpdate} className="w-full py-4 bg-white text-blue-600 rounded-2xl font-black shadow-xl text-xs uppercase hover:bg-slate-100 transition-all">Confirm</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LocationManagement;