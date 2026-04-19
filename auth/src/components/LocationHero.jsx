import React from 'react';
import { MapPin } from 'lucide-react';

const LocationHero = ({ locationName }) => {
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl p-8 text-white shadow-xl shadow-blue-200 mb-8">
      {/* Decorative Circles */}
      <div className="absolute -right-10 -top-10 w-48 h-48 bg-white/10 rounded-full blur-2xl"></div>
      <div className="absolute right-20 -bottom-20 w-32 h-32 bg-blue-400/20 rounded-full blur-xl"></div>
      
      <div className="relative z-10">
        <div className="flex items-center gap-2 text-blue-100 text-sm font-medium mb-3">
          <MapPin size={16} />
          Your Current Location
        </div>
        <h2 className="text-4xl font-bold tracking-tight">{locationName}</h2>
      </div>
    </div>
  );
};

export default LocationHero;