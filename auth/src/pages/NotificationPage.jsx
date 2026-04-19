import React from 'react';
import { Bell, AlertTriangle, Trash2, X } from 'lucide-react'; // Added 'X' icon

const NotificationPage = ({ notifications, setNotifications }) => {
  const clearAll = () => setNotifications([]);
  
  // New function to dismiss a single notification
  const dismissOne = (id) => setNotifications(prev => prev.filter(n => n.id !== id));

  return (
    <div className="p-10 bg-[#f8fafc] min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Bell className="text-blue-600" /> Live Alerts
        </h1>
        {notifications.length > 0 && (
          <button onClick={clearAll} className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-600 transition-colors">
            <Trash2 size={16} /> Clear All
          </button>
        )}
      </div>

      <div className="space-y-4">
        {notifications.length === 0 ? (
          <div className="text-slate-400 italic bg-white p-12 rounded-2xl border border-dashed text-center">
            No active alerts.
          </div>
        ) : (
          notifications.map((note) => (
            // Added 'relative' and 'group' classes here for the hover effect
            <div key={note.id} className="relative group p-6 rounded-2xl border shadow-sm bg-red-50 border-red-200 animate-in slide-in-from-right-4">
              
              {/* Individual Dismiss Button */}
              <button 
                onClick={() => dismissOne(note.id)}
                className="absolute top-4 right-4 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={18} />
              </button>

              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-red-600 text-white"><AlertTriangle size={20} /></div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900">{note.title}</h3>
                  <div className="mt-2 text-slate-700 space-y-1">
                    <p><strong>Name:</strong> {note.name}</p>
                    <p><strong>Group:</strong> {note.group || "N/A"}</p>
                    <p><strong>Contact:</strong> {note.phone || "No number"}</p>
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