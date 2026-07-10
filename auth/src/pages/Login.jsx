import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../client';
import { Mail, Lock, LogIn, Loader } from 'lucide-react';

const Login = () => {
  let navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '', password: ''
  });

  function handleChange(event) {
    setFormData((prevFormData) => {
      return {
        ...prevFormData,
        [event.target.name]: event.target.value
      };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) throw error;

      // No need to manually fetch the profile or call setToken here —
      // App.jsx's onAuthStateChange listener picks up the new session
      // automatically and fetches the profile via fetchUserRole().
      navigate('/homepage');
    } catch (error) {
      alert(error.message || error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f6efe9] p-4">
      <div className="max-w-md w-full bg-white/90 p-8 rounded-2xl shadow-sm border border-[#e6d8c8]">

        <div className="text-center mb-8">
           <h1 className="text-2xl font-bold text-slate-800 font-sans">Login</h1>
        </div>

        <form onSubmit={handleSubmit} className='space-y-6'>
          {/* Email Input */}
          <div className='space-y-2'>
            <label className="text-sm font-semibold text-slate-700 ml-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="email"
                placeholder='name@example.com'
                name='email'
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Password Input */}
          <div className='space-y-2'>
            <label className="text-sm font-semibold text-slate-700 ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                placeholder='Password'
                name='password'
                type="password"
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Submit Button — single consistent color, no dangling hover: */}
          <button
            type='submit'
            disabled={loading}
            className="w-full bg-[#1d6b62] hover:bg-[#14524c] text-white py-3 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-[#1d6b62] focus:ring-offset-2 transition-all flex justify-center items-center"
          >
            {loading ? <Loader className="animate-spin" size={20} /> : "Submit"}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-600">
          Don't have an account?
          <Link to='/signup' className="text-blue-500 hover:underline ml-1 font-bold">
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;