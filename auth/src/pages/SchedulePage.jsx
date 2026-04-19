import React, { useState, useEffect } from 'react';
import { Plus, MapPin, Pencil, Trash2, Search, Loader2, Zap, Image as ImageIcon, Camera, Upload } from 'lucide-react';
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
    return data.images[0]?.imageUrl || null;
  } catch (error) {
    console.error("Serper Error:", error);
    return null;
  }
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
    const newEntry = { id: Date.now(), time: "09:00:00", title: "New Activity", places: "", description: "", lat: null, lon: null, custom_image_url: null, isNew: true };
    setActivities([...activities, newEntry]);
  };

  const deleteActivity = async (id) => {
    if (window.confirm("Are you sure?")) {
      const { error } = await supabase.from('schedule').delete().eq('id', id);
      if (!error) fetchSchedule();
    }
  };

  if (loading) return <div className="p-8 text-center font-bold text-slate-400">Loading Schedule...</div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] p-8 font-sans text-slate-900">
      <Header />
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-bold">Schedule Management</h2>
          {role === 'admin' && (
            <button onClick={addNewActivity} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-slate-800 transition-all shadow-sm">
              <Plus size={18} /> Add Activity
            </button>
          )}
        </div>
        <div className="space-y-6">
          {activities.map((item) => (
            <ActivityCard key={item.id} activity={item} role={role} onDelete={deleteActivity} onSaveSuccess={fetchSchedule} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="max-w-4xl mx-auto flex justify-between items-center mb-10">
      <h1 className="text-3xl font-black tracking-tight">Trip Schedule</h1>
      <div className="text-right">
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Today Date</p>
        <p className="font-bold">{new Date().toLocaleDateString()}</p>
      </div>
    </div>
  );
}

function ActivityCard({ activity, role, onDelete, onSaveSuccess }) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(activity);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [serperUrl, setSerperUrl] = useState(null);
  const [uploading, setUploading] = useState(false);

  const displayImage = formData.custom_image_url || serperUrl;

  useEffect(() => {
    const loadSerper = async () => {
      if (!formData.custom_image_url && formData.places?.length > 2) {
        const url = await fetchSerperImage(formData.places);
        setSerperUrl(url);
      }
    };
    loadSerper();
  }, [formData.places, formData.custom_image_url]);

  useEffect(() => { if (activity.isNew && role === 'admin') setIsEditing(true); }, [activity.isNew, role]);

  useEffect(() => {
    setFormData(activity);
  }, [activity]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage.from('rfidsystem-activity-images').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('rfidsystem-activity-images').getPublicUrl(filePath);
      setFormData(prev => ({ ...prev, custom_image_url: data.publicUrl }));
    } catch (error) {
      alert("Upload failed: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const selectLocation = (item) => {
    setFormData({ ...formData, places: item.display_name, lat: item.lat, lon: item.lon });
    setSearchResults([]);
  };

  const handleSave = async () => {
    const payload = { 
        time: formData.time, 
        title: formData.title, 
        places: formData.places, 
        description: formData.description, 
        lat: formData.lat, 
        lon: formData.lon,
        custom_image_url: formData.custom_image_url 
    };

    const { error } = activity.isNew 
      ? await supabase.from('schedule').insert([payload]) 
      : await supabase.from('schedule').update(payload).eq('id', activity.id);

    if (error) alert(error.message);
    else { setIsEditing(false); onSaveSuccess(); }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm overflow-hidden transition-all">
      {/* Top Image Section */}
      {!isEditing && (
        <div className="mb-6 -mx-6 -mt-6 h-52 bg-slate-100 relative group">
          {displayImage ? (
            <img src={displayImage} alt="Activity" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-300">
              <ImageIcon size={32} strokeWidth={1} />
              <span className="text-xs font-medium mt-2">Searching location image...</span>
            </div>
          )}
        </div>
      )}

      {isEditing ? (
        <div className="space-y-4">
          {/* Image Upload UI */}
          <div className="p-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center">
            {formData.custom_image_url ? (
                <div className="relative w-32 h-20 mb-2">
                    <img src={formData.custom_image_url} className="w-full h-full object-cover rounded-lg" />
                    <button onClick={() => setFormData({...formData, custom_image_url: null})} className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-md"><Trash2 size={12}/></button>
                </div>
            ) : <Camera className="text-slate-400 mb-2" size={24} />}
            
            <label className="cursor-pointer bg-white px-4 py-2 rounded-lg border shadow-sm text-sm font-bold hover:bg-slate-50 flex items-center gap-2">
              {uploading ? <Loader2 className="animate-spin" size={16}/> : <Upload size={16}/>}
              {formData.custom_image_url ? "Change Custom Image" : "Upload Custom Image"}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
            </label>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-2 gap-4">
            <input name="time" type="time" value={formData.time?.slice(0, 5)} onChange={handleChange} className="p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
            <input name="title" placeholder="Activity Title" value={formData.title} onChange={handleChange} className="p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="relative">
            <input value={formData.places} onChange={(e) => {
                setFormData({...formData, places: e.target.value});
                if (e.target.value.length > 2) {
                  setSearching(true);
                  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${e.target.value}`)
                    .then(r => r.json()).then(d => { setSearchResults(d); setSearching(false); });
                }
            }} placeholder="Search Location..." className="w-full p-2 pl-10 border rounded-lg outline-none" />
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            {searchResults.length > 0 && (
              <div className="absolute z-50 w-full bg-white border rounded-xl shadow-xl mt-1 max-h-40 overflow-y-auto text-sm">
                {searchResults.map((item, idx) => (
                  <div key={idx} onClick={() => selectLocation(item)} className="p-2 cursor-pointer hover:bg-blue-50 border-b last:border-0">{item.display_name}</div>
                ))}
              </div>
            )}
          </div>

          <textarea name="description" placeholder="Description..." value={formData.description} onChange={handleChange} className="w-full p-2 border rounded-lg h-20 outline-none" />

          <div className="flex justify-end gap-2">
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm font-bold text-slate-500">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 text-sm font-bold bg-blue-600 text-white rounded-lg">Save Activity</button>
          </div>
        </div>
      ) : (
        /* View Mode */
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <span className="text-blue-600 font-black text-lg">{formData.time.slice(0, 5)}</span>
            <h3 className="text-xl font-bold text-slate-800">{formData.title}</h3>
            <div className="flex items-center gap-1.5 mt-1 text-slate-500">
              <MapPin size={14} />
              <span className="text-sm font-medium line-clamp-1">{formData.places}</span>
            </div>
            {formData.lat && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Maps:</span>
                <a href={`https://www.google.com/maps?q=${formData.lat},${formData.lon}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 flex items-center gap-1">
                  Open Directions <Zap size={12} />
                </a>
              </div>
            )}
            <p className="text-slate-500 text-sm mt-3 border-l-2 border-slate-100 pl-3">{formData.description}</p>
          </div>
          
          {/* ACTION BUTTONS (Edit & Delete) */}
          {role === 'admin' && (
            <div className="flex gap-2">
              <button onClick={() => setIsEditing(true)} className="p-2 border rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                <Pencil size={18} />
              </button>
              <button onClick={() => onDelete(activity.id)} className="p-2 border rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all">
                <Trash2 size={18} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}