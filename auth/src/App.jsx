import React, { useState, useEffect } from 'react';
import { SignUp, Login, Homepage, Profile } from './pages';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Sidebar, { SidebarItem } from './components/Sidebar';
import { Home, Bell, User, Users, UserCog, MapPin, ChartPie, BarChart, LogOut, Sparkles } from 'lucide-react';
import ManageGroups from './pages/ManageGroups';
import MemberManagement from './pages/MemberManagement';
import LocationManagement from './pages/LocationManagement';
import NotificationPage from './pages/NotificationPage';
import SchedulePage from './pages/SchedulePage';
import AnalyticsPage from './pages/AnalyticsPage';
import RouteManagement from './pages/RouteManagement';
import { supabase } from './client';

const App = () => {
  const [token, setToken] = useState(null);
  const [role, setRole] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [notificationPermission, setNotificationPermission] = useState('default');
  const navigate = useNavigate();
  const location = useLocation();
  const isDark = theme === 'dark';

  // ── Auth session handling (Supabase-managed, not sessionStorage) ──
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', isDark);
  }, [theme, isDark]);

  useEffect(() => {
    // 1. Get existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session);
      setLoading(false);
    });

    // 2. Listen for login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setToken(session);
        setLoading(false);

        // If logged out, clear everything
        if (!session) {
          setRole(null);
          setProfileData(null);
          setNotifications([]);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Define sound function at component level (not inside useEffect)
  const playStatusChangeSound = (newStatus) => {
    try {
      let soundFile = '/correct.wav'; // Default for ALL checkpoints (A, B, C, D, E, ...)

      if (newStatus === 'Missing') {
        soundFile = '/wrong.mp3'; // Only different sound for Missing
      }

      const audio = new Audio(soundFile);
      audio.volume = 0.6;
      audio.play().catch(err => console.log("Audio blocked:", err));
    } catch (err) {
      console.log("Sound error:", err);
    }
  };

  const requestBrowserNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      setNotificationPermission('granted');
      return;
    }

    if (Notification.permission === 'denied') {
      setNotificationPermission('denied');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  const showMissingMemberNotification = (profile) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const title = 'Missing member detected';
    const body = `${profile?.username || 'A member'} has been marked missing.`;
    const options = {
      body,
      icon: '/img/bg1.avif',
      badge: '/img/bg1.avif',
      tag: `missing-${profile?.user_id || profile?.id || Date.now()}`,
      requireInteraction: true,
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => registration.showNotification(title, options))
        .catch(() => new Notification(title, options));
    } else {
      new Notification(title, options);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (role === 'admin') {
      requestBrowserNotifications();
    }
  }, [role]);

  useEffect(() => {
    if (token) {
      fetchUserRole();
      fetchInitialMissing();

      const profileSubscription = supabase
        .channel('public:Profiles')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'Profiles', filter: `user_id=eq.${token.user.id}` },
          (payload) => {
            console.log('Profile updated:', payload.new);
            setProfileData(payload.new);
          }
        )
        .subscribe();

      // Real-time listener with sound for status changes
      const channel = supabase
        .channel('vnfc-alerts')
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'Profiles' },
          (payload) => {
            console.log("REALTIME PAYLOAD:", payload);

            const currentStatus = payload.new?.status
              ? String(payload.new.status).toUpperCase()
              : null;
            const recordId = payload.new?.user_id || payload.new?.id;

            if (!recordId) return;

            // Play sound for ALL status changes (including reset to empty)
            if (currentStatus !== undefined) {
              if (currentStatus) {
                playStatusChangeSound(currentStatus);
              } else {
                // Quieter "reset" sound when clearing status
                const audio = new Audio('/correct.wav');
                audio.volume = 0.3;
                audio.play().catch(err => console.log("Audio blocked:", err));
              }
            }

            if (currentStatus === 'MISSING') {
              const fetchFullProfile = async (idToFetch) => {
                try {
                  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idToFetch);
                  const searchColumn = isUUID ? 'user_id' : 'id';

                  const { data: profile, error } = await supabase
                    .from('Profiles')
                    .select('*')
                    .eq(searchColumn, idToFetch)
                    .single();

                  if (error) throw error;

                  if (profile) {
                    const newAlert = {
                      id: profile.user_id,
                      type: 'MISSING',
                      title: 'Member Reported Missing',
                      name: profile.username || 'Unknown',
                      phone: profile.phone_number || 'N/A',
                      group: profile.group || 'General',
                      timestamp: Date.now()
                    };

                    setNotifications(prev => {
                      if (prev.find(n => n.id === newAlert.id)) return prev;
                      new Audio('/alert1.mp3').play().catch((e) => console.log("Audio play blocked by browser", e));
                      return [newAlert, ...prev];
                    });

                    if (role === 'admin') {
                      showMissingMemberNotification(profile);
                    }
                  }
                } catch (err) {
                  console.error("Fetch Error:", err.message);
                }
              };

              fetchFullProfile(recordId);

            } else if (currentStatus && currentStatus !== 'MISSING') {
              setNotifications(prev => prev.filter(n => n.id !== (payload.new?.user_id || payload.old?.user_id)));
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(profileSubscription);
      };
    }
  }, [token]);

  // ── Fetch role, with auto-create fallback if profile is missing ──
  const fetchUserRole = async () => {
    if (!token?.user?.id) return;

    const { data, error } = await supabase
      .from('Profiles')
      .select('*')
      .eq('user_id', token.user.id)
      .maybeSingle();

    if (error) {
      console.error('fetchUserRole error:', error);
      return;
    }

    if (data) {
      setRole(data.role);
      setProfileData(data);
    } else {
      console.warn('No profile found for user:', token.user.id);
      // Profile missing — create it
      const { error: insertError } = await supabase
        .from('Profiles')
        .insert({
          user_id: token.user.id,
          email: token.user.email,
          username: token.user.user_metadata?.full_name || 'New User',
          role: 'member',
        });

      if (insertError) {
        console.error('Auto profile create failed:', insertError);
      } else {
        fetchUserRole(); // retry after creating
      }
    }
  };

  const fetchInitialMissing = async () => {
    const { data } = await supabase
      .from('Profiles')
      .select('*')
      .ilike('status', 'Missing');

    if (data) {
      const formatted = data.map(m => ({
        id: m.user_id,
        type: 'MISSING',
        title: 'Member Reported Missing',
        name: m.username,
        phone: m.phone_number,
        group: m.group,
        timestamp: Date.now()
      }));

      setNotifications(prev => {
        const existingIds = prev.map(n => n.id);
        const filteredNew = formatted.filter(f => !existingIds.includes(f.id));
        return [...prev, ...filteredNew];
      });
    }
  };

  // ── Logout: actually invalidate the Supabase session ──
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setToken(null);
    setRole(null);
    setProfileData(null);
    navigate('/');
  };

  // ── Loading screen while session is being checked ──
  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors duration-300 ${isDark ? 'bg-[#2D2926] text-white' : 'bg-[#f6efe9] text-[#2f241f]'}`}>
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  // Auth Guard
  if (!token) {
    return (
      <Routes>
        <Route path="/signup" element={<SignUp />} />
        <Route path="/" element={<Login setToken={setToken} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    );
  }

  return (
    <div className={`flex min-h-screen transition-colors duration-300 ${isDark ? 'bg-[#2D2926] text-stone-100' : 'bg-[#f6efe9] text-[#2f241f]'}`}>
      <Sidebar
        userName={profileData?.username || "User"}
        userEmail={token?.user?.email}
        role={role}
        avatarUrl={profileData?.avatar_url}
        theme={theme}
        onToggleTheme={() => setTheme(isDark ? 'light' : 'dark')}
      >
        <SidebarItem
          icon={<Home size={20} />} text="Home"
          onClick={() => navigate('/homepage')} active={location.pathname === '/homepage'}
        />
        <SidebarItem
          icon={<Bell size={20} />} text="Notifications"
          onClick={() => navigate('/notifications')} active={location.pathname === '/notifications'}
          alert={notifications.length > 0}
          badgeCount={notifications.length}
        />
        <SidebarItem
          icon={<User size={20} />} text="Profile"
          onClick={() => navigate('/profile')} active={location.pathname === '/profile'}
        />

        <hr className="my-3 border-slate-800 opacity-20" />

        {role === 'admin' && (
          <SidebarItem
            icon={<Users size={20} />} text="Manage Groups"
            onClick={() => navigate('/manage-groups')} active={location.pathname === '/manage-groups'}
          />
        )}

        <SidebarItem
          icon={role === 'admin' ? <UserCog size={20} /> : <Users size={20} />}
          text={role === 'admin' ? "Manage Members" : "Members"}
          onClick={() => navigate('/members')} active={location.pathname === '/members'}
        />

        <SidebarItem
          icon={<MapPin size={20} />}
          text={role === 'admin' ? "Manage Location" : "Trip Locations"}
          onClick={() => navigate('/manage-location')} active={location.pathname === '/manage-location'}
        />

        <SidebarItem
          icon={<BarChart size={20} />} text="Schedule"
          onClick={() => navigate('/schedule')} active={location.pathname === '/schedule'}
        />

        <SidebarItem
          icon={<ChartPie size={20} />} text="Analytics"
          onClick={() => navigate('/analytics')} active={location.pathname === '/analytics'}
        />

        <SidebarItem
          icon={<Sparkles size={20} />} text="Route"
          onClick={() => navigate('/create-route/1')} active={location.pathname.startsWith('/create-route')}
        />

        <hr className="my-3 border-slate-800 opacity-20" />
        <SidebarItem icon={<LogOut size={20} />} text="Logout" onClick={handleLogout} />
      </Sidebar>

      <main className={`flex-1 overflow-y-auto transition-colors duration-300 ${isDark ? 'bg-[#1f1a17] text-stone-100' : 'bg-[#f8f2eb] text-[#2f241f]'}`}>
        <div className={isDark ? 'drop-shadow-[0_2px_8px_rgba(255,255,255,0.15)]' : 'drop-shadow-[0_2px_8px_rgba(47,36,31,0.08)]'}>
          <Routes>
            <Route path="/homepage" element={<Homepage token={token} theme={theme} />} />
            <Route path="/profile" element={<Profile token={token} />} />
            {role === 'admin' && <Route path="/manage-groups" element={<ManageGroups role={role} />} />}
            <Route path="/members" element={<MemberManagement role={role} currentUserId={token.user.id} />} />
            <Route path="/manage-location" element={<LocationManagement userRole={role} />} />
            <Route path="/notifications" element={<NotificationPage notifications={notifications} setNotifications={setNotifications} />} />
            <Route path="/schedule" element={<SchedulePage role={role} />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/create-route/:tourId" element={<RouteManagement />} />
            <Route path="*" element={<Navigate to="/homepage" />} />
          </Routes>
        </div>
      </main>
    </div>
  );
};

export default App;