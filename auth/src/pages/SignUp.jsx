import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../client';

const SignUp = () => {
  const [formData, setFormData] = useState({
    fullName: '', email: '', password: '', age: '', gender: '', 
    phoneNumber: '', bodyMass: '', bodySize: '', shoeSize: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleChange(event) {
    setFormData((prevFormData) => ({
      ...prevFormData,
      [event.target.name]: event.target.value
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // ✅ STEP 1: Create Auth User
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            age: formData.age ? parseInt(formData.age) : null,
            gender: formData.gender,
            phone_number: formData.phoneNumber,
            body_mass: formData.bodyMass ? parseFloat(formData.bodyMass) : null,
            body_size: formData.bodySize ? parseFloat(formData.bodySize) : null,
            shoe_size: formData.shoeSize ? parseInt(formData.shoeSize) : null
          }
        }
      });

      if (authError) {
        console.error('Auth error:', authError);
        throw authError;
      }

      if (!authData?.user) {
        throw new Error('No user data returned from signup');
      }

      const userId = authData.user.id;
      console.log('✓ Auth user created:', userId);

      // ✅ STEP 2: Create Profile Record
      const { error: profileError } = await supabase
        .from('Profiles')
        .insert({
          user_id: userId,
          username: formData.fullName,
          email: formData.email,
          age: formData.age ? parseInt(formData.age) : null,
          gender: formData.gender || null,
          phone_number: formData.phoneNumber || null,
          body_mass: formData.bodyMass ? parseFloat(formData.bodyMass) : null,
          body_size: formData.bodySize ? parseFloat(formData.bodySize) : null,
          shoe_size: formData.shoeSize ? parseInt(formData.shoeSize) : null,
          created_at: new Date().toISOString()
        });

      if (profileError) {
        console.error('Profile creation error:', profileError);
        // ⚠️ Auth user created but profile failed - notify user
        throw new Error(`Account created but profile setup failed: ${profileError.message}`);
      }

      console.log('✓ Profile created successfully');
      
      // ✅ SUCCESS
      setError('');
      alert('Account created! Please check your email for verification.');
      
      // Optional: Redirect after short delay
      // setTimeout(() => window.location.href = '/', 2000);

    } catch (error) {
      console.error('Signup error:', error);
      setError(error.message || 'An error occurred during signup');
      alert(error.message || 'An error occurred during signup');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="text-center text-3xl font-extrabold text-gray-900">
          Sign Up
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/" className="font-medium text-blue-600 hover:text-blue-500 underline">
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
          
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Full Name</label>
              <input
                name="fullName"
                type="text"
                value={formData.fullName}
                onChange={handleChange}
                required
                disabled={loading}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="John Doe"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Email address</label>
              <input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={loading}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="name@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={loading}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Min 6 characters"
              />
            </div>

            {/* Age & Gender Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Age</label>
                <input
                  name="age"
                  type="number"
                  value={formData.age}
                  onChange={handleChange}
                  disabled={loading}
                  min="1"
                  max="120"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Gender</label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>

            {/* Body Mass */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Body Mass (kg)</label>
              <input
                name="bodyMass"
                type="number"
                value={formData.bodyMass}
                onChange={handleChange}
                disabled={loading}
                step="0.1"
                min="0"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 70"
              />
            </div>

            {/* Height */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Height (m)</label>
              <input
                name="bodySize"
                type="number"
                value={formData.bodySize}
                onChange={handleChange}
                disabled={loading}
                step="0.01"
                min="0"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 1.75"
              />
            </div>

            {/* Shoe Size */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Shoe Size (EU)</label>
              <input
                name="shoeSize"
                type="number"
                value={formData.shoeSize}
                onChange={handleChange}
                disabled={loading}
                min="0"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 42"
              />
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Contact Number</label>
              <input
                name="phoneNumber"
                type="text"
                value={formData.phoneNumber}
                onChange={handleChange}
                disabled={loading}
                placeholder="e.g. 60105600261"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={loading}
                className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white ${
                  loading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                } focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors`}
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignUp;