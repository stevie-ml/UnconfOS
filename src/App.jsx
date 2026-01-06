import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, update } from "firebase/database";
import { Plus, Users, Settings, Trash2, Share2, Calendar, X, Check } from 'lucide-react';

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

// --- HELPERS ---

// Hardcoded distinct colors to ensure visibility
const HOST_COLORS = [
  { bg: '#fee2e2', border: '#b91c1c', text: '#7f1d1d' }, // Red
  { bg: '#ffedd5', border: '#c2410c', text: '#7c2d12' }, // Orange
  { bg: '#fef3c7', border: '#b45309', text: '#78350f' }, // Amber
  { bg: '#dcfce7', border: '#15803d', text: '#14532d' }, // Green
  { bg: '#ccfbf1', border: '#0f766e', text: '#134e4a' }, // Teal
  { bg: '#dbeafe', border: '#1d4ed8', text: '#1e3a8a' }, // Blue
  { bg: '#e0e7ff', border: '#4338ca', text: '#312e81' }, // Indigo
  { bg: '#f3e8ff', border: '#7e22ce', text: '#581c87' }, // Purple
  { bg: '#fae8ff', border: '#a21caf', text: '#701a75' }, // Fuchsia
  { bg: '#fce7f3', border: '#be185d', text: '#831843' }, // Pink
];

