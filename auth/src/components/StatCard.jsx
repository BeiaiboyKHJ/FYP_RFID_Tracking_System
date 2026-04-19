import React from 'react';

const StatCard = ({ label, value, isCritical }) => {
  return (
    <div className={`p-6 rounded-2xl border transition-all ${
      isCritical 
        ? 'bg-red-50 border-red-100 text-red-600' 
        : 'bg-white border-slate-100 text-slate-900 shadow-sm'
    }`}>
      <p className={`text-sm font-semibold mb-2 ${isCritical ? 'text-red-800' : 'text-slate-500'}`}>
        {label}
      </p>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
    </div>
  );
};

// ADD THIS LINE AT THE BOTTOM
export default StatCard;