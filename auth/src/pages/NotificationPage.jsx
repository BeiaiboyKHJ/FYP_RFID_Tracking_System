import React from 'react';
import { Bell, AlertTriangle, Trash2, X, User, Users, Phone } from 'lucide-react';

const NotificationPage = ({ notifications, setNotifications }) => {
  const clearAll = () => setNotifications([]);
  
  // Dismiss a single notification
  const dismissOne = (id) => setNotifications(prev => prev.filter(n => n.id !== id));

  return (
    <div className="p-6 md:p-12 bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50/30 min-h-screen font-sans antialiased">
      {/* Header Section */}
      <div className="max-w-4xl mx-auto flex justify-between items-center mb-10 border-b border-slate-200/60 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <span className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-md shadow-blue-600/20 animate-pulse">
              <Bell size={24} />
            </span> 
            Live Alerts
          </h1>
        </div>
        
        {notifications.length > 0 && (
          <button 
            onClick={clearAll} 
            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-red-600 bg-white hover:bg-red-50 px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm transition-all duration-200 transform hover:scale-[1.02]"
          >
            <Trash2 size={16} /> Clear All
          </button>
        )}
      </div>

      {/* Main Stream Container */}
      <div className="max-w-4xl mx-auto space-y-4">
        {notifications.length === 0 ? (
          <div className="text-slate-400 font-medium bg-white/80 backdrop-blur-sm p-16 rounded-2xl border border-dashed border-slate-200 text-center shadow-inner flex flex-col items-center justify-center gap-3">
            <div className="p-4 bg-slate-100 rounded-full text-slate-300">
              <Bell size={32} />
            </div>
            <p className="italic">No active system alerts detected.</p>
          </div>
        ) : (
          notifications.map((note) => (
            <div 
              key={note.id} 
              className="relative group p-6 rounded-2xl border bg-gradient-to-r from-red-50/90 to-white hover:to-red-50/30 border-red-100 shadow-md shadow-red-900/5 hover:shadow-xl hover:shadow-red-900/10 transition-all duration-300 transform hover:-translate-y-0.5 animate-in slide-in-from-right-4"
            >
              
              {/* Individual Dismiss Button */}
              <button 
                onClick={() => dismissOne(note.id)}
                className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-100/80 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 border border-transparent hover:border-red-200 shadow-sm md:shadow-none bg-white md:bg-transparent"
              >
                <X size={16} />
              </button>

              <div className="flex items-start gap-5">
                {/* Dynamic Icon Treatment */}
                <div className="p-3 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 text-white shadow-md shadow-red-500/20 relative">
                  <AlertTriangle size={22} />
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                </div>
                
                {/* Alert Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <h3 className="font-bold text-lg text-slate-900 tracking-tight leading-tight">
                      {note.title}
                    </h3>
                    {note.group && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800 border border-red-200">
                        <Users size={12} /> {note.group}
                      </span>
                    )}
                  </div>
                  
                  {/* Metadata Block */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-white/60 rounded-xl p-3.5 border border-slate-100 text-sm shadow-inner">
                    <div className="flex items-center gap-2 text-slate-700 min-w-0">
                      <User size={15} className="text-slate-400 shrink-0" />
                      <span className="truncate"><strong>Name:</strong> {note.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700 min-w-0">
                      <Users size={15} className="text-slate-400 shrink-0" />
                      <span className="truncate"><strong>Group:</strong> {note.group || "N/A"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700 min-w-0">
                      <Phone size={15} className="text-slate-400 shrink-0" />
                      <span className="truncate"><strong>Contact:</strong> {note.phone || "No number"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationPage;