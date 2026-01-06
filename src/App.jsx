import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, update } from "firebase/database";
import { Users, Settings, Trash2, Share2, Calendar, X, Check, Clock } from 'lucide-react';

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
const PX_PER_MIN = 2; 
const SLOT_MINUTES = 15;

// --- HELPERS ---
const getMinutes = (timeStr) => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const formatTime = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const COLORS = [
  { bg: '#fee2e2', border: '#ef4444', text: '#7f1d1d' }, // Red
  { bg: '#ffedd5', border: '#f97316', text: '#7c2d12' }, // Orange
  { bg: '#fef9c3', border: '#eab308', text: '#713f12' }, // Yellow
  { bg: '#dcfce7', border: '#22c55e', text: '#14532d' }, // Green
  { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a' }, // Blue
  { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' }, // Violet
  { bg: '#fae8ff', border: '#d946ef', text: '#701a75' }, // Fuchsia
  { bg: '#fce7f3', border: '#db2777', text: '#831843' }, // Pink
  { bg: '#f1f5f9', border: '#64748b', text: '#0f172a' }, // Slate
  { bg: '#ccfbf1', border: '#14b8a6', text: '#134e4a' }, // Teal
];

const getHostColor = (name) => {
  if (!name) return COLORS[8]; // Default Slate
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
};

const generateDateRange = (startStr, endStr) => {
  if (!startStr || !endStr) return [];
  const dates = [];
  let current = new Date(startStr + "T12:00:00");
  const end = new Date(endStr + "T12:00:00");
  while (current <= end) {
    dates.push(current.toDateString());
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const safeKey = (str) => str.replace(/[.#$[\]]/g, "");

// --- COMPONENTS ---

const CreateEvent = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ name: '', startDate: '', endDate: '', rooms: ['Main Hall', 'Dining Room'] });

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.startDate || !formData.endDate) { alert("Please select dates"); return; }
    const eventsRef = ref(db, 'events');
    const newEventRef = await push(eventsRef, {
      config: { ...formData, startHour: 8, endHour: 24 }, // Default config
      schedule: {}
    });
    navigate(`/event/${newEventRef.key}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Calendar className="text-blue-600"/> UnconfOS v4.0</h1>
        <form onSubmit={handleCreate} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">Event Name</label><input required className="w-full p-2 border rounded" placeholder="e.g. Retreat" onChange={e => setFormData({...formData, name: e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Start</label><input required type="date" className="w-full p-2 border rounded" onChange={e => setFormData({...formData, startDate: e.target.value})} /></div>
            <div><label className="block text-sm font-medium mb-1">End</label><input required type="date" className="w-full p-2 border rounded" onChange={e => setFormData({...formData, endDate: e.target.value})} /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">Rooms</label><input className="w-full p-2 border rounded" placeholder="Main Hall, Garden..." value={formData.rooms.join(', ')} onChange={e => setFormData({...formData, rooms: e.target.value.split(',').map(s => s.trim())})} /></div>
          <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">Create Event Grid</button>
        </form>
      </div>
    </div>
  );
};

const EventGrid = () => {
  const { eventId } = useParams();
  const [eventData, setEventData] = useState(null);
  const [dates, setDates] = useState([]);
  const [selectedDay, setSelectedDay] = useState("");
  
  // Drag State
  const [isDragging, setIsDragging] = useState(false);
  const [dragRoom, setDragRoom] = useState(null);
  const [dragStartMin, setDragStartMin] = useState(null);
  const [dragCurrentMin, setDragCurrentMin] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [tempData, setTempData] = useState({ title: "", host: "" });
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [myRSVPs, setMyRSVPs] = useState({});

  useEffect(() => {
    const saved = localStorage.getItem(`rsvps_${eventId}`);
    if (saved) setMyRSVPs(JSON.parse(saved));
    const unsubscribe = onValue(ref(db, `events/${eventId}`), (snapshot) => {
      const data = snapshot.val();
      if (data && data.config) {
        setEventData(data);
        const d = generateDateRange(data.config.startDate, data.config.endDate);
        setDates(d);
        if (!selectedDay && d.length > 0) setSelectedDay(d[0]);
      }
    });
    return () => unsubscribe();
  }, [eventId]);

  const startHour = eventData?.config?.startHour || 8;
  const endHour = eventData?.config?.endHour || 24;
  const dayStartMinutes = startHour * 60;
  const totalHeight = (endHour - startHour) * 60 * PX_PER_MIN;

  const handleCanvasMouseDown = (e, room) => {
    // Only left click
    if (e.button !== 0) return;
    
    // Calculate minutes from top of room column
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top + e.currentTarget.scrollTop;
    const minutes = Math.floor(y / PX_PER_MIN) + dayStartMinutes;
    
    // Snap to 15m
    const snapped = Math.floor(minutes / 15) * 15;
    
    setIsDragging(true);
    setDragRoom(room);
    setDragStartMin(snapped);
    setDragCurrentMin(snapped + 15); // Default 15m duration
  };

  const handleCanvasMouseMove = (e) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top; // Relative to viewport/container
    const minutes = Math.floor(y / PX_PER_MIN) + dayStartMinutes;
    const snapped = Math.ceil(minutes / 15) * 15;
    
    // Ensure we don't drag backwards past start
    if (snapped > dragStartMin) {
      setDragCurrentMin(snapped);
    }
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

  const handleDeleteSession = (key) => {
    if(window.confirm("Delete this session?")) {
      update(ref(db, `events/${eventId}/schedule/${key}`), null);
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

  const handleAddRoom = () => {
    if (!newRoomName) return;
    update(ref(db, `events/${eventId}/config/rooms`), [...(eventData.config.rooms || []), safeKey(newRoomName)]);
    setNewRoomName("");
  };

  const handleDeleteRoom = (r) => {
    if(window.confirm("Delete room?")) {
      update(ref(db, `events/${eventId}/config/rooms`), eventData.config.rooms.filter(room => room !== r));
    }
  };

  if (!eventData) return <div className="p-10 text-center">Loading...</div>;
  const rooms = eventData.config.rooms || [];

  // Generate Hour Markers
  const hourMarkers = [];
  for (let h = startHour; h < endHour; h++) {
    hourMarkers.push(h);
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col h-screen overflow-hidden" onMouseUp={handleMouseUp}>
      <header className="bg-white border-b z-50 px-4 py-3 shadow-sm flex-none flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">{eventData.config.name}</h1>
          <div className="flex gap-2 mt-1 overflow-x-auto no-scrollbar">
            {dates.map(day => (
              <button key={day} onClick={() => setSelectedDay(day)} className={`px-2 py-1 rounded text-xs font-bold transition-colors ${selectedDay === day ? 'bg-slate-800 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>
                {day.split(' ').slice(0, 3).join(' ')}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowRoomModal(true)} className="p-2 hover:bg-slate-100 rounded"><Settings size={20}/></button>
          <button onClick={() => navigator.clipboard.writeText(window.location.href)} className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700"><Share2 size={20}/></button>
        </div>
      </header>

      {/* Main Grid Canvas */}
      <main className="flex-1 overflow-auto flex relative bg-white select-none">
        
        {/* Time Gutter */}
        <div className="sticky left-0 bg-white z-20 border-r w-14 flex-none" style={{ height: totalHeight }}>
          {hourMarkers.map(h => (
            <div key={h} className="absolute w-full text-center text-xs text-slate-400 font-bold border-t border-transparent" 
                 style={{ top: (h * 60 - dayStartMinutes) * PX_PER_MIN, transform: 'translateY(-50%)' }}>
              {h}:00
            </div>
          ))}
        </div>

        {/* Rooms Canvas */}
        <div className="flex flex-1 min-w-0" style={{ height: totalHeight }}>
          {rooms.map(room => (
            <div 
              key={room} 
              className="flex-1 min-w-[150px] border-r relative bg-slate-50/30 group"
              onMouseDown={(e) => handleCanvasMouseDown(e, room)}
              onMouseMove={handleCanvasMouseMove}
            >
              {/* Header */}
              <div className="sticky top-0 bg-white/95 backdrop-blur border-b z-30 p-2 text-center text-sm font-bold text-slate-700 uppercase tracking-wide">
                {room}
              </div>

              {/* Background Lines */}
              {hourMarkers.map(h => (
                <div key={h} className="absolute w-full border-t border-slate-200" style={{ top: (h * 60 - dayStartMinutes) * PX_PER_MIN }}></div>
              ))}
              {/* 15m lines (faint) */}
              {hourMarkers.map(h => [15,30,45].map(m => (
                 <div key={`${h}-${m}`} className="absolute w-full border-t border-slate-100" style={{ top: ((h * 60 + m) - dayStartMinutes) * PX_PER_MIN }}></div>
              )))}

              {/* Existing Events */}
              {Object.entries(eventData.schedule || {})
                .filter(([key]) => key.startsWith(`${selectedDay}::`) && key.endsWith(`::${room}`))
                .map(([key, session]) => {
                  const [_, timeStr] = key.split('::');
                  const startMin = getMinutes(timeStr);
                  const top = (startMin - dayStartMinutes) * PX_PER_MIN;
                  const height = (session.duration || 60) * PX_PER_MIN;
                  const styles = getHostColor(session.host);
                  
                  return (
                    <div 
                      key={key}
                      onMouseDown={(e) => e.stopPropagation()} // Prevent dragging existing events
                      style={{ 
                        top: `${top}px`, 
                        height: `${Math.max(height, 20)}px`, // Min height safety
                        backgroundColor: styles.bg,
                        borderColor: styles.border,
                        color: styles.text,
                      }}
                      className="absolute left-1 right-1 border-l-4 rounded p-2 text-xs flex flex-col justify-between shadow-sm z-10 overflow-hidden hover:z-20 hover:shadow-md transition-shadow cursor-default"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold leading-tight">{session.title}</span>
                        <button onClick={() => handleDeleteSession(key)} className="hover:text-red-600 p-0.5"><Trash2 size={12}/></button>
                      </div>
                      <div className="flex justify-between items-end mt-1">
                        <div className="flex flex-col">
                           <span className="opacity-90 font-medium">{session.host}</span>
                           <span className="opacity-75 text-[10px]">{formatTime(startMin)} - {formatTime(startMin + (session.duration || 60))}</span>
                        </div>
                        <button onClick={() => handleRSVP(key)} className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${myRSVPs[key] ? 'bg-slate-900 text-white' : 'bg-white/60 hover:bg-white'}`}>
                          {myRSVPs[key] ? <Check size={10}/> : <Users size={10}/>} {session.rsvps || 0}
                        </button>
                      </div>
                    </div>
                  );
                })
              }

              {/* Ghost Event (During Drag) */}
              {isDragging && dragRoom === room && (
                <div 
                  className="absolute left-1 right-1 bg-blue-500/20 border-l-4 border-blue-500 rounded p-2 z-20 pointer-events-none"
                  style={{
                    top: `${(dragStartMin - dayStartMinutes) * PX_PER_MIN}px`,
                    height: `${(dragCurrentMin - dragStartMin) * PX_PER_MIN}px`
                  }}
                >
                   <div className="text-blue-900 font-bold text-xs">New Session</div>
                   <div className="text-blue-800 text-xs">{formatTime(dragStartMin)} - {formatTime(dragCurrentMin)}</div>
                </div>
              )}

            </div>
          ))}
        </div>
      </main>

      {/* Creation Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-lg mb-4">Add Session</h3>
            <div className="mb-4 text-xs font-mono bg-slate-100 p-2 rounded text-center">
              {formatTime(dragStartMin)} - {formatTime(dragCurrentMin)} 
              <span className="text-slate-500 ml-2">({dragCurrentMin - dragStartMin} min)</span>
            </div>
            <input autoFocus className="w-full mb-3 p-2 border rounded" placeholder="Title" value={tempData.title} onChange={e => setTempData({...tempData, title: e.target.value})} />
            <input className="w-full mb-4 p-2 border rounded" placeholder="Host Name (Sets Color)" value={tempData.host} onChange={e => setTempData({...tempData, host: e.target.value})} />
            <div className="flex gap-2">
              <button onClick={saveSession} className="flex-1 bg-slate-900 text-white py-2 rounded">Save</button>
              <button onClick={() => setModalOpen(false)} className="flex-1 bg-slate-100 py-2 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Room Modal */}
      {showRoomModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <div className="flex justify-between mb-4"><h3 className="font-bold">Rooms</h3><button onClick={() => setShowRoomModal(false)}><X size={20}/></button></div>
            <div className="space-y-2 mb-4 max-h-[40vh] overflow-y-auto">{rooms.map(r => (
              <div key={r} className="flex justify-between p-2 bg-slate-50 rounded border"><span className="text-sm">{r}</span><button onClick={() => handleDeleteRoom(r)}><Trash2 size={14} className="text-red-400"/></button></div>
            ))}</div>
            <div className="flex gap-2"><input className="flex-1 p-2 border rounded text-sm" placeholder="New Room" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} /><button onClick={handleAddRoom} className="bg-green-600 text-white px-3 rounded"><Plus/></button></div>
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
        <Route path="/" element={<CreateEvent />} />
        <Route path="/event/:eventId" element={<EventGrid />} />
      </Routes>
    </BrowserRouter>
  );
}