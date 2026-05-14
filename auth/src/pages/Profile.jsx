import React, { useState, useEffect } from 'react';
import { supabase } from '../client';
import { User, Phone, Mail, Calendar, Users, Edit2, X, Check, CreditCard, Camera, Loader2, Shield, PersonStanding, Ruler, Footprints } from 'lucide-react';

const Profile = ({ token }) => {
  const [profileData, setProfileData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    age: '',
    gender: '',
    role: '',
    phone_number: '',
    rfid_uid: '',
    avatar_url: '',
    body_mass: '',
    body_size: '',
    shoe_size: ''
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (token?.user?.id) {
      fetchProfile();
    }
  }, [token]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('Profiles')
        .select('*')
        .eq('user_id', token?.user?.id)
        .single();

      if (error) throw error;
      
      setProfileData(data);
      setFormData({
        username: data.username || '',
        age: data.age || '',
        gender: data.gender || '',
        phone_number: data.phone_number || '',
        role: data.role || '',
        rfid_uid: data.rfid_uid || '',
        avatar_url: data.avatar_url || '',
        body_mass: data.body_mass || '',
        body_size: data.body_size || '',
        shoe_size: data.shoe_size || ''
      });
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const ageValue = formData.age ? parseInt(formData.age) : null;

      const { error } = await supabase
        .from('Profiles')
        .update({
          username: formData.username,
          age: ageValue,
          gender: formData.gender,
          phone_number: formData.phone_number,
          rfid_uid: formData.rfid_uid,
          body_mass: formData.body_mass,
          body_size: formData.body_size,
          shoe_size: formData.shoe_size
        })
        .eq('user_id', token?.user?.id);

      if (error) throw error;

      setProfileData({ ...profileData, ...formData, age: ageValue });
      setIsEditing(false);
    } catch (error) {
      alert('Error updating profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadAvatar = async (event) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) return;

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${token.user.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      let { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('Profiles')
        .update({ avatar_url: publicUrl })
        .eq('user_id', token.user.id);

      if (updateError) throw updateError;

      setProfileData(prev => ({ ...prev, avatar_url: publicUrl }));
      setFormData(prev => ({ ...prev, avatar_url: publicUrl }));
      
    } catch (error) {
      alert('Error uploading avatar: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  if (loading && !profileData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header Titles */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Account Settings</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your public profile and personal information.</p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-r-lg flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">{error}</span>
            </div>
            <button onClick={fetchProfile} className="text-sm font-bold hover:underline">Retry</button>
          </div>
        )}

        {/* Main Profile Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          
          {/* Subtle Banner Background */}
          <div className="h-32 bg-gradient-to-r from-slate-800 to-slate-700"></div>

          <div className="px-6 sm:px-10 pb-8">
            {/* Avatar & Top Actions */}
            <div className="relative flex justify-between items-end -mt-16 mb-6">
              
              {/* Avatar Section */}
              <div className="relative group">
                <img
                  src={profileData?.avatar_url || `https://ui-avatars.com/api/?name=${formData.username || 'User'}&background=0f172a&color=fff&bold=true&size=256`}
                  alt="Profile"
                  className="w-32 h-32 rounded-full border-4 border-white shadow-md object-cover bg-white"
                />
                <label className="absolute bottom-1 right-1 p-2 bg-white border border-slate-200 text-slate-700 rounded-full cursor-pointer hover:bg-slate-50 hover:text-blue-600 shadow-sm transition-all active:scale-95">
                  {uploading ? <Loader2 size={18} className="animate-spin text-blue-600" /> : <Camera size={18} />}
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleUploadAvatar} 
                    disabled={uploading} 
                  />
                </label>
              </div>

              {/* Edit Button (Visible only in View Mode) */}
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-all shadow-sm active:scale-95 mb-2"
                >
                  <Edit2 size={16}/> Edit Profile
                </button>
              )}
            </div>

            {/* Basic Info */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900">{profileData?.username || 'New User'}</h2>
              <div className="flex items-center gap-2 text-slate-500 mt-1">
                <Mail size={16} />
                <span className="text-sm font-medium">{token?.user?.email}</span>
              </div>
            </div>

            <hr className="border-slate-100 mb-8" />

            {/* Form vs View Toggle */}
            {!isEditing ? (
              /* --- VIEW MODE --- */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8">
                <InfoItem icon={<User />} label="Full Name" value={profileData?.username} />
                <InfoItem icon={<Calendar />} label="Age" value={profileData?.age ? `${profileData.age} years old` : null} />
                <InfoItem icon={<Users />} label="Gender" value={profileData?.gender} />
                <InfoItem icon={<Phone />} label="Contact Number" value={profileData?.phone_number} />
                <InfoItem icon={<PersonStanding />} label="Body Mass" value={profileData?.body_mass ? `${profileData.body_mass} kg` : null} />
                <InfoItem icon={<Ruler />} label="Height" value={profileData?.body_size ? `${profileData.body_size} m` : null} />
                <InfoItem icon={<Footprints />} label="Shoe Size" value={profileData?.shoe_size ? `${profileData.shoe_size}` : null} />
                <InfoItem 
                  icon={<CreditCard />} 
                  label="RFID UID" 
                  value={
                    profileData?.rfid_uid ? (
                      <span className="font-mono text-slate-900">{profileData.rfid_uid}</span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        Waiting for scan
                      </span>
                    )
                  } 
                />
              </div>
            ) : (
              /* --- EDIT MODE --- */
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Full Name</label>
                    <input
                      type="text"
                      name="username"
                      value={formData.username}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all shadow-sm"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Age</label>
                    <input
                      type="number"
                      name="age"
                      value={formData.age}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all shadow-sm"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Contact Number</label>
                    <input
                      type="text"
                      name="phone_number"
                      value={formData.phone_number}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all shadow-sm"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Gender</label>
                    <select
                      name="gender"
                      value={formData.gender}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all shadow-sm"
                      required
                    >
                      <option value="" disabled>Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Body Mass (kg)</label>
                    <input
                      type="number"
                      name="body_mass"
                      value={formData.body_mass}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Height (m)</label>
                    <input
                      type="text"
                      name="body_size"
                      value={formData.body_size}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Shoe Size (EU) </label>
                    <input
                      type="number"
                      name="shoe_size"
                      value={formData.shoe_size}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all shadow-sm"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">RFID UID</label>
                    <input
                      type="text"
                      name="rfid_uid"
                      value={formData.rfid_uid}
                      onChange={handleChange}
                      placeholder="Scan card or enter manually"
                      className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-all shadow-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin"/> : <Check size={18}/>}
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper component for View Mode to keep code DRY and clean
const InfoItem = ({ icon, label, value }) => (
  <div className="flex items-start gap-4">
    <div className="p-2.5 bg-slate-50 border border-slate-100 text-slate-500 rounded-xl">
      {icon}
    </div>
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <div className="text-slate-900 font-semibold">
        {value ? value : <span className="text-slate-400 font-medium italic">Not specified</span>}
      </div>
    </div>
  </div>
);

export default Profile;