import React, { useState, useEffect } from 'react';
import { Plus, MapPin, Pencil, Trash2, Search, Loader2, Zap, Image as ImageIcon, Camera, Upload, Map, Clock } from 'lucide-react';
import { supabase } from '../client';

// --- Serper Fetching Function ---
const fetchSerperImage = async (locationName) => {
  const SERPER_API_KEY = '74d745945e3092ce705e75ff05d7d4056125c70a'; 
  try {
    const response = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: locationName, gl: "my", num: 1 }),
    });
    const data = await response.json();
    return data.images?.[0]?.imageUrl || null;
  } catch (error) {
    console.error("Serper Error:", error);
    return null;
  }
};

// --- Map Preview Component ---
const MapPreview = ({ lat, lon, title }) => {
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${
    (parseFloat(lon) - 0.005).toFixed(6)
  }%2C${
    (parseFloat(lat) - 0.005).toFixed(6)
  }%2C${
    (parseFloat(lon) + 0.005).toFixed(6)
  }%2C${
    (parseFloat(lat) + 0.005).toFixed(6)
  }&layer=mapnik&marker=${lat}%2C${lon}`;

  return (
    <div className="absolute bottom-full left-0 mb-3 z-50 w-72 rounded-xl overflow-hidden shadow-2xl border border-slate-200 bg-white ring-1 ring-black/5">
      <div className="w-full h-40 relative">
        <iframe
          src={mapUrl}
          title={`Map of ${title}`}
          width="100%"
          height="100%"
          style={{ border: 'none', display: 'block' }}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
      </div>
      <div className="px-4 py-3 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-700 min-w-0 flex-1">
          <MapPin size={14} className="text-rose-500 shrink-0" />
          <span className="text-xs font-semibold truncate">{title}</span>
        </div>
        <a
          href={`https://www.google.com/maps?q=${lat},${lon}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-bold text-blue-600 hover:text-blue-700 shrink-0 ml-3 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-md transition-colors"
          onClick={e => e.stopPropagation()}
        >
          Maps <Zap size={10} />
        </a>
      </div>
    </div>
  );
};

