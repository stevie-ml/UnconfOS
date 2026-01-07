import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, update, set, remove } from "firebase/database";
import { Users, Settings, Trash2, Share2, Calendar, X, Check, Clock, Plus, AlertCircle } from 'lucide-react';

// --- THE EXACT ID FROM YOUR WHATSAPP SCREENSHOT ---
const HARDCODED_EVENT_ID = "-OilgSFBkcnwwcP14ZJS"; 

// --- CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDC5uHKlOdIHCFWZNbNqIoTaxNLKF1ZsI",
  authDomain: "second-order-schedule.firebaseapp.com",
  databaseURL: "https://second-order-schedule-default-rtdb.firebaseio.com",
  projectId: "second-order-schedule",
  storageBucket: "second-order-schedule.firebasestorage.app",
  messagingSenderId: "862005260010",
  appId: "1:862005260010:web:5dd8b581485dc1ef8db193",
  measurementId: "G-5D7CWV70H0"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- CONSTANTS ---
const PX_PER_MIN = 3; 
const SLOT_MINUTES = 15;

// --- HELPERS ---
const getMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const formatTime = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const formatDuration = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

const COLORS = [
  { bg: '#fecaca', border: '#b91c1c', text: '#7f1d1d' }, // Red
  { bg: '#fed7aa', border: '#c2410c', text: '#7c2d12' }, // Orange
  { bg: '#fde68a', border: '#b45309', text: '#78350f' }, // Amber
  { bg: '#bbf7d0', border: '#15803d', text: '#14532d' }, // Green
  { bg: '#bfdbfe', border: '#1d4ed8', text: '#1e3a8a' }, // Blue
  { bg: '#ddd6fe', border: '#6d28d9', text: '#5b21b6' }, // Violet
  { bg: '#f5d0fe', border: '#c026d3', text: '#701a75' }, // Fuchsia
  { bg: '#fbcfe8', border: '#be185d', text: '#831843' }, // Pink
  { bg: '#99f6e4', border: '#0f766e', text: '#134e4a' }, // Teal
];

const getHostColor = (name) => {
  if (!name) return { bg: '#e2e8f0', border: '#64748b', text: '#1e293b' };
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
};

const generateDateRange = (startStr, endStr) => {
  if (!startStr || !endStr) return [];
  const dates = [];
  let current = new Date(startStr + "T12:00:00");
  const end = new Date(endStr + "T12:00:00");
  
  let safety = 0;
  while (current <= end && safety < 30) {
    dates.push(current.toDateString());
    current.setDate(current.getDate() + 1);
    safety++;
  }
  return dates;
};

