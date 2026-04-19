import React, { useState, useEffect } from 'react';
import { supabase } from '../client';
import { MapPin, Clock, Edit2, CheckCircle2, Loader2, Lock, X, History, Trash2, BookmarkCheck, Search, Cloud } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Polyline } from "react-leaflet";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import "./style.css";

// Fix Leaflet's default icon issue
let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;


const LocationManagement = ({ userRole }) => {
  const [activeCheckpoints, setActiveCheckpoints] = useState({ A: null, B: null });
  const [isSavedView, setIsSavedView] = useState(false);
  const [savedLocations, setSavedLocations] = useState([]);
  const [editingType, setEditingType] = useState(null);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({ address: '', endTime: '', weather: '' });
  const [shouldSaveToHistory, setShouldSaveToHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [tempMarker, setTempMarker] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchTimer, setSearchTimer] = useState(null);
  const [routeDistance, setRouteDistance] = useState(null);

  const isAdmin = userRole === 'admin';

  useEffect(() => {
    fetchCheckpoints();
    if (isAdmin) fetchSavedLocations();
  }, [isAdmin]);

// Helper component to move map (MUST be outside main component)
const RecenterMap = ({ position }) => {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 15, { animate: true });
    }
  }, [position, map]);
  return null;
};

  // Helper function to get real walking distance
const getWalkingDistance = async (lat1, lon1, lat2, lon2) => {
  try {
    // 1. Precise Validation
    const p1 = { lat: parseFloat(lat1), lon: parseFloat(lon1) };
    const p2 = { lat: parseFloat(lat2), lon: parseFloat(lon2) };

    if (isNaN(p1.lat) || isNaN(p1.lon) || isNaN(p2.lat) || isNaN(p2.lon)) return null;

    // 2. Try 'foot' first, but prepare 'car' as a backup if walking paths are missing in OSM
    const url = `https://router.project-osrm.org/route/v1/foot/${p1.lon},${p1.lat};${p2.lon},${p2.lat}?overview=false`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.warn("OSRM: No specific walking path found. Checkpoint might be off-road.");
      
      // OPTIONAL: Fallback to a simple "As the crow flies" distance if OSRM fails
      // This prevents the UI from just showing nothing
      const directDist = L.latLng(p1.lat, p1.lon).distanceTo(L.latLng(p2.lat, p2.lon));
      return {
        distanceText: directDist > 1000 
          ? `${(directDist / 1000).toFixed(2)} km (est.)` 
          : `${Math.round(directDist)} meters (est.)`
      };
    }

    const distanceInMeters = data.routes[0].distance;
    
    return {
      distanceText: distanceInMeters > 1000 
        ? `${(distanceInMeters / 1000).toFixed(2)} km` 
        : `${Math.round(distanceInMeters)} meters`
    };
  } catch (error) {
    console.error("Route Fetch Error:", error);
    return null;
  }
};

const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click: (e) => {
      onMapClick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
};