const getHostStyle = (name) => {
  if (!name) return { backgroundColor: '#f1f5f9', borderColor: '#94a3b8', color: '#334155' };
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return HOST_COLORS[Math.abs(hash) % HOST_COLORS.length];
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

const generateTimeSlots = (startHour = 9, endHour = 22) => {
  const slots = [];
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += 15) {
      slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
  }
  return slots;
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
      config: { ...formData, startHour: 9, endHour: 23 },
      schedule: {}
    });
    navigate(`/event/${newEventRef.key}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Calendar className="text-blue-600"/> UnconfOS v2.2</h1>
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
  const [isDragging, setIsDragging] = useState(false);
  const [selectionStart, setSelectionStart] = useState(null); 
  const [selectionEnd, setSelectionEnd] = useState(null); 
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

  const timeSlots = useMemo(() => {
    if (!eventData?.config) return [];
    return generateTimeSlots(eventData.config.startHour || 8, eventData.config.endHour || 24);
  }, [eventData]);

  const gridLayout = useMemo(() => {
    if (!eventData?.schedule || !selectedDay) return {};
    const map = {};
    Object.keys(eventData.schedule).forEach(key => {
      const [day, time, room] = key.split('::');
      if (day !== selectedDay) return;
      const session = eventData.schedule[key];
      const timeIndex = timeSlots.indexOf(time);
      if (timeIndex === -1) return;

      const span = Math.ceil((session.duration || 60) / 15);
      if (!map[room]) map[room] = {};
      map[room][timeIndex] = { type: 'head', span, data: session, key };
      for (let i = 1; i < span; i++) {
        if (timeIndex + i < timeSlots.length) map[room][timeIndex + i] = { type: 'body' };
      }
    });
    return map;
  }, [eventData, selectedDay, timeSlots]);

  const handleMouseDown = (timeIndex, room) => {
    if (gridLayout[room]?.[timeIndex]) return; 
    setIsDragging(true);
    setSelectionStart({ timeIndex, room });
    setSelectionEnd({ timeIndex, room });
  };

  const handleMouseEnter = (timeIndex, room) => {
    if (isDragging && selectionStart.room === room) setSelectionEnd({ timeIndex, room });
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
    const startIdx = Math.min(selectionStart.timeIndex, selectionEnd.timeIndex);
    const endIdx = Math.max(selectionStart.timeIndex, selectionEnd.timeIndex);
    const duration = (endIdx - startIdx + 1) * 15;
    const slotId = `${selectedDay}::${timeSlots[startIdx]}::${safeKey(selectionStart.room)}`;
    
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
    const currentCount = session.rsvps || 0;
    const newCount = isRSVPd ? Math.max(0, currentCount - 1) : currentCount + 1;
    update(ref(db, `events/${eventId}/schedule/${key}`), { rsvps: newCount });
    const newLocalState = { ...myRSVPs, [key]: !isRSVPd };
    setMyRSVPs(newLocalState);
    localStorage.setItem(`rsvps_${eventId}`, JSON.stringify(newLocalState));
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

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col">
      <header className="bg-white border-b sticky top-0 z-50 px-4 py-3 shadow-sm flex justify-between items-center">
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

      <main className="flex-1 overflow-auto relative select-none pb-20">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-40 bg-white border-b border-r w-14 text-center text-[10px] text-slate-400 font-medium py-2">Time</th>
              {rooms.map(r => <th key={r} className="sticky top-0 z-30 bg-white border-b border-r min-w-[150px] text-xs font-bold text-slate-700 py-2 px-2 text-left">{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((time, tIndex) => {
              const isHour = time.endsWith("00");
              return (
                <tr key={time} style={{ height: '40px' }}> {/* Forced Height */}
                  <td className={`sticky left-0 z-20 bg-white border-r text-[10px] text-slate-400 text-center pt-1 align-top ${isHour ? 'border-t border-slate-200 font-bold' : 'border-t-0'}`}>{isHour ? time : ''}</td>
                  {rooms.map(room => {
                    const cell = gridLayout[room]?.[tIndex];
                    if (cell?.type === 'body') return null;
                    if (cell?.type === 'head') {
                      const { data, span, key } = cell;
                      const styles = getHostStyle(data.host);
                      return (
                        <td key={room} rowSpan={span} className="p-0 border-r border-b border-slate-100 relative group align-top"> {/* P-0 removes padding */}
                          <div 
                            style={{ backgroundColor: styles.bg, color: styles.text, borderLeftColor: styles.border }}
                            className="h-full w-full border-l-4 p-2 flex flex-col justify-between overflow-hidden shadow-sm"
                          >
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-xs leading-tight line-clamp-2">{data.title}</span>
                              <button onClick={() => handleDeleteSession(key)} className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-600"><Trash2 size={12}/></button>
                            </div>
                            <div className="mt-1 flex justify-between items-end">
                               <span className="text-[10px] opacity-90 font-medium truncate max-w-[70%]">{data.host}</span>
                               <button onClick={() => handleRSVP(key)} className={`text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${myRSVPs[key] ? 'bg-slate-900 text-white' : 'bg-white/50 hover:bg-white'}`}>
                                 {myRSVPs[key] ? <Check size={10}/> : <Users size={10}/>} {data.rsvps || 0}
                               </button>
                            </div>
                          </div>
                        </td>
                      );
                    }
                    const isSelected = isDragging && selectionStart.room === room && tIndex >= Math.min(selectionStart.timeIndex, selectionEnd?.timeIndex) && tIndex <= Math.max(selectionStart.timeIndex, selectionEnd?.timeIndex);
                    return (
                      <td key={room} 
                        onMouseDown={() => handleMouseDown(tIndex, room)} 
                        onMouseEnter={() => handleMouseEnter(tIndex, room)} 
                        onMouseUp={handleMouseUp} 
                        className={`border-r relative transition-colors ${isHour ? 'border-t border-slate-200' : 'border-t border-slate-50'} ${isSelected ? 'bg-blue-100' : 'hover:bg-slate-50'}`}
                      >
                         {!isDragging && <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 pointer-events-none"><Plus size={14} className="text-slate-300"/></div>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </main>

      {/* Modal for Creating Session */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-lg mb-4">Add Session</h3>
            <div className="mb-4 text-xs font-mono bg-slate-100 p-2 rounded">
              {timeSlots[Math.min(selectionStart.timeIndex, selectionEnd.timeIndex)]} - {timeSlots[Math.max(selectionStart.timeIndex, selectionEnd.timeIndex) + 1] || 'End'}
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

      {/* Modal for Rooms */}
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