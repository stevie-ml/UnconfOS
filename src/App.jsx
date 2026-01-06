import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, update, get } from "firebase/database";
import { Plus, Users, Clock, MapPin, Calendar, Share2, Settings, Trash2 } from 'lucide-react';

// --- CONFIGURATION ---
// PASTE YOUR FIREBASE CONFIG HERE
const firebaseConfig = {

// --- CONFIGURATION ---
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

// --- HELPER FUNCTIONS ---
const generateDateRange = (start, end) => {
  const dates = [];
  let current = new Date(start);
  current.setMinutes(current.getMinutes() + current.getTimezoneOffset());
  const endDate = new Date(end);
  endDate.setMinutes(endDate.getMinutes() + endDate.getTimezoneOffset());

  while (current <= endDate) {
    dates.push(current.toDateString());
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

// Generate 15-minute intervals
const generateTimeSlots = (startHour = 9, endHour = 22) => {
  const slots = [];
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hourStr = h.toString().padStart(2, '0');
      const minStr = m.toString().padStart(2, '0');
      slots.push(`${hourStr}:${minStr}`);
    }
  }
  return slots;
};

// --- COMPONENTS ---

// 1. LANDING PAGE
const CreateEvent = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    rooms: ['Main Hall', 'Dining Room']
  });

  const handleCreate = async (e) => {
    e.preventDefault();
    const eventsRef = ref(db, 'events');
    const newEventRef = await push(eventsRef, {
      config: {
        ...formData,
        startHour: 9,
        endHour: 23
      },
      schedule: {}
    });
    navigate(`/event/${newEventRef.key}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <Calendar className="text-blue-600"/> UnconfOS v2
        </h1>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Event Name</label>
            <input required className="w-full p-2 border rounded" placeholder="e.g. Second Order Retreat" 
              onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
              <input required type="date" className="w-full p-2 border rounded" 
                onChange={e => setFormData({...formData, startDate: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
              <input required type="date" className="w-full p-2 border rounded" 
                onChange={e => setFormData({...formData, endDate: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Initial Rooms</label>
            <input className="w-full p-2 border rounded" placeholder="Main Hall, Garden..." 
              value={formData.rooms.join(', ')}
              onChange={e => setFormData({...formData, rooms: e.target.value.split(',').map(s => s.trim())})} />
          </div>
          <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition">
            Create Event Grid
          </button>
        </form>
      </div>
    </div>
  );
};

// 2. THE EVENT GRID
const EventGrid = () => {
  const { eventId } = useParams();
  const [eventData, setEventData] = useState(null);
  const [dates, setDates] = useState([]);
  const [selectedDay, setSelectedDay] = useState("");
  
  // Drag Selection State
  const [isDragging, setIsDragging] = useState(false);
  const [selectionStart, setSelectionStart] = useState(null); // { timeIndex, room }
  const [selectionEnd, setSelectionEnd] = useState(null); // { timeIndex, room }
  
  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState(null); // If editing existing
  const [tempData, setTempData] = useState({ title: "", host: "", description: "" });
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");

  // Load Data
  useEffect(() => {
    const eventRef = ref(db, `events/${eventId}`);
    const unsubscribe = onValue(eventRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setEventData(data);
        const generatedDates = generateDateRange(data.config.startDate, data.config.endDate);
        setDates(generatedDates);
        if (!selectedDay) setSelectedDay(generatedDates[0]);
      }
    });
    return () => unsubscribe();
  }, [eventId]);

  // Derived Data (Time Slots)
  const timeSlots = useMemo(() => {
    if (!eventData) return [];
    return generateTimeSlots(eventData.config.startHour || 8, eventData.config.endHour || 24);
  }, [eventData]);

  // Derived Data (Processed Grid for RowSpans)
  const gridLayout = useMemo(() => {
    if (!eventData || !selectedDay) return {};
    const map = {};
    const schedule = eventData.schedule || {};

    // 1. Place all sessions
    Object.keys(schedule).forEach(key => {
      const [day, time, room] = key.split('::');
      if (day !== selectedDay) return;
      
      const session = schedule[key];
      const timeIndex = timeSlots.indexOf(time);
      if (timeIndex === -1) return;

      // Calculate span (duration / 15 mins)
      const duration = session.duration || 60; // default to 60 if missing
      const span = Math.ceil(duration / 15);

      if (!map[room]) map[room] = {};
      
      // Mark start slot
      map[room][timeIndex] = { type: 'head', span, data: session, key };

      // Mark blocked slots
      for (let i = 1; i < span; i++) {
        if (timeIndex + i < timeSlots.length) {
          map[room][timeIndex + i] = { type: 'body' };
        }
      }
    });
    return map;
  }, [eventData, selectedDay, timeSlots]);

  // --- HANDLERS ---

  const handleMouseDown = (timeIndex, room) => {
    // Only allow drag on empty slots
    if (gridLayout[room]?.[timeIndex]) return; 
    setIsDragging(true);
    setSelectionStart({ timeIndex, room });
    setSelectionEnd({ timeIndex, room });
  };

  const handleMouseEnter = (timeIndex, room) => {
    if (!isDragging || selectionStart.room !== room) return;
    setSelectionEnd({ timeIndex, room });
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    setModalOpen(true);
    setTempData({ title: "", host: "", description: "" });
  };

  const saveSession = () => {
    if (!tempData.title) return;
    
    // Calculate start time and duration
    const startIdx = Math.min(selectionStart.timeIndex, selectionEnd.timeIndex);
    const endIdx = Math.max(selectionStart.timeIndex, selectionEnd.timeIndex);
    const duration = (endIdx - startIdx + 1) * 15;
    const startTime = timeSlots[startIdx];

    const slotId = `${selectedDay}::${startTime}::${selectionStart.room}`;
    
    const newSession = { 
      ...tempData, 
      duration, 
      rsvps: 0 
    };

    const newSchedule = { ...(eventData.schedule || {}), [slotId]: newSession };
    update(ref(db, `events/${eventId}`), { schedule: newSchedule });
    setModalOpen(false);
    setEditingSession(null);
  };

  const handleDeleteSession = (key) => {
    if(!window.confirm("Delete this session?")) return;
    const newSchedule = { ...eventData.schedule };
    delete newSchedule[key];
    update(ref(db, `events/${eventId}`), { schedule: newSchedule });
  };

  const handleAddRoom = () => {
    if (!newRoomName) return;
    const newRooms = [...(eventData.config.rooms || []), newRoomName];
    update(ref(db, `events/${eventId}/config`), { rooms: newRooms });
    setNewRoomName("");
  };

  const handleDeleteRoom = (roomToDelete) => {
    if(!window.confirm(`Delete room "${roomToDelete}"? This will hide sessions in this room.`)) return;
    const newRooms = eventData.config.rooms.filter(r => r !== roomToDelete);
    update(ref(db, `events/${eventId}/config`), { rooms: newRooms });
  };

  const handleRSVP = (key) => {
    const session = eventData.schedule[key];
    update(ref(db, `events/${eventId}/schedule/${key}`), { rsvps: (session.rsvps || 0) + 1 });
  };

  if (!eventData) return <div className="p-10 text-center animate-pulse">Loading UnconfOS...</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-full px-4 py-3 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{eventData.config.name}</h1>
            <div className="flex gap-2 text-xs text-slate-500 overflow-x-auto max-w-[200px] md:max-w-none no-scrollbar">
              {dates.map(day => {
                const isSelected = selectedDay === day;
                return (
                  <button 
                    key={day} 
                    onClick={() => setSelectedDay(day)}
                    className={`whitespace-nowrap px-2 py-1 rounded transition-colors ${isSelected ? 'bg-slate-800 text-white font-bold' : 'hover:bg-slate-100'}`}
                  >
                    {day.split(' ').slice(0, 3).join(' ')}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowRoomModal(true)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-md">
              <Settings size={20}/>
            </button>
            <button onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              alert("URL copied!");
            }} className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-blue-700 flex items-center gap-1">
              <Share2 size={14}/> <span className="hidden sm:inline">Share</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 overflow-auto bg-white relative select-none">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-40 bg-slate-50 border-b border-r w-16 min-w-[4rem] text-center text-xs font-medium text-slate-400 py-2">
                Time
              </th>
              {eventData.config.rooms.map(room => (
                <th key={room} className="sticky top-0 z-30 bg-slate-50 border-b border-r min-w-[160px] text-xs font-bold text-slate-600 uppercase tracking-wider py-2 px-2 text-left">
                  {room}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((time, tIndex) => {
              const isHour = time.endsWith("00");
              return (
                <tr key={time}>
                  {/* Time Column */}
                  <td className={`sticky left-0 z-20 bg-white border-r text-[10px] text-slate-400 text-center align-top pt-1 ${isHour ? 'border-t border-slate-200 font-bold text-slate-600' : 'border-t-0'}`}>
                    {isHour ? time : <span className="opacity-0 group-hover:opacity-100">{time}</span>}
                  </td>

                  {/* Room Columns */}
                  {eventData.config.rooms.map(room => {
                    const cellData = gridLayout[room]?.[tIndex];
                    
                    // If this slot is blocked by a session above, render nothing
                    if (cellData?.type === 'body') return null;

                    // If this is the start of a session
                    if (cellData?.type === 'head') {
                      const { data, span, key } = cellData;
                      return (
                        <td 
                          key={room} 
                          rowSpan={span}
                          className="p-1 border-r border-b border-slate-100 relative group align-top"
                        >
                          <div className="h-full w-full bg-blue-100/50 hover:bg-blue-100 border-l-4 border-blue-500 rounded-r shadow-sm p-2 flex flex-col justify-between overflow-hidden relative">
                             <div className="absolute right-1 top-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/50 rounded">
                               <button onClick={() => handleDeleteSession(key)} className="p-1 hover:text-red-600"><Trash2 size={12}/></button>
                             </div>
                             <div>
                               <div className="font-bold text-sm text-blue-900 leading-tight mb-0.5">{data.title}</div>
                               <div className="text-xs text-blue-700">{data.host} • {data.duration}m</div>
                             </div>
                             <div className="mt-1 pt-1 border-t border-blue-200/50 flex justify-between items-center">
                               <button onClick={() => handleRSVP(key)} className="text-[10px] flex items-center gap-1 bg-white/50 px-1.5 rounded hover:bg-white text-blue-800">
                                 <Users size={10}/> {data.rsvps}
                               </button>
                             </div>
                          </div>
                        </td>
                      );
                    }

                    // Empty Slot
                    const isSelected = isDragging && 
                      selectionStart.room === room && 
                      tIndex >= Math.min(selectionStart.timeIndex, selectionEnd?.timeIndex) &&
                      tIndex <= Math.max(selectionStart.timeIndex, selectionEnd?.timeIndex);

                    return (
                      <td 
                        key={room}
                        onMouseDown={() => handleMouseDown(tIndex, room)}
                        onMouseEnter={() => handleMouseEnter(tIndex, room)}
                        onMouseUp={handleMouseUp}
                        className={`border-r border-slate-100 transition-colors relative h-8
                          ${isHour ? 'border-t border-slate-200' : 'border-t border-slate-50'}
                          ${isSelected ? 'bg-blue-200' : 'hover:bg-slate-50'}
                        `}
                      >
                         {/* Visual helper for "Add" on hover */}
                         {!isDragging && (
                           <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 pointer-events-none">
                             <Plus size={14} className="text-slate-300"/>
                           </div>
                         )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </main>

      {/* New Session Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-lg mb-1">Create Session</h3>
            <div className="text-xs text-slate-500 mb-4 uppercase font-bold tracking-wide">
              {timeSlots[Math.min(selectionStart.timeIndex, selectionEnd.timeIndex)]} - {timeSlots[Math.max(selectionStart.timeIndex, selectionEnd.timeIndex) + 1] || 'End'} 
              {' '}({(Math.abs(selectionEnd.timeIndex - selectionStart.timeIndex) + 1) * 15} min)
            </div>
            
            <input autoFocus className="w-full mb-3 p-2 border rounded focus:ring-2 ring-blue-500 outline-none" 
              placeholder="Session Title" 
              value={tempData.title} onChange={e => setTempData({...tempData, title: e.target.value})} />
            
            <input className="w-full mb-4 p-2 border rounded focus:ring-2 ring-blue-500 outline-none" 
              placeholder="Host Name" 
              value={tempData.host} onChange={e => setTempData({...tempData, host: e.target.value})} />

            <div className="flex gap-2">
              <button onClick={saveSession} className="flex-1 bg-blue-600 text-white py-2 rounded font-medium">Save</button>
              <button onClick={() => setModalOpen(false)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded font-medium">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Room Management Modal */}
      {showRoomModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Manage Rooms</h3>
              <button onClick={() => setShowRoomModal(false)}><X size={20}/></button>
            </div>
            
            <div className="space-y-2 mb-6 max-h-[50vh] overflow-y-auto">
              {eventData.config.rooms.map(r => (
                <div key={r} className="flex justify-between items-center bg-slate-50 p-2 rounded border">
                  <span className="font-medium text-sm">{r}</span>
                  <button onClick={() => handleDeleteRoom(r)} className="text-slate-400 hover:text-red-500 p-1">
                    <Trash2 size={16}/>
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 border-t pt-4">
               <input className="flex-1 p-2 border rounded text-sm" placeholder="New Room Name" 
                 value={newRoomName} onChange={e => setNewRoomName(e.target.value)} />
               <button onClick={handleAddRoom} className="bg-green-600 text-white px-4 rounded hover:bg-green-700">
                 <Plus size={20}/>
               </button>
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
        <Route path="/" element={<CreateEvent />} />
        <Route path="/event/:eventId" element={<EventGrid />} />
      </Routes>
    </BrowserRouter>
  );
}