useEffect(() => {
  const calculatePath = async () => {
    // Only calculate if BOTH checkpoints have coordinates
    if (activeCheckpoints.A?.latitude && activeCheckpoints.B?.latitude) {
      const result = await getWalkingDistance(
        activeCheckpoints.A.latitude,
        activeCheckpoints.A.longitude,
        activeCheckpoints.B.latitude,
        activeCheckpoints.B.longitude
      );
      
      if (result) {
        setRouteDistance(result);
      }
    } else {
      setRouteDistance(null); // Reset if a checkpoint is missing
    }
  };

  calculatePath();
}, [activeCheckpoints.A, activeCheckpoints.B]); // Re-runs when A or B updates

  const fetchCheckpoints = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const latestA = data.find(loc => loc.checkpoint_type === 'A');
      const latestB = data.find(loc => loc.checkpoint_type === 'B');
      setActiveCheckpoints({ A: latestA, B: latestB });
    }
    setLoading(false);
  };

  const fetchSavedLocations = async () => {
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('is_saved', true)
      .order('created_at', { ascending: false });
    if (data) setSavedLocations(data);
  };

  const handleOpenEdit = (type, current) => {
    setEditingType(type);
    setSearchQuery('');
    setSearchResults([]);
    setTempMarker(null);
    setShouldSaveToHistory(false);
    setFormData({
      address: current?.address || '',
      endTime: current?.end_time ? new Date(current.end_time).toISOString().slice(0, 16) : ''
    });
    // If we already have coordinates, show the marker
    if (current?.latitude && current?.longitude) {
        setTempMarker([current.latitude, current.longitude]);
    }
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery) return;

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&accept-language=en`
      );
      const data = await response.json();

      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        const newPos = [parseFloat(lat), parseFloat(lon)];
        setTempMarker(newPos);
        setFormData(prev => ({ ...prev, address: display_name }));
      } else {
        alert("Location not found");
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Add this helper function inside your component
const updateSearch = (query) => {
  setSearchQuery(query);

  if (searchTimer) clearTimeout(searchTimer);
  
  if (query.length < 3) {
    setSearchResults([]);
    return;
  }

  const newTimer = setTimeout(async () => {
    setIsSearching(true);
    try {
      // 1. Removed the 'headers' object completely to prevent CORS preflight.
      // 2. Added '&email=' to the URL so Nominatim knows who is making the request.
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&email=student@unimap.edu.my`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setSearchResults(data || []);
    } catch (err) {
      console.error("Autocomplete error details:", err);
      setSearchResults([]); 
    } finally {
      setIsSearching(false);
    }
  }, 600); 

  setSearchTimer(newTimer);
};

const fetchWeather = async (lat, lon) => {
  try {
    const API_KEY = '001b4135f8e54c2eaf4135754261304';
    // WeatherAPI uses a single 'q' parameter for lat/lon
    const res = await fetch(
      `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${lat},${lon}`
    );
    const data = await res.json();
    
    if (data.current) {
      const temp = data.current.temp_c;
      const condition = data.current.condition.text;
      return `${temp}°C, ${condition}`;
    }
    return 'Weather N/A';
  } catch (error) {
    console.error("Weather error:", error);
    return 'Error fetching weather';
  }
};

