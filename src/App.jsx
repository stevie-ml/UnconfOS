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
  // fix timezone offset for accurate day calculation
  current.setMinutes(current.getMinutes() + current.getTimezoneOffset());
  
  const endDate = new Date(end);
  endDate.setMinutes(endDate.getMinutes() + endDate.getTimezoneOffset());

  while (current <= endDate) {
    dates.push(current.toDateString());
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

// --- COMPONENTS ---

// 1. LANDING PAGE (Create Event)
const CreateEvent = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    rooms: ['Main Hall', 'Dining Room'] // defaults
  });

  const handleCreate = async (e) => {
    e.preventDefault();
    const eventsRef = ref(db, 'events');
    const newEventRef = await push(eventsRef, {
      config: {
        ...formData,
        // Default hours 9am to 10pm
        hours: ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"]
      },
      schedule: {}
    });
    navigate(`/event/${newEventRef.key}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <Calendar className="text-blue-600"/> UnconfOS
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Initial Rooms (comma separated)</label>
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
  const [isEditing, setIsEditing] = useState(null); 
  const [tempData, setTempData] = useState({ title: "", host: "" });
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");

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

  const saveSchedule = (newSchedule) => {
    update(ref(db, `events/${eventId}`), { schedule: newSchedule });
  };

  const handleClaim = () => {
    if (!tempData.title) return;
    const slotId = `${selectedDay}::${isEditing.time}::${isEditing.room}`;
    const newSession = { ...tempData, rsvps: 0 };
    const newSchedule = { ...(eventData.schedule || {}), [slotId]: newSession };
    saveSchedule(newSchedule);
    setIsEditing(null);
    setTempData({ title: "", host: "" });
  };

  const handleDelete = (day, time, room) => {
    if(!window.confirm("Remove this session?")) return;
    const slotId = `${day}::${time}::${room}`;
    const newSchedule = { ...eventData.schedule };
    delete newSchedule[slotId];
    saveSchedule(newSchedule);
  };

  const handleRSVP = (day, time, room) => {
    const slotId = `${day}::${time}::${room}`;
    const session = eventData.schedule[slotId];
    const newSchedule = {
      ...eventData.schedule,
      [slotId]: { ...session, rsvps: (session.rsvps || 0) + 1 }
    };
    saveSchedule(newSchedule);
  };

  const handleAddRoom = () => {
    if (!newRoomName) return;
    const newRooms = [...(eventData.config.rooms || []), newRoomName];
    update(ref(db, `events/${eventId}/config`), { rooms: newRooms });
    setNewRoomName("");
    setShowRoomModal(false);
  };

  if (!eventData) return <div className="p-10 text-center">Loading Event...</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{eventData.config.name}</h1>
            <p className="text-xs text-slate-500">Unconference Scheduler</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowRoomModal(true)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-md flex items-center gap-1 text-sm">
              <Settings size={16}/> Rooms
            </button>
            <button onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              alert("URL copied to clipboard!");
            }} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
              <Share2 size={16}/> Share
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {/* Day Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-2">
          {dates.map(day => (
            <button key={day} onClick={() => setSelectedDay(day)}
              className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-colors ${
                selectedDay === day ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}>
              {day.split(' ').slice(0, 3).join(' ')}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr>
                  <th className="p-3 text-left bg-slate-50 border-b border-r w-24 sticky left-0 z-10 text-xs font-bold text-slate-400 uppercase tracking-wider">Time</th>
                  {eventData.config.rooms.map(room => (
                    <th key={room} className="p-3 text-left bg-slate-50 border-b min-w-[200px] text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {room}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventData.config.hours.map((time) => (
                  <tr key={time}>
                    <td className="p-3 border-b border-r bg-slate-50 text-xs font-mono text-slate-500 sticky left-0 z-10">{time}</td>
                    {eventData.config.rooms.map((room) => {
                      const slotId = `${selectedDay}::${time}::${room}`;
                      const session = eventData.schedule ? eventData.schedule[slotId] : null;

                      return (
                        <td key={room} className="p-1 border-b border-r border-slate-100 h-28 align-top w-64">
                          {session ? (
                            <div className="h-full bg-blue-50/50 hover:bg-blue-50 border border-blue-100 rounded p-2 flex flex-col justify-between group relative">
                              <button onClick={() => handleDelete(selectedDay, time, room)} 
                                className="absolute top-1 right-1 text-blue-300 hover:text-red-500 opacity-0 group-hover:opacity-100">
                                <Trash2 size={12}/>
                              </button>
                              <div>
                                <div className="font-bold text-sm text-slate-800 leading-tight mb-1">{session.title}</div>
                                <div className="text-xs text-slate-500">{session.host}</div>
                              </div>
                              <button onClick={() => handleRSVP(selectedDay, time, room)} 
                                className="self-start text-xs flex items-center gap-1 text-blue-600 hover:bg-blue-100 px-1.5 py-0.5 rounded transition">
                                <Users size={10} /> {session.rsvps}
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setIsEditing({ time, room })}
                              className="w-full h-full flex items-center justify-center text-slate-200 hover:text-blue-400 hover:bg-slate-50 rounded transition-all">
                              <Plus size={16} />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Claim Slot Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-lg mb-4">Add Session</h3>
            <div className="text-sm text-slate-500 mb-4">{selectedDay} @ {isEditing.time} in {isEditing.room}</div>
            <input autoFocus className="w-full mb-3 p-2 border rounded" placeholder="Session Title" 
              value={tempData.title} onChange={e => setTempData({...tempData, title: e.target.value})} />
            <input className="w-full mb-4 p-2 border rounded" placeholder="Your Name" 
              value={tempData.host} onChange={e => setTempData({...tempData, host: e.target.value})} />
            <div className="flex gap-2">
              <button onClick={handleClaim} className="flex-1 bg-blue-600 text-white py-2 rounded">Save</button>
              <button onClick={() => setIsEditing(null)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Room Modal */}
      {showRoomModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-lg mb-4">Manage Rooms</h3>
            <div className="mb-4">
               <div className="flex flex-wrap gap-2 mb-4">
                 {eventData.config.rooms.map(r => (
                   <span key={r} className="bg-slate-100 px-2 py-1 rounded text-sm border">{r}</span>
                 ))}
               </div>
               <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Add New Room</label>
               <input className="w-full p-2 border rounded" placeholder="e.g. The Library" 
                 value={newRoomName} onChange={e => setNewRoomName(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddRoom} className="flex-1 bg-green-600 text-white py-2 rounded">Add Room</button>
              <button onClick={() => setShowRoomModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- APP ROOT ---
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