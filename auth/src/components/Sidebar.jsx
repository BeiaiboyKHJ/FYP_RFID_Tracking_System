import { MoreVertical, ChevronLast, ChevronFirst, Shield, User } from "lucide-react"
import { useContext, createContext, useState } from "react"

const SidebarContext = createContext()

export default function Sidebar({ children, userEmail, userName, role, avatarUrl }) {
  const [expanded, setExpanded] = useState(true)
  
  return (
    <aside className="h-screen sticky top-0 z-50">
      <nav 
        className="h-full flex flex-col bg-[#A39184] border-r border-[#8E7D70] shadow-xl transition-all duration-300 ease-in-out overflow-x-hidden"
        style={{ width: expanded ? '256px' : '80px' }}
      >
        <div className="p-4 pb-2 flex justify-between items-center">
          <div className={`overflow-hidden transition-all duration-300 ${expanded ? "w-32 opacity-100" : "w-0 opacity-0"}`}>
              <span className="font-bold text-black whitespace-nowrap text-lg tracking-tight">RFID Tracker</span>
          </div>
          
          <button
            onClick={() => setExpanded((curr) => !curr)}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors shrink-0"
          >
            {expanded ? <ChevronFirst size={20} /> : <ChevronLast size={20} />}
          </button>
        </div>

        <SidebarContext.Provider value={{ expanded }}>
          <ul className="flex-1 px-3 mt-4 space-y-1">{children}</ul>
        </SidebarContext.Provider>

        {/* PROFILE SECTION - UPDATED WITH ROLE LOGIC */}
{/* PROFILE SECTION - Now with a solid dark background */}
      <div className="border-t border-[#8E7D70] p-4 bg-[#2D2926] shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
        <div className="flex items-center">
          <div className="relative">
            <img
              src={avatarUrl || `https://ui-avatars.com/api/?name=${userName}&background=2563eb&color=fff&bold=true`}
              alt="avatar"
              className={`w-22 h-16 rounded-full shrink-0 shadow-md transition-all border-2 ${
                role === 'admin' ? 'border-red-500/50' : 'border-blue-500/50'
              }`}
            />
            {/* Status Dot - Adjusted border to match new dark bg */}
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-[#2D2926] rounded-full">
              <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75"></span>
            </span>
          </div>
          
          <div
            className={`
              flex justify-between items-center transition-all duration-300
              overflow-hidden ${expanded ? "w-52 ml-3 opacity-100" : "w-0 opacity-0"}
          `}
          >
            <div className="leading-4 whitespace-nowrap">
              {/* Changed text to white to pop against dark background */}
              <h4 className="font-bold text-white text-sm flex items-center gap-1">
                {userName}
                {role === 'admin' && <Shield size={12} className="text-red-400" />}
              </h4>
              <span className="text-[10px] text-stone-400 font-medium">{userEmail}</span>
              
              {/* ROLE BADGE */}
              {role && (
                <div className={`mt-1 block text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider w-fit ${
                  role === 'admin' 
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40' 
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                }`}>
                  {role}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </nav>
    </aside>
  )
}

export function SidebarItem({ icon, text, active, alert, onClick }) {
  const { expanded } = useContext(SidebarContext)
  
  return (
    <li
      onClick={onClick}
      className={`
        relative flex items-center py-3 px-3 my-1
        font-medium rounded-md cursor-pointer
        transition-all group
        ${active
            ? "bg-[#2D2926] text-white shadow-md"
            : "text-[#2D2926]/80 hover:bg-[#2D2926]/10 hover:text-[#2D2926]"
        }
    `}
    >
      <div className="shrink-0">{icon}</div>
      <span
        className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${
          expanded ? "w-52 ml-3 opacity-100" : "w-0 opacity-0"
        }`}
      >
        {text}
      </span>
      
      {alert && (
        <div
          className={`absolute right-2 w-2 h-2 rounded bg-indigo-400 ${
            expanded ? "" : "top-2"
          }`}
        />
      )}

      {!expanded && (
        <div
          className={`
            absolute left-full rounded-md px-2 py-1 ml-6
            bg-slate-800 text-white text-xs whitespace-nowrap
            invisible opacity-20 -translate-x-3 transition-all
            group-hover:visible group-hover:opacity-100 group-hover:translate-x-0
            z-50 shadow-xl border border-slate-700
          `}
        >
          {text}
        </div>
      )}
    </li>
  )
}