// Function to handle when a user clicks a result from the dropdown
const selectLocation = async(result) => {
  const newPos = [parseFloat(result.lat), parseFloat(result.lon)];
  setTempMarker(newPos);
  const weatherInfo = await fetchWeather(result.lat, result.lon);
  setFormData(prev => ({ ...prev, address: result.display_name, weather: weatherInfo }));
  setSearchQuery(result.display_name); // Put the full name in the box
  setSearchResults([]); // Hide the dropdown
  if (searchTimer) clearTimeout(searchTimer); // Clear any pending search
};

  const handleUpdate = async (type) => {
    if (!tempMarker) {
      alert("Please search and select a location on the map first!");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('locations').insert([{
      address: formData.address,
      checkpoint_type: type,
      end_time: formData.endTime || null,
      is_saved: shouldSaveToHistory,
      latitude: tempMarker[0],
      longitude: tempMarker[1],
      weather: formData.weather
    }]);

    if (error) {
      alert(error.message);
    } else {
      setEditingType(null);
      setTempMarker(null);
      await fetchCheckpoints();
      if (shouldSaveToHistory) fetchSavedLocations();
    }
    setLoading(false);
  };

  const handleUseSaved = (loc) => {
    setFormData({
      address: loc.address,
      endTime: loc.end_time ? new Date(loc.end_time).toISOString().slice(0, 16) : ''
    });
    if (loc.latitude && loc.longitude) {
        setTempMarker([loc.latitude, loc.longitude]);
    }
    setIsSavedView(false);
  };

  const handleDeleteLocation = async (id) => {
    if (!window.confirm("Delete from library?")) return;
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (!error) setSavedLocations(savedLocations.filter(loc => loc.id !== id));
  };

  if (loading && !editingType && !isSavedView) {
    return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-600" /></div>;
  }

  // --- SAVED LOCATIONS VIEW ---
  if (isSavedView) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen">
        <div className="flex justify-between items-center mb-8 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <History className="text-blue-600" /> History Library
          </h2>
          <button onClick={() => setIsSavedView(false)} className="px-6 py-2 bg-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-300">
            Back
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {savedLocations.map((loc) => (
            <div key={loc.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative group">
              <button onClick={() => handleDeleteLocation(loc.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500"><Trash2 size={18}/></button>
              <h3 className="font-bold text-slate-800 mb-4">{loc.address}</h3>
              <button 
                onClick={() => handleUseSaved(loc)}
                className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
              >
                Select This Address
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">System Checkpoints</h1>
            <p className="text-slate-500 font-medium">Real-time location monitoring</p>
          </div>
          {isAdmin && (
            <button onClick={() => setIsSavedView(true)} className="flex items-center gap-2 bg-white border border-slate-200 px-6 py-3 rounded-2xl shadow-sm hover:shadow-md transition-all font-bold text-slate-700">
              <History size={20} className="text-blue-600" /> View History Library
            </button>
          )}
        </header>

        {/* --- INTERACTIVE MAP --- */}
        <div className="mb-10 rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-200 bg-white p-2">
          {!loading && (
            <MapContainer center={[6.4435, 100.2165]} zoom={14} style={{ height: '400px', width: '100%', zIndex: 0 }}>
              <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

              {editingType && (
                <MapClickHandler onMapClick={async (pos) => {setTempMarker(pos);
                 const weatherInfo = await fetchWeather(pos[0], pos[1]);
                setFormData(prev => ({ ...prev, address: `Manual Pin: ${pos[0].toFixed(4)}, ${pos[1].toFixed(4)}`, weather: weatherInfo }));
                }}/>
              )}
              
              {tempMarker && <RecenterMap position={tempMarker} />}
              {tempMarker && (
                <Marker position={tempMarker}>
                  <Popup>Current Selection</Popup>
                </Marker>
              )}

              {/* {activeCheckpoints.A?.latitude && activeCheckpoints.B?.latitude && (
              <Polyline 
                positions={[
                  [activeCheckpoints.A.latitude, activeCheckpoints.A.longitude],
                  [activeCheckpoints.B.latitude, activeCheckpoints.B.longitude]
                ]}
                pathOptions={{ 
                  color: '#2563eb', // Matches your blue-600 theme
                  weight: 4, 
                  dashArray: '10, 10', // Makes it a dashed "pathway" look
                  opacity: 0.6 
                }} 
              />
            )} */}
              
              {activeCheckpoints.A?.latitude && (
                <Marker position={[activeCheckpoints.A.latitude, activeCheckpoints.A.longitude]}>
                  <Popup className="font-bold">Checkpoint A: {activeCheckpoints.A.address}</Popup>
                </Marker>
              )}
              
              {activeCheckpoints.B?.latitude && (
                <Marker position={[activeCheckpoints.B.latitude, activeCheckpoints.B.longitude]}>
                  <Popup className="font-bold">Checkpoint B: {activeCheckpoints.B.address}</Popup>
                </Marker>
              )}
            </MapContainer>
          )}
        </div>

        {/* --- CHECKPOINT CARDS --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {['A', 'B'].map((type) => {
            const data = activeCheckpoints[type];
            const isEditing = editingType === type;

            return (
              <div key={type} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden">
                <div className={`${data ? 'bg-green-600' : 'bg-slate-400'} p-4 text-white flex items-center justify-center gap-2`}>
                  <CheckCircle2 size={18} />
                  <span className="font-black uppercase tracking-[0.2em] text-xs">Checkpoint {type} {data ? 'Active' : 'Offline'}</span>
                </div>

                <div className="p-10 text-center">
                  {isEditing ? (
                    <div className="space-y-6">
                      <div className="text-left">
                        <div className="flex justify-between items-end mb-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Search Location</label>
                          <button onClick={() => setIsSavedView(true)} className="text-[10px] font-bold text-blue-600 uppercase flex items-center gap-1 hover:underline">
                            <History size={12}/> Library
                          </button>
                        </div>
                        
                        <div className="relative mb-4">
                          <div className="relative">
                          <input 
                            className="w-full p-4 pr-12 bg-white border-2 border-blue-100 rounded-2xl focus:border-blue-600 outline-none font-medium text-slate-700 shadow-sm"
                            placeholder="Type location name then click search..."
                            value={searchQuery}
                            onChange={(e) => updateSearch(e.target.value)}
                          />
                          <div className="absolute right-3 top-3 p-2 text-slate-400">
                              {isSearching ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                            </div>
                          </div>

                          {/* --- FLOATING DROPDOWN --- */}
                          {searchResults.length > 0 && (
                            <ul className="absolute z-[1000] w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                              {searchResults.map((result) => (
                                <li key={result.place_id}>
                                  <button
                                    type="button"
                                    onClick={() => selectLocation(result)}
                                    className="w-full text-left px-5 py-3 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-none"
                                  >
                                    <p className="font-bold text-slate-800 text-sm truncate">{result.display_name}</p>
                                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-tighter">
                                      {result.type} • {result.class}
                                    </p>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>


                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Confirm Address</label>
                        <input 
                          className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800"
                          value={formData.address}
                          onChange={(e) => setFormData({...formData, address: e.target.value})}
                          placeholder="Address will auto-fill or type manually..."
                        />
                      </div>

                      <div className="text-left">
                        <label className="text-[10px] font-black uppercase tracking-widest ml-2 text-slate-600">Ending Time</label>
                        <input 
                          type="datetime-local"
                          className="w-full mt-1 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-600"
                          value={formData.endTime}
                          onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                        />
                      </div>

                      {/* Add this inside the isEditing section, perhaps above "Ending Time" */}
                      <div className="text-left">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">
                          Current Weather at Location
                        </label>
                        <div className="w-full p-4 bg-blue-50/30 border-2 border-dashed border-blue-100 rounded-2xl font-bold text-blue-800 flex items-center gap-2">
                          <span className="capitalize">{formData.weather || "Select a location to see weather..."}</span>
                        </div>
                      </div>

                      {/* --- SAVE TO LIBRARY TOGGLE --- */}
                      <div className="flex items-center justify-between p-4 bg-blue-50/50 rounded-2xl border border-blue-100 shadow-sm">
                        <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                          <BookmarkCheck 
                            size={18} 
                            className={shouldSaveToHistory ? "text-blue-600" : "text-slate-300"} 
                          />
                          <span>Save this to History Library?</span>
                        </div>
                        
                        <button 
                          type="button"
                          onClick={() => setShouldSaveToHistory(!shouldSaveToHistory)}
                          className={`w-12 h-6 rounded-full transition-all relative duration-300 ${
                            shouldSaveToHistory ? 'bg-blue-600' : 'bg-slate-300'
                          }`}
                        >
                          <div className={`absolute top-1 bg-white w-4 h-4 rounded-full shadow-sm transition-all duration-300 ${
                            shouldSaveToHistory ? 'left-7' : 'left-1'
                          }`} />
                        </button>
                      </div>

                      <div className="flex gap-3">
                        <button onClick={() => handleUpdate(type)} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 shadow-lg">ACTIVATE</button>
                        <button onClick={() => {setEditingType(null); setTempMarker(null);}} className="p-4 bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-200"><X size={24} /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="inline-flex p-5 bg-blue-50 rounded-[2rem] text-blue-600 mb-2"><MapPin size={48} /></div>
                      <div>
                        <h2 className="text-4xl font-black text-slate-800 tracking-tighter mb-1 truncate px-2">{data?.address || "EMPTY"}</h2>
                        <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Checkpoint {type}</p>
                      </div>
                      {isAdmin ? (
                        <button onClick={() => handleOpenEdit(type, data)} className="w-full mt-6 flex items-center justify-center gap-3 py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 transition-all">
                          <Edit2 size={18} /> {data ? 'Update Location' : 'Initialize Checkpoint'}
                        </button>
                      ) : (
                        <div className="mt-8 flex items-center justify-center gap-2 text-slate-300">
                          <Lock size={14} /><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Locked</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* --- ROUTE DISTANCE BANNER --- */}
          {routeDistance && (
            <div className="col-span-full mb-10 p-6 bg-blue-600 rounded-[2rem] text-white flex flex-col md:flex-row items-center justify-between shadow-lg">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-xl">
                  <MapPin size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-blue-200 uppercase tracking-widest">Walking Path Distance</h3>
                  <p className="text-2xl font-black">Checkpoint A → Checkpoint B</p>
                </div>
              </div>
              <div className="mt-4 md:mt-0 text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Total Distance</p>
                <p className="text-4xl font-black tracking-tighter">{routeDistance.distanceText}</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default LocationManagement;