const safeKey = (str) => str.replace(/[.#$[\]]/g, "");

// --- MAIN COMPONENT ---

const EventGrid = () => {
  const params = useParams();
  const eventId = params.eventId || HARDCODED_EVENT_ID;

  const [eventData, setEventData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState([]);
  const [selectedDay, setSelectedDay] = useState("");
  
  // Drag State
  const [isDragging, setIsDragging] = useState(false);
  const [dragRoom, setDragRoom] = useState(null);
  const [dragStartMin, setDragStartMin] = useState(null);
  const [dragCurrentMin, setDragCurrentMin] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [tempData, setTempData] = useState({ title: "", host: "" });
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  
  const [myRSVPs, setMyRSVPs] = useState({});

  useEffect(() => {
    if (!eventId) return;
    const saved = localStorage.getItem(`rsvps_${eventId}`);
    if (saved) setMyRSVPs(JSON.parse(saved));
    
    const unsubscribe = onValue(ref(db, `events/${eventId}`), (snapshot) => {
      setLoading(false);
      const data = snapshot.val();
      if (data && data.config) {
        setEventData(data);
        const d = generateDateRange(data.config.startDate, data.config.endDate);
        setDates(d);
        if (!selectedDay && d.length > 0) setSelectedDay(d[0]);
        setNewStartDate(data.config.startDate || "");
        setNewEndDate(data.config.endDate || "");
      } else {
        setEventData(null); // No data found
      }
    });
    return () => unsubscribe();
  }, [eventId]);

  const safeRooms = useMemo(() => {
    if (!eventData?.config?.rooms) return [];
    return Object.values(eventData.config.rooms).filter(r => r && typeof r === 'string');
  }, [eventData]);

  const startHour = eventData?.config?.startHour || 8;
  const endHour = eventData?.config?.endHour || 24;
  const dayStartMinutes = startHour * 60;
  const totalHeight = (endHour - startHour) * 60 * PX_PER_MIN;

  // ACTIONS
  const handleCanvasMouseDown = (e, room) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top; 
    const minutes = Math.floor(y / PX_PER_MIN) + dayStartMinutes;
    const snapped = Math.floor(minutes / 15) * 15;
    setIsDragging(true);
    setDragRoom(room);
    setDragStartMin(snapped);
    setDragCurrentMin(snapped + 15);
  };

  const handleCanvasMouseMove = (e) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutes = Math.floor(y / PX_PER_MIN) + dayStartMinutes;
    const snapped = Math.ceil(minutes / 15) * 15;
    if (snapped > dragStartMin) setDragCurrentMin(snapped);
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      setModalOpen(true);
      setTempData({ title: "", host: "" });
    }
  };

  const saveSession = () => {
    if (!tempData.title) return;
    const duration = dragCurrentMin - dragStartMin;
    const timeStr = formatTime(dragStartMin);
    const slotId = `${selectedDay}::${timeStr}::${safeKey(dragRoom)}`;
    update(ref(db, `events/${eventId}/schedule/${slotId}`), { 
      ...tempData, duration, rsvps: 0 
    });
    setModalOpen(false);
  };

  // --- ROBUST DELETE FUNCTION ---
  const handleDeleteSession = (key) => {
    if(window.confirm("Delete this session?")) {
      // Use standard Firebase remove()
      const sessionRef = ref(db, `events/${eventId}/schedule/${key}`);
      remove(sessionRef).catch(err => alert("Error deleting: " + err.message));
    }
  };

  const handleRSVP = (key) => {
    const isRSVPd = myRSVPs[key];
    const session = eventData.schedule[key];
    const newCount = isRSVPd ? Math.max(0, (session.rsvps || 0) - 1) : (session.rsvps || 0) + 1;
    update(ref(db, `events/${eventId}/schedule/${key}`), { rsvps: newCount });
    const newLocal = { ...myRSVPs, [key]: !isRSVPd };
    setMyRSVPs(newLocal);
    localStorage.setItem(`rsvps_${eventId}`, JSON.stringify(newLocal));
  };

  // SETTINGS
  const handleAddRoom = () => {
    if (!newRoomName) return;
    set(ref(db, `events/${eventId}/config/rooms`), [...safeRooms, safeKey(newRoomName)]);
    setNewRoomName("");
  };

  const handleDeleteRoom = (r) => {
    if(window.confirm(`Delete room "${r}"?`)) {
      set(ref(db, `events/${eventId}/config/rooms`), safeRooms.filter(room => room !== r));
    }
  };

  const handleUpdateDates = () => {
    if(newStartDate && newEndDate) {
      update(ref(db, `events/${eventId}/config`), { startDate: newStartDate, endDate: newEndDate });
      alert("Dates updated!");
    }
  };

  if (!eventId) return <div className="p-10 text-center font-bold text-red-600">Please paste your Event ID into the code!</div>;
  
  if (loading) return <div className="p-10 text-center animate-pulse">Loading Schedule...</div>;
  
  // New Error Screen if ID is wrong
  if (!eventData) return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <AlertCircle size={48} className="text-red-500 mb-4"/>
      <h1 className="text-2xl font-bold mb-2">Event Not Found</h1>
      <p className="text-slate-600 mb-4">Could not find data for ID: <span className="font-mono bg-slate-100 p-1 rounded">{eventId}</span></p>
      <button onClick={() => window.location.href = '/'} className="text-blue-600 hover:underline">Go Home</button>
    </div>
  );

  const hourMarkers = [];
  for (let h = startHour; h < endHour; h++) hourMarkers.push(h);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col h-screen overflow-hidden" onMouseUp={handleMouseUp}>
      <header className="bg-white border-b z-50 px-4 py-3 shadow-sm flex-none flex justify-between items-center">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{eventData.config.name}</h1>
          <div className="flex gap-2 mt-1 overflow-x-auto no-scrollbar">
            {dates.map(day => (
              <button key={day} onClick={() => setSelectedDay(day)} className={`px-2 py-1 rounded text-xs font-bold transition-colors whitespace-nowrap ${selectedDay === day ? 'bg-slate-800 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>
                {day.split(' ').slice(0, 3).join(' ')}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 ml-4">
          <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-slate-100 rounded text-slate-500"><Settings size={20}/></button>
          <button onClick={() => navigator.clipboard.writeText(window.location.href)} className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700 shadow"><Share2 size={20}/></button>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 overflow-auto flex relative bg-white select-none">
        <div className="sticky left-0 bg-white z-20 border-r w-14 flex-none" style={{ height: totalHeight }}>
          {hourMarkers.map(h => (
            <div key={h} className="absolute w-full text-center text-xs text-slate-400 font-bold" 
                 style={{ top: (h * 60 - dayStartMinutes) * PX_PER_MIN, transform: 'translateY(-50%)' }}>
              {h}:00
            </div>
          ))}
        </div>

        <div className="flex flex-1 min-w-0" style={{ height: totalHeight }}>
          {safeRooms.map(room => (
            <div 
              key={room} 
              className="flex-1 min-w-[150px] border-r relative bg-slate-50/20 group"
              onMouseDown={(e) => handleCanvasMouseDown(e, room)}
              onMouseMove={handleCanvasMouseMove}
            >
              <div className="sticky top-0 bg-white/95 backdrop-blur border-b z-30 p-2 text-center text-sm font-bold text-slate-700 uppercase">{room}</div>

              {hourMarkers.map(h => (
                <div key={h} className="absolute w-full border-t border-slate-300" style={{ top: (h * 60 - dayStartMinutes) * PX_PER_MIN }}></div>
              ))}
              {hourMarkers.map(h => [15,30,45].map(m => (
                 <div key={`${h}-${m}`} className="absolute w-full border-t border-slate-100" style={{ top: ((h * 60 + m) - dayStartMinutes) * PX_PER_MIN }}></div>
              )))}

              {Object.entries(eventData.schedule || {})
                .filter(([key]) => key.startsWith(`${selectedDay}::`) && key.endsWith(`::${room}`))
                .map(([key, session]) => {
                  const [_, timeStr] = key.split('::');
                  const startMin = getMinutes(timeStr);
                  const top = (startMin - dayStartMinutes) * PX_PER_MIN;
                  const height = Number(session.duration || 60) * PX_PER_MIN;
                  const styles = getHostColor(session.host);
                  
                  return (
                    <div 
                      key={key}
                      onMouseDown={(e) => e.stopPropagation()} 
                      style={{ top: `${top}px`, height: `${Math.max(height, 30)}px`, backgroundColor: styles.bg, borderColor: styles.border, color: styles.text, zIndex: 10 }}
                      className="absolute left-1 right-1 border-l-4 rounded p-2 text-xs flex flex-col justify-between shadow-md overflow-hidden cursor-default transition-transform hover:scale-[1.01]"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold leading-tight text-sm">{session.title}</span>
                        <div className="flex flex-col items-end gap-1">
                           <span className="bg-white/40 px-1 rounded text-[10px] font-bold">{formatDuration(session.duration || 60)}</span>
                           
                           {/* --- DELETE BUTTON with StopPropagation --- */}
                           <button 
                              onClick={(e) => {
                                e.stopPropagation(); 
                                handleDeleteSession(key);
                              }} 
                              className="hover:bg-red-500 hover:text-white p-0.5 rounded cursor-pointer pointer-events-auto"
                           >
                             <Trash2 size={12}/>
                           </button>
                        </div>
                      </div>
                      <div className="flex justify-between items-end mt-1">
                        <div className="flex flex-col">
                           <span className="font-bold opacity-90">{session.host}</span>
                           <span className="opacity-75 text-[10px] flex items-center gap-1"><Clock size={10}/> {formatTime(startMin)} - {formatTime(startMin + (session.duration || 60))}</span>
                        </div>
                        <button onClick={() => handleRSVP(key)} className={`flex items-center gap-1 px-2 py-1 rounded shadow-sm transition-colors ${myRSVPs[key] ? 'bg-slate-900 text-white' : 'bg-white hover:bg-gray-100'}`}>
                          {myRSVPs[key] ? <Check size={12}/> : <Users size={12}/>} {session.rsvps || 0}
                        </button>
                      </div>
                    </div>
                  );
                })
              }

              {isDragging && dragRoom === room && (
                <div 
                  className="absolute left-1 right-1 bg-blue-500/90 border-l-4 border-blue-700 rounded p-2 z-50 pointer-events-none shadow-xl text-white"
                  style={{ top: `${(dragStartMin - dayStartMinutes) * PX_PER_MIN}px`, height: `${(dragCurrentMin - dragStartMin) * PX_PER_MIN}px` }}
                >
                   <div className="font-bold text-sm">New Session</div>
                   <div className="text-xs opacity-90">{formatDuration(dragCurrentMin - dragStartMin)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-lg mb-4">Add Session</h3>
            <div className="mb-4 text-xs font-mono bg-slate-100 p-2 rounded text-center">
              {formatTime(dragStartMin)} - {formatTime(dragCurrentMin)} 
              <span className="font-bold ml-2">({formatDuration(dragCurrentMin - dragStartMin)})</span>
            </div>
            <input autoFocus className="w-full mb-3 p-2 border rounded" placeholder="Title" value={tempData.title} onChange={e => setTempData({...tempData, title: e.target.value})} />
            <input className="w-full mb-4 p-2 border rounded" placeholder="Host Name" value={tempData.host} onChange={e => setTempData({...tempData, host: e.target.value})} />
            <div className="flex gap-2">
              <button onClick={saveSession} className="flex-1 bg-slate-900 text-white py-2 rounded">Save</button>
              <button onClick={() => setModalOpen(false)} className="flex-1 bg-slate-100 py-2 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between mb-6 items-center border-b pb-2">
              <h3 className="font-bold text-lg">Settings</h3>
              <button onClick={() => setShowSettings(false)}><X size={20}/></button>
            </div>

            <div className="mb-8">
              <h4 className="text-sm font-bold text-slate-500 uppercase mb-2">Duration</h4>
              <div className="flex gap-2 items-end mb-2">
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">Start Date</label>
                  <input type="date" className="w-full p-2 border rounded" 
                    value={newStartDate} onChange={e => setNewStartDate(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">End Date</label>
                  <input type="date" className="w-full p-2 border rounded" 
                    value={newEndDate} onChange={e => setNewEndDate(e.target.value)} />
                </div>
              </div>
              <button onClick={handleUpdateDates} className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Update Dates</button>
            </div>
            
            <div>
              <h4 className="text-sm font-bold text-slate-500 uppercase mb-2">Rooms</h4>
              <div className="space-y-2 mb-4">
                {safeRooms.map((r, i) => (
                  <div key={i} className="flex justify-between items-center bg-slate-50 p-2 rounded border">
                    <span className="text-sm font-medium">{r}</span>
                    <button onClick={() => handleDeleteRoom(r)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 size={16}/></button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="flex-1 p-2 border rounded text-sm" placeholder="New Room" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} />
                <button onClick={handleAddRoom} className="bg-green-600 text-white px-4 rounded hover:bg-green-700"><Plus size={20}/></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<EventGrid />} />
        <Route path="/event/:eventId" element={<EventGrid />} />
      </Routes>
    </BrowserRouter>
  );
}