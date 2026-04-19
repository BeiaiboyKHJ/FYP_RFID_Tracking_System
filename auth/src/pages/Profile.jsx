import React, { useState, useEffect } from 'react';
import { supabase } from '../client';
// Added Camera and Loader2 for the upload UI
import { User, Phone, Shield, Mail, Calendar, Users, Edit2, X, Check, CreditCard, Camera, Loader2 } from 'lucide-react';

const Profile = ({ token }) => {
  const [profileData, setProfileData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false); // New state for upload loading
  const [formData, setFormData] = useState({
    username: '',
    age: '',
    gender: '',
    role: '',
    phone_number: '',
    rfid_uid: '',
    avatar_url: ''
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
        avatar_url: data.avatar_url || ''
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
          rfid_uid: formData.rfid_uid
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

      // 1. Upload to Supabase Storage
      let { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Get the Public URL (CRITICAL: You need the URL to show the image)
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // 3. Update the avatar_url in the Profiles table with the Public URL
      const { error: updateError } = await supabase
        .from('Profiles')
        .update({ avatar_url: publicUrl })
        .eq('user_id', token.user.id);

      if (updateError) throw updateError;

      // 4. Update the local states
      setProfileData(prev => ({ ...prev, avatar_url: publicUrl }));
      setFormData(prev => ({ ...prev, avatar_url: publicUrl }));
      
      alert('Avatar updated successfully!');
    } catch (error) {
      alert('Error uploading avatar: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="p-10 text-slate-500 font-medium animate-pulse">Loading profile...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Account Settings</h1>
          <p className="text-slate-500 mt-1">Manage your public profile and personal information.</p>
        </header>

        {error && !profileData && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex justify-between items-center">
            <span>{error}</span>
            <button onClick={fetchProfile} className="text-sm font-bold underline">Retry</button>
          </div>
        )}

        {/* --- AVATAR SECTION --- */}
        <div className="relative mb-8 flex items-end gap-6">
          <div className="relative group">
            <img
              src={profileData?.avatar_url || `https://ui-avatars.com/api/?name=${formData.username}&background=2563eb&color=fff&bold=true`}
              alt="Profile"
              className="w-32 h-32 rounded-full border-4 border-white shadow-xl object-cover bg-white"
            />
            <label className="absolute bottom-1 right-1 p-2 bg-blue-600 text-white rounded-full cursor-pointer hover:bg-blue-700 shadow-lg transition-all active:scale-90">
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
              <input 
                type="file" 
                className="hidden" 
                accept="image/*" 
                onChange={handleUploadAvatar} 
                disabled={uploading} 
              />
            </label>
          </div>
          <div className="pb-2">
            <h2 className="text-2xl font-bold text-slate-900">{profileData?.username || 'Guest User'}</h2>
            <p className="text-slate-500 text-sm font-medium">{token?.user?.email}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-8">
            {!isEditing ? (
              /* --- VIEW MODE --- */
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-stone-800">Email Address</label>
                    <div className="flex items-center gap-3 text-slate-700 font-medium">
                       <div className="p-2 bg-slate-100 rounded-lg text-slate-500"><Mail size={18}/></div>
                       {token?.user?.email}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-stone-800">Full Name</label>
                    <div className="flex items-center gap-3 text-slate-900 font-semibold text-lg">
                       <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><User size={18}/></div>
                       {profileData?.username || 'Not set'}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-stone-800">Age</label>
                    <div className="flex items-center gap-3 text-slate-900 font-semibold text-lg">
                       <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><Calendar size={18}/></div>
                       {profileData?.age ? `${profileData.age} years old` : 'Not set'}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-stone-800">Gender</label>
                    <div className="flex items-center gap-3 text-slate-900 font-semibold text-lg">
                       <div className="p-2 bg-pink-50 rounded-lg text-pink-600"><Users size={18}/></div>
                       {profileData?.gender || 'Not set'}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-800">Contact Number</label>
                  <div className="flex items-center gap-3 text-slate-900 font-semibold text-lg">
                     <div className="p-2 bg-green-50 rounded-lg text-green-600"><Phone size={18}/></div>
                     {profileData?.phone_number || 'Not set'}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-800">RFID UID</label>
                  <div className="flex items-center gap-3 text-stone-900 font-semibold text-lg">
                     <div className="p-2 bg-yellow-50 rounded-lg text-yellow-600"><CreditCard size={18}/></div>
                     {profileData?.rfid_uid ? (
                        <span className="font-mono text-blue-600">{profileData.rfid_uid}</span>
                      ) : (
                        <span className="text-stone-800">Waiting for first scan...</span>
                      )}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all active:scale-95"
                  >
                    <Edit2 size={18}/> Edit Profile Info
                  </button>
                </div>
              </div>
            ) : (
              /* --- EDIT MODE --- */
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Full Name</label>
                    <input
                      type="text"
                      name="username"
                      value={formData.username}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-stone-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Age</label>
                    <input
                      type="number"
                      name="age"
                      value={formData.age}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-stone-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Contact Number</label>
                    <input
                      type="text"
                      name="phone_number"
                      value={formData.phone_number}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-stone-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">RFID UID</label>
                    <input
                      type="text"
                      name="rfid_uid"
                      value={formData.rfid_uid}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-stone-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Gender</label>
                    <select
                      name="gender"
                      value={formData.gender}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-stone-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                      required
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 flex gap-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-xl text-stone-900 font-bold hover:bg-green-700 transition-all disabled:opacity-50"
                  >
                    <Check size={18}/> {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-stone-900 font-bold hover:bg-slate-200 transition-all"
                  >
                    <X size={18}/> Cancel
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

export default Profile;