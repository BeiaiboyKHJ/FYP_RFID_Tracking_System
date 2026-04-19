import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../client';

const SignUp = () => {
  const [formData, setFormData] = useState({
    fullName: '', email: '', password: '', age: '', gender: '',phoneNumber:''
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

    try {
      console.log("1. Starting Auth Sign Up...");

      // We send ALL data inside the signUp metadata (options.data)
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            age: formData.age ? parseInt(formData.age) : null,
            gender: formData.gender,
            phone_number: formData.phoneNumber
          }
        }
      });

      if (error) {
        console.error("Auth Error:", error.message);
        throw error;
      }

      console.log("2. Auth Success. User ID:", data.user?.id);
      console.log("The SQL Trigger is now creating your Profile automatically.");

      alert('Account created! Please check your email for the verification link.');

    } catch (error) {
      console.error("Catch Block Error:", error);
      alert(error.message || "An error occurred during sign up.");
    }
  }

  return (
    <div className="signup-container">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm">
        <h2 className="text-xl font-bold">Create Account</h2>
        
        <input 
          placeholder='Full Name'
          name='fullName'
          className="border p-2 rounded"
          onChange={handleChange}
          required
        />

        <input 
          placeholder='Email'
          name='email'
          type="email"
          className="border p-2 rounded"
          onChange={handleChange}
          required
        />

        <input 
          placeholder='Password'
          name='password'
          type="password"
          className="border p-2 rounded"
          onChange={handleChange}
          required
        />

        <input 
          placeholder='Age'
          name='age'
          type='number'
          className="border p-2 rounded"
          onChange={handleChange}
        />

        <input
          placeholder='Contact Number (Example:60105600261)'
          name='phoneNumber'
          type='text'
          className="border p-2 rounded"
          onChange={handleChange}
        />

        <select 
          name='gender' 
          className="border p-2 rounded"
          onChange={handleChange}
          required
        >
          <option value="">Select Gender</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>

        <button 
          type='submit'
          className="bg-blue-600 text-white p-2 rounded font-bold hover:bg-blue-700"
        >
          Sign Up
        </button>
      </form>
      <p className="mt-4">
        Already have an account? <Link to='/' className="text-blue-600 underline">Login</Link>
      </p>
    </div>
  );
};

export default SignUp;