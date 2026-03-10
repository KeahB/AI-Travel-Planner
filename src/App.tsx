import React, { useState, useEffect, useRef } from 'react';
import { 
  Plane, 
  MapPin, 
  Calendar, 
  Wallet, 
  Heart, 
  Plus, 
  History, 
  Download, 
  LogOut, 
  LogIn, 
  Loader2, 
  Trash2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  X,
  Sparkles,
  ArrowRight,
  Compass,
  Globe,
  Navigation
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { jsPDF } from 'jspdf';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  deleteDoc, 
  doc,
  updateDoc,
  serverTimestamp,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { generateItinerary } from './services/gemini';
import { searchLocation, searchWiki } from './services/api';
import { WikiImage } from './components/WikiImage';
import { WeatherWidget } from './components/WeatherWidget';
import { Chatbot } from './components/Chatbot';
import { Itinerary } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const POPULAR_DESTINATIONS = [
  "Paris, France", "London, UK", "Tokyo, Japan", "New York City, USA", 
  "Rome, Italy", "Barcelona, Spain", "Dubai, UAE", "Singapore", 
  "Amsterdam, Netherlands", "Seoul, South Korea", "Bangkok, Thailand", 
  "Istanbul, Turkey", "Kyoto, Japan", "Bali, Indonesia", "Sydney, Australia", 
  "Los Angeles, USA", "San Francisco, USA", "Las Vegas, USA", "Miami, USA", 
  "Honolulu, Hawaii", "Cancun, Mexico", "Rio de Janeiro, Brazil", 
  "Buenos Aires, Argentina", "Cape Town, South Africa", "Cairo, Egypt", 
  "Marrakech, Morocco", "Athens, Greece", "Santorini, Greece", 
  "Prague, Czech Republic", "Vienna, Austria", "Budapest, Hungary", 
  "Lisbon, Portugal", "Madrid, Spain", "Berlin, Germany", "Munich, Germany", 
  "Zurich, Switzerland", "Geneva, Switzerland", "Stockholm, Sweden", 
  "Copenhagen, Denmark", "Oslo, Norway", "Helsinki, Finland", 
  "Reykjavik, Iceland", "Toronto, Canada", "Vancouver, Canada", 
  "Montreal, Canada", "Mexico City, Mexico", "Lima, Peru", "Cusco, Peru", 
  "Santiago, Chile", "Bogota, Colombia", "Medellin, Colombia", 
  "Taipei, Taiwan", "Hong Kong", "Macau", "Beijing, China", "Shanghai, China", 
  "Mumbai, India", "New Delhi, India", "Goa, India", "Maldives", 
  "Phuket, Thailand", "Hanoi, Vietnam", "Ho Chi Minh City, Vietnam", 
  "Kuala Lumpur, Malaysia", "Manila, Philippines", "Boracay, Philippines", 
  "Auckland, New Zealand", "Queenstown, New Zealand", "Fiji", 
  "Bora Bora, French Polynesia"
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savedItineraries, setSavedItineraries] = useState<Itinerary[]>([]);
  const [currentItinerary, setCurrentItinerary] = useState<string | null>(null);
  const [currentItineraryId, setCurrentItineraryId] = useState<string | null>(null);
  const [locationDetails, setLocationDetails] = useState<any>(null);
  const [wikiDetails, setWikiDetails] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  
  // Feedback State
  const [rating, setRating] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  
  // Form State
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budget, setBudget] = useState<'economy' | 'moderate' | 'luxury'>('moderate');
  const [numericBudget, setNumericBudget] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [newInterest, setNewInterest] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filteredDestinations = POPULAR_DESTINATIONS.filter(d => 
    d.toLowerCase().includes(destination.toLowerCase())
  ).slice(0, 5);

  const plannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setSavedItineraries([]);
      return;
    }

    const q = query(
      collection(db, 'itineraries'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Itinerary[];
      setSavedItineraries(docs);
    }, (error) => {
      console.error("Firestore Error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleAddInterest = (e: React.FormEvent) => {
    e.preventDefault();
    if (newInterest.trim() && !interests.includes(newInterest.trim())) {
      setInterests([...interests, newInterest.trim()]);
      setNewInterest('');
    }
  };

  const removeInterest = (interest: string) => {
    setInterests(interests.filter(i => i !== interest));
  };

  const handleGenerate = async () => {
    if (!destination || !startDate || !endDate) return;
    
    setGenerating(true);
    setCurrentItinerary(null);
    setCurrentItineraryId(null);
    setLocationDetails(null);
    setWikiDetails(null);
    setRating(0);
    setFeedback('');
    setFeedbackSubmitted(false);
    
    try {
      // Fetch place details in parallel
      const [content, locationData, wikiData] = await Promise.allSettled([
        generateItinerary({
          destination,
          startDate,
          endDate,
          budget,
          numericBudget,
          interests
        }),
        searchLocation(destination),
        searchWiki(destination)
      ]);
      
      if (content.status === 'fulfilled') {
        setCurrentItinerary(content.value || "Failed to generate itinerary.");
      } else {
        throw new Error("Failed to generate itinerary");
      }

      if (locationData.status === 'fulfilled') {
        setLocationDetails(locationData.value);
      }
      
      if (wikiData.status === 'fulfilled') {
        setWikiDetails(wikiData.value);
      }
      
      if (user && content.status === 'fulfilled' && content.value) {
        const docRef = await addDoc(collection(db, 'itineraries'), {
          destination,
          startDate,
          endDate,
          budget,
          numericBudget,
          interests,
          content: content.value,
          userId: user.uid,
          createdAt: serverTimestamp()
        });
        setCurrentItineraryId(docRef.id);
      }
    } catch (error) {
      console.error("Generation error:", error);
      alert("Something went wrong while generating your itinerary.");
    } finally {
      setGenerating(false);
    }
  };

  const scrollToPlanner = () => {
    plannerRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const exportToPDF = () => {
    if (!currentItinerary) return;
    const doc = new jsPDF();
    const splitText = doc.splitTextToSize(currentItinerary, 180);
    doc.text(splitText, 15, 15);
    doc.save(`itinerary-${destination || 'trip'}.pdf`);
  };

  const handleFeedbackSubmit = async () => {
    if (!currentItineraryId || !user || rating === 0) return;
    try {
      await updateDoc(doc(db, 'itineraries', currentItineraryId), {
        rating,
        feedback
      });
      setFeedbackSubmitted(true);
    } catch (error) {
      console.error("Error submitting feedback:", error);
      alert("Failed to submit feedback. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-cream">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Globe className="w-10 h-10 text-brand-sunset" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-900 font-sans selection:bg-brand-peach/30 selection:text-brand-sunset">
      {/* Navigation */}
      <nav className={cn(
        "fixed top-0 left-0 right-0 z-[100] transition-all duration-500 px-6 py-4",
        isScrolled ? "bg-brand-cream/80 backdrop-blur-xl border-b border-brand-sand py-3 shadow-sm" : "bg-transparent py-6"
      )}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="bg-brand-sunset p-2 rounded-xl group-hover:rotate-12 transition-transform shadow-lg shadow-brand-sunset/20">
              <Navigation className="w-5 h-5 text-white" />
            </div>
            <span className={cn(
              "text-2xl font-extrabold tracking-tight transition-colors duration-300",
              isScrolled ? "text-slate-900" : "text-white"
            )}>Vagabond<span className="text-brand-peach">AI</span></span>
          </div>

          <div className="flex items-center gap-8">
            {user ? (
              <div className="flex items-center gap-6">
                <button 
                  onClick={() => setShowHistory(true)}
                  className={cn(
                    "text-sm font-bold transition-colors flex items-center gap-2",
                    isScrolled ? "text-slate-600 hover:text-brand-sunset" : "text-white/80 hover:text-white"
                  )}
                >
                  <History className="w-4 h-4" />
                  History
                </button>
                <div className={cn("h-4 w-px transition-colors", isScrolled ? "bg-slate-200" : "bg-white/20")} />
                <div className="flex items-center gap-3">
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt="User" 
                      className="w-9 h-9 rounded-full border-2 border-brand-peach/50 p-0.5"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full border-2 border-brand-peach/50 p-0.5 bg-brand-sunset flex items-center justify-center text-white font-bold text-sm">
                      {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <button 
                    onClick={handleLogout} 
                    className={cn(
                      "transition-colors",
                      isScrolled ? "text-slate-400 hover:text-red-500" : "text-white/60 hover:text-white"
                    )}
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className={cn(
                  "px-8 py-3 rounded-full font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-2 shadow-lg",
                  isScrolled 
                    ? "bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200" 
                    : "bg-brand-cream text-slate-900 hover:bg-brand-sand shadow-black/10"
                )}
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-48 pb-32 px-6 overflow-hidden min-h-[90vh] flex items-center">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 -z-10">
          <img 
            src="https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&q=80&w=2070" 
            alt="Travel Background" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/70 via-slate-900/40 to-brand-cream" />
        </div>
        
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-brand-sunset/20 backdrop-blur-md text-brand-peach rounded-full text-xs font-bold uppercase tracking-wider mb-8 border border-brand-sunset/30">
              <Sparkles className="w-3 h-3" />
              Next-Gen Travel Planning
            </span>
            <h1 className="text-6xl md:text-9xl font-extrabold tracking-tighter text-white mb-8 leading-[0.85]">
              Your Next <span className="font-serif italic font-normal text-brand-peach">Adventure</span>, <br />
              Planned by AI.
            </h1>
            <p className="text-xl md:text-2xl text-slate-200 mb-12 max-w-2xl mx-auto leading-relaxed font-medium text-balance">
              Stop spending hours on research. Get a personalized, day-by-day itinerary tailored to your budget and interests in seconds.
            </p>
            <div className="flex flex-wrap justify-center gap-6">
              <button 
                onClick={scrollToPlanner}
                className="bg-brand-sunset text-white px-10 py-5 rounded-2xl font-bold text-xl hover:bg-brand-sunset/90 transition-all hover:scale-105 shadow-2xl shadow-brand-sunset/20 flex items-center gap-3 group"
              >
                Start Planning
                <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </button>
              {!user && (
                <button 
                  onClick={handleLogin}
                  className="bg-white/10 backdrop-blur-md text-white border border-white/20 px-10 py-5 rounded-2xl font-bold text-xl hover:bg-white/20 transition-all shadow-xl"
                >
                  Join Vagabond
                </button>
              )}
            </div>
          </motion.div>
        </div>

        {/* Floating Elements */}
        <div className="hidden lg:block">
          <motion.div 
            animate={{ y: [0, -20, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-40 left-20 bg-brand-cream/90 backdrop-blur-sm p-4 rounded-2xl shadow-xl border border-brand-sand flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-brand-mint rounded-xl flex items-center justify-center text-brand-sunset">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Destination</p>
              <p className="font-bold">Tokyo, Japan</p>
            </div>
          </motion.div>

          <motion.div 
            animate={{ y: [0, 20, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-40 right-20 bg-brand-cream/90 backdrop-blur-sm p-4 rounded-2xl shadow-xl border border-brand-sand flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-brand-peach/20 rounded-xl flex items-center justify-center text-brand-sunset">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Budget</p>
              <p className="font-bold">Moderate</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Main App Section */}
      <section ref={plannerRef} className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Planner Card */}
          <div className="lg:col-span-5">
            <div className="sticky top-24">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="bg-brand-cream/80 backdrop-blur-md p-8 rounded-[32px] shadow-2xl shadow-brand-sand/30 border border-brand-sand"
              >
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-12 h-12 bg-brand-mint rounded-2xl flex items-center justify-center text-brand-sunset">
                    <Compass className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-extrabold tracking-tight">Trip Details</h2>
                    <p className="text-slate-400 text-sm">Tell us where you want to go</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="group relative">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Destination</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-brand-sunset transition-colors" />
                      <input 
                        type="text" 
                        value={destination}
                        onChange={(e) => {
                          setDestination(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        placeholder="Where to?"
                        className="w-full pl-12 pr-4 py-4 bg-brand-cream/50 border-2 border-transparent rounded-2xl focus:bg-brand-cream focus:border-brand-sunset outline-none transition-all font-semibold"
                      />
                    </div>
                    {/* Autocomplete Dropdown */}
                    <AnimatePresence>
                      {showSuggestions && destination && filteredDestinations.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute z-50 w-full mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden"
                        >
                          {filteredDestinations.map((dest) => (
                            <div
                              key={dest}
                              onClick={() => {
                                setDestination(dest);
                                setShowSuggestions(false);
                              }}
                              className="px-4 py-3 hover:bg-brand-cream/50 cursor-pointer transition-colors flex items-center gap-3"
                            >
                              <MapPin className="w-4 h-4 text-brand-sunset" />
                              <span className="font-semibold text-slate-700">{dest}</span>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Start</label>
                      <input 
                        type="date" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-4 py-4 bg-brand-cream/50 border-2 border-transparent rounded-2xl focus:bg-brand-cream focus:border-brand-sunset outline-none transition-all font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">End</label>
                      <input 
                        type="date" 
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-4 py-4 bg-brand-cream/50 border-2 border-transparent rounded-2xl focus:bg-brand-cream focus:border-brand-sunset outline-none transition-all font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 ml-1">Budget Level</label>
                      <div className="grid grid-cols-3 gap-3">
                        {(['economy', 'moderate', 'luxury'] as const).map((b) => (
                          <button
                            key={b}
                            onClick={() => setBudget(b)}
                            className={cn(
                              "py-3 rounded-2xl text-sm font-bold border-2 transition-all",
                              budget === b 
                                ? "bg-brand-sunset border-brand-sunset text-white shadow-lg shadow-brand-sunset/20" 
                                : "bg-brand-cream/50 border-transparent text-slate-500 hover:bg-brand-cream"
                            )}
                          >
                            {b.charAt(0).toUpperCase() + b.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Total Budget (Optional)</label>
                      <div className="relative">
                        <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 transition-colors" />
                        <input 
                          type="number" 
                          value={numericBudget}
                          onChange={(e) => setNumericBudget(e.target.value)}
                          placeholder="e.g. 2000"
                          className="w-full pl-12 pr-4 py-4 bg-brand-cream/50 border-2 border-transparent rounded-2xl focus:bg-brand-cream focus:border-brand-sunset outline-none transition-all font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 ml-1">Interests</label>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {interests.map((interest) => (
                        <motion.span 
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          key={interest}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-mint text-brand-sunset text-sm font-bold rounded-xl border border-brand-mint/50"
                        >
                          {interest}
                          <button onClick={() => removeInterest(interest)} className="hover:text-brand-sunset/80">
                            <X className="w-4 h-4" />
                          </button>
                        </motion.span>
                      ))}
                    </div>
                    <form onSubmit={handleAddInterest} className="relative">
                      <input 
                        type="text" 
                        value={newInterest}
                        onChange={(e) => setNewInterest(e.target.value)}
                        placeholder="Add interest..."
                        className="w-full px-4 py-4 bg-brand-cream/50 border-2 border-transparent rounded-2xl focus:bg-brand-cream focus:border-brand-sunset outline-none transition-all font-semibold"
                      />
                      <button 
                        type="submit"
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-brand-sunset text-white rounded-xl hover:bg-brand-sunset/90 transition-all"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </form>
                  </div>

                  <button 
                    onClick={handleGenerate}
                    disabled={generating || !destination || !startDate || !endDate}
                    className="w-full py-5 bg-brand-sunset text-white rounded-[20px] font-bold text-lg shadow-xl shadow-brand-sunset/20 hover:bg-brand-sunset/90 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-3 group"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                        <span>Create Itinerary</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>

              {!user && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  className="mt-6 p-6 bg-amber-50 rounded-3xl border border-amber-100 flex items-start gap-4"
                >
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
                    <Heart className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-amber-900 mb-1">Save your adventures</p>
                    <p className="text-amber-700 text-sm leading-relaxed">Sign in to automatically save your itineraries and access them anytime.</p>
                  </div>
                </motion.div>
              )}

              {user && (
                <div className="mt-6">
                  <button 
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="w-full flex items-center justify-between p-5 bg-white rounded-3xl border border-slate-100 shadow-sm hover:border-brand-sunset/30 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-sunset/10 flex items-center justify-center group-hover:bg-brand-sunset/20 transition-colors">
                        <History className="w-5 h-5 text-brand-sunset" />
                      </div>
                      <span className="font-bold text-slate-900 text-lg">Saved Itineraries</span>
                    </div>
                    {isSidebarOpen ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                  </button>
                  
                  <AnimatePresence>
                    {isSidebarOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-4 space-y-3">
                          {savedItineraries.length === 0 ? (
                            <div className="text-center py-8 bg-brand-cream/30 rounded-3xl border border-brand-sand/50">
                              <History className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                              <p className="text-sm font-bold text-slate-500">No saved itineraries yet.</p>
                            </div>
                          ) : (
                            savedItineraries.map((itinerary) => (
                              <div 
                                key={itinerary.id}
                                onClick={() => {
                                  setCurrentItinerary(itinerary.content);
                                  setDestination(itinerary.destination);
                                  setStartDate(itinerary.startDate);
                                  setEndDate(itinerary.endDate);
                                  setBudget(itinerary.budget);
                                  setInterests(itinerary.interests);
                                  window.scrollTo({ top: plannerRef.current?.offsetTop ? plannerRef.current.offsetTop - 100 : 0, behavior: 'smooth' });
                                }}
                                className="p-5 bg-white rounded-3xl border border-slate-100 shadow-sm hover:border-brand-sunset/30 hover:shadow-md cursor-pointer transition-all group relative overflow-hidden"
                              >
                                <div className="absolute top-0 right-0 w-24 h-24 bg-brand-mint/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                                <div className="flex items-center justify-between mb-3 relative z-10">
                                  <h4 className="font-extrabold text-slate-900 text-lg">{itinerary.destination}</h4>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (itinerary.id) {
                                        deleteDoc(doc(db, 'itineraries', itinerary.id));
                                      }
                                    }}
                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors opacity-0 group-hover:opacity-100"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-slate-500 font-bold relative z-10">
                                  <span className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                                    <Calendar className="w-3.5 h-3.5 text-brand-sunset" /> 
                                    {itinerary.startDate}
                                  </span>
                                  <span className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                                    <Wallet className="w-3.5 h-3.5 text-brand-sunset" /> 
                                    <span className="capitalize">{itinerary.budget}</span>
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {/* Results Area */}
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
              {currentItinerary ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -40 }}
                    className="bg-white/90 backdrop-blur-2xl rounded-[40px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-white overflow-hidden relative"
                  >
                    <div className="absolute top-0 left-0 w-full h-3 bg-gradient-to-r from-brand-peach via-brand-sunset to-brand-peach z-50" />
                    
                    {/* Enhanced Hero Header for Itinerary */}
                    <div className="relative overflow-hidden bg-slate-900 text-white px-8 py-16 md:px-12 md:py-20">
                      {/* Decorative Background Elements */}
                      <div className="absolute top-0 right-0 w-96 h-96 bg-brand-sunset/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                      <div className="absolute bottom-0 left-0 w-96 h-96 bg-brand-peach/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />
                      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
                      
                      <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
                        <div>
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-md mb-6">
                            <Sparkles className="w-4 h-4 text-brand-peach" />
                            <span className="text-xs font-bold tracking-wider uppercase text-brand-peach">AI-Generated Journey</span>
                          </div>
                          <h2 className="text-5xl md:text-7xl font-serif italic mb-4 leading-tight">{destination}</h2>
                          <div className="flex flex-wrap items-center gap-4 text-slate-300 font-medium">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-5 h-5 text-brand-sunset" />
                              <span>{startDate} — {endDate}</span>
                            </div>
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                            <div className="flex items-center gap-2">
                              <Wallet className="w-5 h-5 text-brand-peach" />
                              <span className="capitalize">{budget} Budget</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Action Bar integrated into Header */}
                        <div className="flex items-center gap-3 shrink-0">
                          <button 
                            onClick={exportToPDF}
                            className="flex items-center gap-2 px-5 py-3 bg-white/10 text-white border border-white/20 backdrop-blur-md rounded-2xl font-bold text-sm hover:bg-white/20 transition-all"
                          >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Export PDF</span>
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Destination Highlights */}
                    {(locationDetails || wikiDetails) && (
                      <div className="px-8 md:px-12 pt-12 bg-[#faf9f7]">
                        {locationDetails?.lat && locationDetails?.lon && (
                          <WeatherWidget 
                            lat={parseFloat(locationDetails.lat)} 
                            lon={parseFloat(locationDetails.lon)} 
                            startDate={startDate} 
                            endDate={endDate} 
                          />
                        )}
                        <div className="bg-white rounded-3xl p-6 shadow-sm border border-brand-sand flex flex-col md:flex-row gap-6 items-start relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-mint rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                          {wikiDetails?.imageUrl && (
                            <img 
                              src={wikiDetails.imageUrl} 
                              alt={destination} 
                              className="w-full md:w-48 h-48 object-cover rounded-2xl shadow-sm relative z-10"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <div className="flex-1 relative z-10">
                            <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                              <Compass className="w-5 h-5 text-brand-sunset" />
                              Destination Highlights
                            </h3>
                            {locationDetails && (
                              <div className="mb-4">
                                <p className="font-semibold text-lg text-slate-900">{locationDetails.name}</p>
                                <p className="text-sm text-slate-500">{locationDetails.display_name}</p>
                              </div>
                            )}
                            {wikiDetails?.extract && (
                              <div>
                                <p className="text-sm text-slate-600 line-clamp-4 leading-relaxed">{wikiDetails.extract}</p>
                                <a 
                                  href={`https://en.wikipedia.org/wiki/${encodeURIComponent(wikiDetails.title)}`}
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-sm font-bold text-brand-sunset hover:text-brand-peach transition-colors mt-3 inline-flex items-center gap-1"
                                >
                                  Read more on Wikipedia <ArrowRight className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                  <div className="p-8 md:p-12 relative bg-[#faf9f7]">
                    {/* Subtle timeline line */}
                    <div className="absolute left-12 md:left-16 top-12 bottom-12 w-px bg-gradient-to-b from-brand-sand via-brand-sunset/20 to-transparent hidden sm:block" />
                    
                    <div className="relative z-10 sm:pl-12">
                      <Markdown
                      components={{
                        h1: ({ node, ...props }) => (
                          <motion.h1 
                            initial={{ opacity: 0, y: -20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="font-serif italic text-5xl mb-8 text-slate-900 leading-tight"
                            {...props}
                          />
                        ),
                        h2: ({ node, ...props }) => (
                          <motion.h2 
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="text-3xl font-extrabold text-slate-900 mt-16 mb-8 flex items-center gap-4 relative"
                            {...props}
                          >
                            <div className="absolute -left-[3.25rem] md:-left-[4.25rem] w-6 h-6 bg-brand-cream border-4 border-brand-sunset rounded-full hidden sm:block shadow-sm" />
                            <span className="w-1.5 h-8 bg-brand-sunset rounded-full inline-block sm:hidden" />
                            {props.children}
                          </motion.h2>
                        ),
                        h3: ({ node, ...props }) => (
                          <motion.h3 
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="text-2xl font-bold text-slate-800 mt-10 mb-4 text-brand-sunset flex items-center gap-3"
                            {...props}
                          >
                            <div className="w-2 h-2 rounded-full bg-brand-peach" />
                            {props.children}
                          </motion.h3>
                        ),
                        p: ({ node, ...props }) => (
                          <motion.p 
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-slate-600 leading-relaxed mb-6 text-lg"
                            {...props}
                          />
                        ),
                        ul: ({ node, ...props }) => (
                          <motion.ul 
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            className="space-y-4 mb-8 list-disc pl-6 text-slate-600 text-lg marker:text-brand-sunset/60"
                            {...props}
                          />
                        ),
                        li: ({ node, ...props }) => (
                          <motion.li 
                            initial={{ opacity: 0, x: -10 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="leading-relaxed pl-2"
                            {...props}
                          />
                        ),
                        strong: ({ node, ...props }) => (
                          <strong className="font-semibold text-slate-900" {...props} />
                        ),
                        blockquote: ({ node, ...props }) => (
                          <motion.blockquote 
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            className="border-l-4 border-brand-sunset/30 pl-6 italic my-8 text-slate-500 relative"
                            {...props}
                          >
                            {props.children}
                          </motion.blockquote>
                        ),
                        ol: ({ node, ...props }) => (
                          <motion.ol 
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            className="space-y-4 mb-8 list-decimal pl-6 text-slate-600 text-lg marker:text-brand-sunset marker:font-bold"
                            {...props}
                          />
                        ),
                        a: ({ node, ...props }) => (
                          <a 
                            className="text-brand-sunset hover:text-brand-peach underline decoration-brand-peach/30 hover:decoration-brand-peach transition-colors font-medium"
                            {...props}
                          />
                        ),
                        em: ({ node, ...props }) => (
                          <em className="italic text-slate-700 font-serif" {...props} />
                        ),
                        img: ({ node, ...props }) => {
                          if (props.src?.startsWith('https://wiki-image.local/')) {
                            const placeName = decodeURIComponent(props.src.replace('https://wiki-image.local/', '').replace(/_/g, ' '));
                            return <WikiImage placeName={placeName} alt={props.alt} />;
                          }
                          // Also handle the old format just in case
                          if (props.src?.startsWith('wiki-image:')) {
                            const placeName = decodeURIComponent(props.src.replace('wiki-image:', '').replace(/_/g, ' '));
                            return <WikiImage placeName={placeName} alt={props.alt} />;
                          }
                          return <img {...props} referrerPolicy="no-referrer" className="rounded-2xl shadow-md my-6 w-full object-cover max-h-96" />;
                        }
                      }}
                    >
                      {currentItinerary}
                    </Markdown>
                    
                    {/* Feedback Form */}
                    {user && currentItineraryId && (
                      <div className="mt-16 p-8 bg-brand-cream/50 rounded-3xl border border-brand-sand">
                        <h3 className="text-2xl font-extrabold mb-2 tracking-tight">How was this itinerary?</h3>
                        <p className="text-slate-500 mb-6">Your feedback helps us improve future recommendations.</p>
                        
                        {feedbackSubmitted ? (
                          <div className="text-emerald-600 font-medium flex items-center gap-3 bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                            <Sparkles className="w-6 h-6" />
                            Thank you for your feedback!
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <div className="flex gap-2">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  onClick={() => setRating(star)}
                                  className={cn(
                                    "p-2 rounded-2xl transition-all hover:scale-110 active:scale-95",
                                    rating >= star 
                                      ? "text-yellow-500 bg-yellow-50 shadow-sm border border-yellow-100" 
                                      : "text-slate-300 hover:text-yellow-400 bg-white border border-transparent"
                                  )}
                                >
                                  <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
                                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                  </svg>
                                </button>
                              ))}
                            </div>
                            <textarea
                              value={feedback}
                              onChange={(e) => setFeedback(e.target.value)}
                              placeholder="Any suggestions to improve this itinerary? (Optional)"
                              className="w-full p-5 bg-white border-2 border-brand-sand rounded-2xl focus:border-brand-sunset outline-none resize-none h-32 font-medium text-slate-700 placeholder:text-slate-400 transition-colors"
                            />
                            <button
                              onClick={handleFeedbackSubmit}
                              disabled={rating === 0}
                              className="px-8 py-4 bg-brand-sunset text-white font-bold rounded-2xl hover:bg-brand-peach transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-sunset/20 hover:shadow-xl hover:shadow-brand-sunset/30 active:scale-95"
                            >
                              Submit Feedback
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  </div>
                </motion.div>
              ) : generating ? (
                <div className="relative bg-white rounded-[40px] shadow-xl border border-brand-sand/50 overflow-hidden p-8 md:p-12 min-h-[700px]">
                  <div className="animate-pulse flex flex-col space-y-10 opacity-40">
                    {/* Header Skeleton */}
                    <div className="space-y-4">
                      <div className="h-14 bg-slate-200 rounded-2xl w-2/3"></div>
                      <div className="h-6 bg-slate-200 rounded-xl w-1/3"></div>
                    </div>
                    
                    {/* Image Skeleton */}
                    <div className="h-72 bg-slate-200 rounded-3xl w-full"></div>
                    
                    {/* Content Skeletons */}
                    <div className="space-y-6">
                      <div className="h-8 bg-slate-200 rounded-xl w-1/4"></div>
                      <div className="space-y-4">
                        <div className="h-4 bg-slate-200 rounded-lg w-full"></div>
                        <div className="h-4 bg-slate-200 rounded-lg w-11/12"></div>
                        <div className="h-4 bg-slate-200 rounded-lg w-4/5"></div>
                      </div>
                    </div>
                    
                    {/* Days Skeletons */}
                    <div className="space-y-8 pt-4">
                      {[1, 2].map((i) => (
                        <div key={i} className="flex gap-6">
                          <div className="w-14 h-14 rounded-2xl bg-slate-200 shrink-0"></div>
                          <div className="flex-1 space-y-4 py-1">
                            <div className="h-6 bg-slate-200 rounded-lg w-1/4"></div>
                            <div className="space-y-3">
                              <div className="h-4 bg-slate-200 rounded-lg w-full"></div>
                              <div className="h-4 bg-slate-200 rounded-lg w-5/6"></div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Overlay with subtle loading message */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/40 backdrop-blur-[2px] z-10 rounded-[40px]">
                    <div className="relative mb-6">
                      <motion.div 
                        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 bg-brand-peach rounded-full blur-2xl"
                      />
                      <div className="relative w-20 h-20 bg-brand-mint rounded-[28px] flex items-center justify-center shadow-xl border border-white/50">
                        <Loader2 className="w-10 h-10 text-brand-sunset animate-spin" />
                      </div>
                    </div>
                    <div className="bg-white/80 backdrop-blur-md px-8 py-4 rounded-3xl shadow-sm border border-white/50 text-center">
                      <h3 className="text-2xl font-extrabold text-slate-800 mb-1">Crafting your itinerary...</h3>
                      <p className="text-slate-600 font-medium">Scouting the best spots in {destination || 'your destination'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-[700px] flex flex-col items-center justify-center text-center p-12 bg-brand-cream/40 backdrop-blur-sm rounded-[40px] border-2 border-brand-sand border-dashed group">
                  <div className="w-24 h-24 bg-brand-mint/30 rounded-[32px] flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500">
                    <Globe className="w-12 h-12 text-brand-sunset/30" />
                  </div>
                  <h3 className="text-3xl font-extrabold mb-4">Ready for Departure?</h3>
                  <p className="text-slate-500 max-w-sm text-lg leading-relaxed">
                    Enter your destination and preferences to generate an AI-powered itinerary that makes travel planning effortless.
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[200]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-brand-cream shadow-2xl z-[210] flex flex-col"
            >
              <div className="p-8 border-b border-brand-sand flex items-center justify-between bg-brand-sand/10">
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight">Your Journeys</h2>
                  <p className="text-slate-400 text-sm">Access your saved plans</p>
                </div>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="p-3 hover:bg-slate-50 rounded-2xl transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {savedItineraries.length === 0 ? (
                  <div className="text-center py-20">
                    <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                      <History className="w-10 h-10 text-slate-200" />
                    </div>
                    <p className="text-slate-400 font-bold">No saved itineraries yet.</p>
                  </div>
                ) : (
                  savedItineraries.map((itinerary, idx) => (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      key={itinerary.id}
                      className="group bg-brand-cream/50 border border-brand-sand/50 rounded-3xl p-5 hover:border-brand-sunset/30 hover:bg-brand-mint/20 transition-all cursor-pointer relative overflow-hidden"
                      onClick={() => {
                        setCurrentItinerary(itinerary.content);
                        setDestination(itinerary.destination);
                        setStartDate(itinerary.startDate);
                        setEndDate(itinerary.endDate);
                        setBudget(itinerary.budget);
                        setInterests(itinerary.interests);
                        setShowHistory(false);
                        window.scrollTo({ top: plannerRef.current?.offsetTop ? plannerRef.current.offsetTop - 100 : 0, behavior: 'smooth' });
                      }}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-extrabold text-slate-900">{itinerary.destination}</h3>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (itinerary.id) {
                              deleteDoc(doc(db, 'itineraries', itinerary.id));
                            }
                          }}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs font-bold text-slate-500">
                        <span className="flex items-center gap-1.5 bg-brand-cream px-2.5 py-1 rounded-lg border border-brand-sand/30">
                          <Calendar className="w-3 h-3 text-brand-sunset" />
                          {itinerary.startDate}
                        </span>
                        <span className="flex items-center gap-1.5 bg-brand-cream px-2.5 py-1 rounded-lg border border-brand-sand/30">
                          <Wallet className="w-3 h-3 text-brand-sunset" />
                          {itinerary.budget}
                        </span>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-300 py-20 relative overflow-hidden">
        {/* Add some subtle background elements for the dark footer */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-sunset/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-brand-peach/5 rounded-full blur-3xl" />
        
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-12 items-center relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <div className="bg-brand-sunset p-2 rounded-xl">
                <Navigation className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-extrabold tracking-tight text-white">Vagabond<span className="text-brand-sunset">AI</span></span>
            </div>
            <p className="text-slate-400 max-w-sm leading-relaxed font-medium">
              Revolutionizing the way you explore the world. Personalized, intelligent, and effortless travel planning for the modern explorer.
            </p>
          </div>
          <div className="flex justify-start md:justify-end gap-12">
            <div>
              <h4 className="font-bold mb-4 uppercase text-xs tracking-widest text-slate-500">Product</h4>
              <ul className="space-y-2 font-bold text-slate-300">
                <li className="hover:text-brand-sunset cursor-pointer transition-colors">Planner</li>
                <li className="hover:text-brand-sunset cursor-pointer transition-colors">Community</li>
                <li className="hover:text-brand-sunset cursor-pointer transition-colors">Pricing</li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 uppercase text-xs tracking-widest text-slate-500">Company</h4>
              <ul className="space-y-2 font-bold text-slate-300">
                <li className="hover:text-brand-sunset cursor-pointer transition-colors">About</li>
                <li className="hover:text-brand-sunset cursor-pointer transition-colors">Privacy</li>
                <li className="hover:text-brand-sunset cursor-pointer transition-colors">Terms</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-20 pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 relative z-10">
          <p className="text-slate-500 text-sm font-medium">© 2026 Vagabond AI. All rights reserved.</p>
          <div className="flex gap-6 text-slate-500">
            <Globe className="w-5 h-5 hover:text-brand-sunset cursor-pointer transition-colors" />
            <Navigation className="w-5 h-5 hover:text-brand-sunset cursor-pointer transition-colors" />
            <Heart className="w-5 h-5 hover:text-brand-sunset cursor-pointer transition-colors" />
          </div>
        </div>
      </footer>

      {/* AI Chatbot Assistant */}
      <Chatbot 
        context={currentItinerary ? {
          destination,
          startDate,
          endDate,
          budget,
          itinerary: currentItinerary
        } : undefined}
      />
    </div>
  );
}