export default function SchedulePage({ role }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSchedule = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('schedule').select('*').order('time', { ascending: true });
    if (!error) setActivities(data);
    setLoading(false);
  };

  useEffect(() => { fetchSchedule(); }, []);

  const addNewActivity = () => {
    if (role !== 'admin') return;
    const newEntry = { 
      id: Date.now(), time: "09:00:00", title: "", 
      places: "", description: "", lat: null, lon: null, 
      custom_image_url: null, isNew: true 
    };
    setActivities([...activities, newEntry]);
  };

  const deleteActivity = async (id) => {
    if (role !== 'admin') return;
    if (window.confirm("Are you sure you want to delete this activity?")) {
      const { error } = await supabase.from('schedule').delete().eq('id', id);
      if (!error) fetchSchedule();
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 font-medium gap-3">
      <Loader2 className="animate-spin" size={24} /> Loading Schedule...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-10 font-sans text-slate-900">
      <div className="max-w-5xl mx-auto">
        <Header role={role} onAdd={addNewActivity} />
        
        {activities.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-sm mt-8">
            <Clock size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">No activities scheduled yet.</p>
          </div>
        ) : (
          <div className="mt-12 relative">
            {/* Main Timeline Track */}
            <div className="absolute left-[27px] md:left-[111px] top-4 bottom-4 w-0.5 bg-slate-200 rounded-full" />
            
            <div className="space-y-8">
              {activities.map((item) => (
                <div key={item.id} className="relative flex flex-col md:flex-row items-start gap-4 md:gap-8 group">
                  
                  {/* Timeline Dot & Time (Desktop) */}
                  <div className="flex items-center gap-4 md:w-24 shrink-0 pt-5 z-10 pl-2 md:pl-0">
                    <div className="hidden md:block flex-1 text-right">
                      <span className="text-lg font-black text-slate-800 tracking-tight">
                        {item.time?.slice(0, 5) || "00:00"}
                      </span>
                    </div>
                    <div className="w-4 h-4 rounded-full bg-blue-500 border-4 border-[#f8fafc] shadow-sm shrink-0 transition-transform group-hover:scale-125" />
                    {/* Mobile Time */}
                    <span className="md:hidden text-lg font-black text-slate-800 tracking-tight">
                      {item.time?.slice(0, 5) || "00:00"}
                    </span>
                  </div>

                  {/* Activity Card */}
                  <div className="flex-1 w-full pl-10 md:pl-0">
                    <ActivityCard 
                      activity={item} 
                      role={role} 
                      onDelete={deleteActivity} 
                      onSaveSuccess={fetchSchedule} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Header({ role, onAdd }) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-slate-200 pb-8">
      <div>
        <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="text-4xl font-black tracking-tight text-slate-900">Trip Schedule</h1>
      </div>
      
      {role === 'admin' && (
        <button 
          onClick={onAdd} 
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-sm hover:shadow active:scale-95"
        >
          <Plus size={18} strokeWidth={3} /> Add Activity
        </button>
      )}
    </div>
  );
}

function ActivityCard({ activity, role, onDelete, onSaveSuccess }) {
  const [isEditing, setIsEditing]       = useState(false);
  const [formData, setFormData]         = useState(activity);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]       = useState(false);
  const [serperUrl, setSerperUrl]       = useState(null);
  const [uploading, setUploading]       = useState(false);
  const [showMap, setShowMap]           = useState(false);

  const displayImage = formData.custom_image_url || serperUrl;
  const hasCoords    = formData.lat && formData.lon;

  useEffect(() => {
    let isMounted = true;
    const loadSerper = async () => {
      if (!formData.custom_image_url && formData.places?.length > 2) {
        const url = await fetchSerperImage(formData.places);
        if (isMounted) setSerperUrl(url);
      }
    };
    loadSerper();
    return () => { isMounted = false; };
  }, [formData.places, formData.custom_image_url]);

  useEffect(() => { 
    setIsEditing(activity.isNew && role === 'admin');
  }, [activity.isNew, role]);

  useEffect(() => { setFormData(activity); }, [activity]);

  useEffect(() => {
    if (!isEditing || formData.places === activity.places || formData.places.length <= 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(formData.places)}&accept-language=en&addressdetails=1`)
        .then(r => r.json())
        .then(d => { setSearchResults(Array.isArray(d) ? d : []); setSearching(false); })
        .catch(() => setSearching(false));
    }, 600);
    return () => clearTimeout(timer);
  }, [formData.places, isEditing]);

  const handleChange   = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const selectLocation = (item) => {
    const addr = item.address || {};
    const parts = [
      addr.amenity || addr.building || addr.shop,
      addr.road || addr.pedestrian,
      addr.suburb || addr.neighbourhood,
      addr.city || addr.town || addr.village,
      addr.state,
      addr.country,
    ].filter(Boolean);

    setFormData({ 
      ...formData, 
      places: parts.length > 0 ? parts.join(', ') : item.display_name,
      lat: item.lat, 
      lon: item.lon 
    });
    setSearchResults([]);
  };

  const handleImageUpload = async (e) => {
    if (role !== 'admin') return;
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const filePath = `${Math.random()}.${file.name.split('.').pop()}`;
    try {
      const { error } = await supabase.storage.from('rfidsystem-activity-images').upload(filePath, file);
      if (error) throw error;
      const { data } = supabase.storage.from('rfidsystem-activity-images').getPublicUrl(filePath);
      setFormData(prev => ({ ...prev, custom_image_url: data.publicUrl }));
    } catch (error) {
      alert("Upload failed: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (role !== 'admin') return;
    let finalTime = formData.time || "00:00:00";
    if (finalTime.length === 5) finalTime += ":00";
    
    const payload = { 
      time: finalTime, 
      title: formData.title || "Untitled Activity",
      places: formData.places || "", 
      description: formData.description || "",
      lat: formData.lat || null, 
      lon: formData.lon || null,
      custom_image_url: formData.custom_image_url || null
    };

    const { error } = activity.isNew 
      ? await supabase.from('schedule').insert([payload]) 
      : await supabase.from('schedule').update(payload).eq('id', activity.id);
      
    if (error) alert(error.message);
    else { setIsEditing(false); onSaveSuccess(); }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col md:flex-row">
      
      {/* Side Image Section (Shared across View/Edit) */}
      <div className="w-full md:w-56 h-48 md:h-auto bg-slate-100 relative shrink-0 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col">
        {displayImage ? (
          <img src={displayImage} alt="Location" className="w-full h-full object-cover absolute inset-0" />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-4">
            <ImageIcon size={32} strokeWidth={1.5} />
            <span className="text-[10px] font-bold uppercase tracking-wider mt-2 text-center">No Image</span>
          </div>
        )}

        {/* Edit Mode Overlay for Image Upload */}
        {isEditing && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 opacity-0 hover:opacity-100 transition-opacity focus-within:opacity-100">
            <label className="cursor-pointer bg-white/90 text-slate-900 px-4 py-2 rounded-lg text-xs font-bold hover:bg-white flex items-center gap-2 shadow-xl transition-all hover:scale-105">
              {uploading ? <Loader2 className="animate-spin" size={14}/> : <Camera size={14}/>}
              {displayImage ? "Change" : "Upload"}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
            </label>
            {formData.custom_image_url && (
              <button 
                onClick={() => setFormData({...formData, custom_image_url: null})} 
                className="absolute top-3 right-3 bg-white/90 text-red-500 p-2 rounded-full hover:bg-red-50 hover:text-red-600 transition-all shadow-sm"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="p-5 md:p-6 flex-1 flex flex-col min-w-0">
        {isEditing && role === 'admin' ? (
          /* EDIT MODE FORM */
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Title</label>
                <input name="title" placeholder="e.g. Breakfast at Hotel" value={formData.title} onChange={handleChange} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Time</label>
                <input name="time" type="time" value={formData.time?.slice(0, 5) || "09:00"} onChange={handleChange} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold" />
              </div>
            </div>

            <div className="relative">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Location</label>
              <div className="relative">
                <input value={formData.places} onChange={(e) => setFormData({...formData, places: e.target.value})} placeholder="Search destination..." className="w-full py-2 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm" />
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                {searching && <Loader2 className="absolute right-3 top-2.5 animate-spin text-slate-400" size={16} />}
              </div>
              {searchResults.length > 0 && (
                <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto text-sm divide-y divide-slate-100">
                  {searchResults.map((item, idx) => (
                    <div key={idx} onClick={() => selectLocation(item)} className="p-3 cursor-pointer hover:bg-blue-50 transition-colors">
                      {item.display_name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Notes</label>
              <textarea name="description" placeholder="Add helpful context or reminders..." value={formData.description} onChange={handleChange} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl h-20 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none text-sm" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setIsEditing(false)} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
              <button onClick={handleSave} className="px-5 py-2.5 text-sm font-bold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-sm">Save Changes</button>
            </div>
          </div>
        ) : (
          /* VIEW MODE */
          <div className="flex flex-col h-full justify-between">
            <div>
              <div className="flex justify-between items-start gap-4">
                <h3 className="text-xl font-black text-slate-800 leading-tight">{formData.title}</h3>
                
                {role === 'admin' && (
                  <div className="flex gap-1 shrink-0 bg-slate-50 p-1 rounded-lg border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setIsEditing(true)} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => onDelete(activity.id)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {formData.places && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-slate-500 relative">
                  <MapPin size={14} className="shrink-0 text-slate-400" />
                  <span className="text-sm font-medium">{formData.places}</span>
                  
                  {hasCoords && (
                    <div className="relative">
                      <button 
                        onMouseEnter={() => setShowMap(true)} 
                        onMouseLeave={() => setShowMap(false)}
                        onFocus={() => setShowMap(true)}
                        onBlur={() => setShowMap(false)}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                      >
                        <Map size={14} />
                      </button>
                      {showMap && <MapPreview lat={formData.lat} lon={formData.lon} title={formData.places} />}
                    </div>
                  )}
                </div>
              )}

              {formData.description && (
                <p className="text-slate-600 text-sm mt-4 bg-slate-50/50 p-3 border border-slate-100 rounded-xl leading-relaxed">
                  {formData.description}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}