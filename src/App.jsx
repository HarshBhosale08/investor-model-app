// src/App.jsx

import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signOut,
  setPersistence,
  browserSessionPersistence
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  limit
} from 'firebase/firestore';

// Global variables provided by the environment
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAdVEeT-s3ntU-pSMZjuKn0L_QfLZ5rrQ4",
  authDomain: "soham1-d7160.firebaseapp.com",
  projectId: "soham1-d7160",
  storageBucket: "soham1-d7160.appspot.com",
  messagingSenderId: "985780312938",
  appId: "1:985780312938:web:76b4cc60a50f9cb02ba313",
  measurementId: "G-1DTWNZGQB0"
};

// --- START: API KEYS AND CONFIGURATION ---
const GEMINI_API_KEY = "AIzaSyDKVxGXSzQL5_du05FkTuyeQl5St_0MYbM";
const ALPHA_VANTAGE_KEY = "6RKTJK2BFKQWX9QC";
const COINGECKO_API_BASE = "https://api.coingecko.com/api/v3";
// --- END: API KEYS AND CONFIGURATION ---

// Trending prompts for initial chat message
const TRENDING_PROMPTS = [
  "What is the current price of TCS?",
  "Compare USD to INR exchange rate.",
  "Give me the latest crypto news.",
  "What is the market status globally?"
];


// --- Helper for generating SVG Chart placeholder for chat response (ENHANCED FOR CATCHINESS) ---
const renderStockChartPlaceholder = (symbol) => `
<div style="padding: 1rem; border-radius: 0.75rem; background-color: #1a202c; border: 2px solid #34d399; box-shadow: 0 4px 10px rgba(52, 211, 153, 0.2); margin-top: 1rem;">
  <div style="font-weight: 700; color: #34d399; font-size: 1rem; margin-bottom: 0.5rem; display: flex; align-items: center;">
    <span style="margin-right: 0.5rem;">📈</span> Interactive Data Preview: ${symbol}
  </div>
  <svg width="100%" height="80" viewBox="0 0 400 80" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="chartGradientNew" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:rgb(52, 211, 153);stop-opacity:0.7" />
        <stop offset="100%" style="stop-color:rgb(52, 211, 153);stop-opacity:0.1" />
      </linearGradient>
    </defs>
    
    <polyline 
      fill="none" 
      stroke="rgb(52, 211, 153)" 
      strokeWidth="2.5" 
      points="0,75 50,25 100,55 150,15 200,65 250,35 300,60 350,30 400,45" />
      
    <polygon fill="url(#chartGradientNew)" points="0,75 50,25 100,55 150,15 200,65 250,35 300,60 350,30 400,45 400,80 0,80" />
    
    <line x1="0" y1="75" x2="400" y2="75" stroke="#4b5563" strokeDasharray="2,2" strokeWidth="0.5" />
    
    <text x="5" y="15" fill="#e5e7eb" fontSize="10" font-weight="bold">Price Trend: Last 30 Days</text>
    <text x="360" y="70" fill="#9ca3af" fontSize="10">Today</text>
  </svg>
</div>
`;

// --- Helper for generating CHART.JS JSON PAYLOAD ---
const CHART_PAYLOAD_START = 'CHART_PAYLOAD:::';

const renderChartPayload = (symbol, rawData) => {
  // This function formats the data into a JSON structure that the frontend will recognize
  const payload = {
    symbol: symbol,
    provider: "AlphaVantage (Simulated)",
    data: rawData // Include raw data for the mock renderer
  };
  // Return the special string prefix followed by the JSON payload
  return `${CHART_PAYLOAD_START}${JSON.stringify(payload)}`;
};


// --- Chart Card Component for AuthScreen Preview (Omitted for brevity) ---
const PreviewChartCard = ({ title, dataPoints, color, onClick }) => {
  const maxVal = Math.max(...dataPoints);
  const minVal = Math.min(...dataPoints);
  const range = maxVal - minVal;
  const yRatio = range === 0 ? 0 : 70 / range;

  const points = dataPoints.map((val, index) => {
    const x = (index / (dataPoints.length - 1)) * 100;
    const y = 80 - ((val - minVal) * yRatio) - 10;
    return `${x},${y}`;
  }).join(' ');

  const initialPoint = `0,80`;
  const lastPoint = `100,80`;
  const polygonPoints = `${initialPoint} ${points} ${lastPoint}`;

  const start = dataPoints[0];
  const end = dataPoints[dataPoints.length - 1];
  const change = ((end - start) / start) * 100;
  const isPositive = change >= 0;

  const displayColor = isPositive ? '#10b981' : '#ef4444';

  return (
    <div className="preview-chart-card" onClick={onClick}>
      <div className="flex justify-between items-start mb-2">
        <span className="font-semibold text-lg">{title}</span>
        <span className="text-sm font-bold" style={{ color: displayColor }}>
          {isPositive ? '▲' : '▼'} {change.toFixed(2)}%
        </span>
      </div>
      <svg width="100%" height="90" viewBox="0 0 100 90" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${title}-grad`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.8 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.1 }} />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1"
          points={points}
        />
        <polygon fill={`url(#${title}-grad)`} points={polygonPoints} />
        <rect x="0" y="88" width="100" height="2" fill="#d1d5db" />
      </svg>
      <div className="text-xs text-center mt-2 text-gray-500">Click to view real-time data</div>
    </div>
  );
};


// --- AuthScreen Component (Omitted for brevity) ---
const AuthScreen = ({ auth, onLoginSuccess, showModal }) => {

  const handleSocialLogin = async (providerName) => {
    let provider;
    if (providerName === 'google') {
      provider = new GoogleAuthProvider();
    } else if (providerName === 'facebook') {
      provider = new FacebookAuthProvider();
    } else {
      return;
    }

    try {
      await setPersistence(auth, browserSessionPersistence);
      const result = await signInWithPopup(auth, provider);
      onLoginSuccess(result.user.uid); // Trigger redirection and auto-chat
    } catch (error) {
      console.error(`Error logging in with ${providerName}:`, error);
      showModal("Login failed. Please try again.");
    }
  };

  const handleGuestLogin = async () => {
    try {
      let user = auth.currentUser;
      if (!user) {
        const result = await signInAnonymously(auth);
        user = result.user;
      }
      onLoginSuccess(user.uid); // Trigger redirection and auto-chat
    } catch (error) {
      console.error("Error logging in anonymously:", error);
      showModal("Failed to sign in as guest.");
    }
  };

  // Dummy data for preview charts
  const sensexData = [50, 70, 60, 85, 75, 90, 80];
  const niftyData = [90, 75, 80, 60, 70, 50, 65];

  const userEmail = auth.currentUser?.email || "guest@investor.ai";
  const userName = auth.currentUser?.displayName || "Harsh";

  return (
    <div className="auth-container">
      <style>{`
        /* Auth Screen Split-Layout Styles */
        .auth-container {
          min-height: 100vh;
          width: 100vw;
          display: flex;
          background-color: #111827;
        }

        /* Left Panel - Preview Panel */
        .app-preview-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 2rem;
          background: linear-gradient(135deg, #2d3748, #1f2937);
          color: #e5e7eb;
        }

        /* Chart Cards */
        .preview-chart-card {
            background-color: #1f2937;
            padding: 1rem;
            border-radius: 0.75rem;
            margin-bottom: 1.5rem;
            width: 80%;
            max-width: 350px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            border: 1px solid #374151;
            transition: transform 0.2s, box-shadow 0.2s;
            cursor: pointer;
        }
        .preview-chart-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.6);
        }

        /* Right Panel - Login Form (White) */
        .auth-panel {
          width: 400px; 
          background-color: white;
          padding: 3rem 2.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
          flex-shrink: 0;
        }
        
        .auth-logo {
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 3rem;
          display: flex;
          align-items: center;
        }
        
        .auth-title {
          font-size: 1.75rem;
          font-weight: 600;
          margin-bottom: 2rem;
          color: #1f2937;
        }

        .auth-btn-group {
          width: 100%;
          margin-top: 1rem;
        }
        
        .auth-button-image {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 0.8rem 1rem;
          margin-bottom: 0.8rem;
          border-radius: 0.5rem;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
          background-color: white;
          border: 1px solid #d1d5db; 
          color: #374151; 
          text-align: left;
        }

        .auth-button-image:hover {
          background-color: #f3f4f6;
        }

        .auth-button-image .icon-placeholder {
            margin-right: 0.75rem;
            width: 1.25rem;
            height: 1.25rem;
            color: #4f46e5;
        }
        
        .auth-button-image .right-icon {
            margin-left: auto;
            color: #4f46e5;
        }
        
        .auth-button-image.google-style .right-icon svg {
          fill: #4f46e5;
        }

        .link-text {
          margin-top: 1.5rem;
          font-size: 0.9rem;
          color: #6b7280;
        }
        .link-text a {
          color: #34d399; 
          text-decoration: none;
          font-weight: 600;
        }
        .link-text a:hover {
          text-decoration: underline;
        }

        @media (max-width: 900px) {
          .auth-panel {
            width: 100%;
            max-width: none;
          }
          .app-preview-panel {
            display: none;
          }
        }
      `}</style>

      {/* Left Panel - App Preview with Charts (Hidden on small screens) */}
      <div className="app-preview-panel">
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '2rem', color: '#6366f1' }}>Market Indices Preview</h1>

        <PreviewChartCard
          title="Sensex"
          dataPoints={sensexData}
          color="#34d399" // Green for Sensex
          onClick={() => showModal("Please log in to view real-time charts.")}
        />

        <PreviewChartCard
          title="Nifty 50"
          dataPoints={niftyData}
          color="#ef4444" // Red for Nifty
          onClick={() => showModal("Please log in to view real-time charts.")}
        />

        <div style={{ maxWidth: '400px', textAlign: 'center', marginTop: '1.5rem', color: '#9ca3af' }}>
          <p className="text-sm">These charts are simulated. Log in with Google/Facebook to unlock full access and interactive features.</p>
        </div>
      </div>

      {/* Right Panel - Login Form (Investor Ai Model Branding) */}
      <div className="auth-panel">
        <div className="auth-logo">
          {/* Investor Ai Model Branding */}
          <span style={{ color: '#1f2937' }}>Project Pulse </span><span style={{ color: '#4f46e5' }}> Investor Ai Model</span>
        </div>

        <h2 className="auth-title">Log in</h2>

        <div className="auth-btn-group">
          {/* Continue as Harsh (Uses Guest/Anonymous Login for function) */}
          <button
            className="auth-button-image"
            onClick={handleGuestLogin}
          >
            {/* User/Avatar Icon Placeholder */}
            <span className="icon-placeholder">
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15a7.488 7.488 0 00-5.982 3.725M15 10a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M4.625 20.25a7.5 7.5 0 0114.75 0V21a.75.75 0 01-.75.75H5.375a.75.75 0 01-.75-.75v-.75z" /></svg>
            </span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 700 }}>Continue as {userName}</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{userEmail}</div>
            </div>
            {/* Google Icon Placeholder */}
            <span className="right-icon">
              <svg className="icon-svg" fill="#4f46e5" viewBox="0 0 48 48"><path d="M43.6 20.4H24v7.3h11.2c-.6 3.4-3 6.3-6.9 8.3v5.1h6.6c3.9-3.6 6.1-8.5 6.1-14.7 0-1.4-.1-2.8-.4-4.1z" fill="#4f46e5" /><path d="M24 44c6.7 0 12.3-2.2 16.4-5.9l-6.6-5.1c-2 1.3-4.5 2.1-7.8 2.1-5 0-9.4-3.4-10.9-8.4h-6.8v5.3c3.9 7.7 11.8 12.8 20.9 12.8z" fill="#4f46e5" /><path d="M13.1 27.2c-.3-.9-.5-1.9-.5-2.9s.2-2 .5-2.9v-5.3h-6.8c-.8 1.8-1.2 3.8-1.2 5.8s.4 4 .9 5.8l7.1-5.6z" fill="#4f46e5" /><path d="M24 16.3c2.7 0 5.2 1 7.1 2.8l4.9-4.8c-3.6-3.3-8.3-5.3-12-5.3-9.1 0-17 5.1-20.9 12.8l6.8 5.3c1.5-5 5.9-8.4 10.9-8.4z" fill="#4f46e5" /></svg>
            </span>
          </button>

          {/* Continue with Apple (Uses Google Login for function) */}
          <button
            className="auth-button-image"
            onClick={() => handleSocialLogin('google')}
            style={{ justifyContent: 'center' }}
          >
            {/* Apple Icon Placeholder */}
            <span className="icon-placeholder" style={{ marginRight: '1rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor"><path d="M12.13 18.04c-.39 0-.96.26-1.55.26-.6 0-1.16-.26-1.55-.26-.8 0-1.26.54-1.26 1.15 0 .84.81 1.77 2.81 1.77 2 0 2.81-.93 2.81-1.77 0-.61-.46-1.15-1.26-1.15zm-.05-1.88c.84 0 1.95-.53 2.53-1.63.15-.3.23-.62.23-.97 0-.39-.12-.76-.32-1.09-.43-.88-1.57-1.3-2.61-1.3s-2.18.42-2.61 1.3c-.2.33-.32.7-.32 1.09 0 .35.08.67.23.97.58 1.1 1.69 1.63 2.53 1.63zm4.56-8.99c.92 1.56.24 3.73-.5 4.97-.47.78-1.14 1.25-1.8 1.25-.6 0-1.17-.37-1.45-1.21-.19-.56-.16-1.15.06-1.68.21-.51.46-1.07.46-1.72 0-1.78-1.84-2.82-3.14-2.82s-3.14 1.04-3.14 2.82c0 .65.25 1.21.46 1.72.22.53.25 1.12.06 1.68-.28.84-.85 1.21-1.45 1.21-.66 0-1.33-.47-1.8-1.25-.74-1.24-1.42-3.41-.5-4.97C6.73 5.4 9.17 3.5 12 3.5s5.27 1.9 6.73 3.67zM12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z" /></svg>
            </span>
            Continue with Apple
          </button>

          {/* Continue with email (Uses Google Login for function) */}
          <button
            className="auth-button-image"
            onClick={() => handleSocialLogin('google')}
            style={{ justifyContent: 'center' }}
          >
            {/* Email Icon Placeholder */}
            <span className="icon-placeholder" style={{ marginRight: '1rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 14.5c4 0 7.5-3 9-6.5-3-7-15-7-18 0 1.5 3.5 5 6.5 9 6.5z" /></svg>
            </span>
            Continue with email
          </button>
        </div>

        <div className="link-text">
          Don't you have an account? <a href="#" onClick={(e) => { e.preventDefault(); handleSocialLogin('google'); }}>Sign up</a>
        </div>

        <div className="link-text" style={{ marginTop: '0.75rem' }}>
          <a href="#">Cookies Settings</a>
        </div>
      </div>

    </div>
  );
};


function App() {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(null);
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [chatList, setChatList] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [isClearingHistory, setIsClearingHistory] = useState(false);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState([]);

  const [isFirstLogin, setIsFirstLogin] = useState(false);

  const chatMessagesRef = useRef(null);
  const userInputRef = useRef(null);
  const db = useRef(null);
  const auth = useRef(null);

  const showModal = (message) => {
    setError(message);
  };

  const handleLoginSuccess = (uid) => {
    setUserId(uid);
    setIsFirstLogin(true); // Set flag to true on successful login
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth.current);
      setUser(null);
      setUserId(null);
      setCurrentChatId(null);
      setChatList([]);
      showModal("You have been signed out.");
    } catch (e) {
      console.error("Error signing out:", e);
      showModal("Failed to sign out.");
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenuId && !event.target.closest('.menu-button-container') && !event.target.closest('.dropdown-menu')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId]);


  // --- LLM-POWERED HELPER & DATA FETCHING FUNCTIONS ---
  const correctUserTypo = async (prompt) => {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") return prompt;
    // FIX: Change model to gemini-2.5-flash
    const systemPrompt = `Correct spelling mistakes in the following user query for a financial chatbot. Only return the corrected query. Example: "what is market status tyoday" becomes "what is market status today".`;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const payload = { contents: [{ parts: [{ text: `${systemPrompt}\n\nUser query: "${prompt}"` }] }] };
    try {
      const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) { console.error(`Typo correction API failed: ${response.status}`); return prompt; }
      const result = await response.json();
      const correctedText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      return correctedText ? correctedText.trim().replace(/"/g, '') : prompt;
    } catch (error) {
      console.error("Typo correction network error:", error);
      return prompt;
    }
  };

  const getCurrencyCodesFromText = async (prompt) => {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") return null;
    // FIX: Change model to gemini-2.5-flash
    const systemPrompt = `Extract two ISO 4217 currency codes from the user's query. Example: "how many rupees is one dollar" becomes "USD to INR". If only one currency is mentioned, like "rupee status", assume the comparison is to USD and return "INR to USD". Return only "CODE1 to CODE2".`;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const payload = { contents: [{ parts: [{ text: `${systemPrompt}\n\nUser query: "${prompt}"` }] }] };
    try {
      const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) { console.error(`Currency extraction API failed: ${response.status}`); return null; }
      const result = await response.json();
      const extractedText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      return extractedText ? extractedText.trim() : null;
    } catch (error) {
      console.error("Currency code extraction failed:", error);
      return null;
    }
  };

  // LLM Helper to extract stock symbols
  const extractStockSymbol = async (prompt) => {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") return prompt;
    // FIX: Change model to gemini-2.5-flash
    const systemPrompt = `Analyze the user query for a financial stock. Extract the main stock ticker or company name. Respond ONLY with the extracted name/ticker, preferably in its common form. Examples: "stock price of tata steel" becomes "tata steel", "what is the price of microsoft" becomes "microsoft", "current value of TCS" becomes "TCS". If no company is found, return an empty string.`;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const payload = { contents: [{ parts: [{ text: `${systemPrompt}\n\nUser query: "${prompt}"` }] }] };
    try {
      const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) { console.error(`Symbol extraction API failed: ${response.status}`); return ''; }
      const result = await response.json();
      const extractedText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      return extractedText ? extractedText.trim().replace(/"/g, '') : '';
    } catch (error) {
      console.error("Stock Symbol extraction failed:", error);
      return '';
    }
  };
  // END OF NEW LLM HELPER


  const generateContent = async (userPrompt) => {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") return "Error: Gemini API key is missing.";
    // FIX: Change model to gemini-2.5-flash
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const systemPrompt = "Act as a specialized Investor Model. Provide concise, data-driven, and insightful responses. Focus on key metrics, market trends, and risk analysis.";
    const payload = {
      contents: [...messages.map(msg => ({ role: msg.sender === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] })), { role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
    };
    try {
      const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
      // Capture detailed API error if available
      if (result.error && result.error.message) {
        console.error("Gemini API Error:", result.error.message);
        return `AI Model Error: ${result.error.message}`;
      }
      throw new Error('No valid content returned from Gemini API');
    } catch (error) {
      console.error("Gemini Content Generation Failed:", error);
      return "Sorry, I am unable to process that request at the moment.";
    }
  };

  const fetchStockData = async (prompt) => {
    if (!ALPHA_VANTAGE_KEY || ALPHA_VANTAGE_KEY === "YOUR_ALPHA_VANTAGE_KEY") return { response: "Error: Alpha Vantage API key is missing.", symbol: null };

    // --- CHANGE: Use LLM to extract the primary stock symbol/name ---
    const keywords = await extractStockSymbol(prompt);
    // -----------------------------------------------------------------

    if (!keywords) return { response: "I couldn't identify a specific stock in your query. Please be more explicit, e.g., 'price of TCS' or 'Reliance Industries stock'.", symbol: null };

    try {
      // 1. Use Symbol Search to find the best match and its exact symbol (e.g., TATASTEEL.NSE)
      const searchUrl = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${keywords}&apikey=${ALPHA_VANTAGE_KEY}`;
      const searchResponse = await fetch(searchUrl);
      const searchData = await searchResponse.json();

      // Prioritize non-ADR and Indian listings
      const matches = searchData.bestMatches || [];
      const bestMatch = matches.find(m => m['1. symbol'].endsWith('.NSE') || m['1. symbol'].endsWith('.BSE')) || matches[0];

      if (!bestMatch) return { response: `I couldn't find any stock matching "${keywords}". For Indian stocks, try adding the exchange, e.g., "TCS NSE".`, symbol: null };

      // The full symbol from the search result (e.g., TATASTEEL.BSE or TATLY)
      let symbol = bestMatch['1. symbol'];
      const companyName = bestMatch['2. name'];
      const currencySymbol = bestMatch['8. currency'] === 'INR' ? '₹' : '$';

      // 2. Determine the symbol for GLOBAL_QUOTE (Use the full symbol)
      let quoteSymbol = symbol;

      const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${quoteSymbol}&apikey=${ALPHA_VANTAGE_KEY}`;
      const quoteResponse = await fetch(quoteUrl);
      const quoteData = await quoteResponse.json();
      const quote = quoteData['Global Quote'];

      if (quote && quote['05. price'] && parseFloat(quote['06. volume']) > 0) {
        const price = parseFloat(quote['05. price']).toFixed(2);
        const change = parseFloat(quote['09. change']).toFixed(2);
        const changePercent = quote['10. change percent'];
        const volume = parseInt(quote['06. volume']).toLocaleString();
        const response = `${companyName} (${symbol})\nis trading at ₹${price}.\nChange: ${change} (${changePercent})\nVolume: ${volume}`;
        return { response, symbol };
      }

      // Secondary check for zero/inaccurate data often seen with ADRs/Indian stocks on free tier
      if (quote && (parseFloat(quote['06. volume']) === 0 || parseFloat(quote['05. price']) < 0.01)) {
        return { response: `Found data for ${companyName} (${symbol}) but the real-time quote appears inaccurate or stale. The price is ${currencySymbol}${parseFloat(quote['05. price']).toFixed(2)} with zero volume.`, symbol: symbol };
      }

      // Final failure messages
      if (quoteData.Note) return { response: `Could not retrieve quote for ${symbol}. The API provider noted: "${quoteData.Note}"`, symbol: symbol };
      return { response: `I found the symbol ${symbol}, but couldn't get its price.`, symbol: symbol };
    } catch (error) {
      console.error("Stock data fetch error:", error);
      return { response: "An error occurred connecting to the market data service.", symbol: null };
    }
  };

  // Function to fetch specific index data
  const fetchIndexData = async (indexName) => {
    if (!ALPHA_VANTAGE_KEY || ALPHA_VANTAGE_KEY === "YOUR_ALPHA_VANTAGE_KEY") return { response: "Error: Alpha Vantage API key is missing.", symbol: null };

    // Map index names to global/recognized tickers
    const indexMap = {
      'nifty 50': '^NSEI',
      'nifty': '^NSEI',
      'sensex': '^BSESN',
    };

    const indexTicker = indexMap[indexName.toLowerCase()];
    if (!indexTicker) {
      return { response: `I couldn't find a market ticker for ${indexName}.`, symbol: null };
    }

    const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${indexTicker}&apikey=${ALPHA_VANTAGE_KEY}`;

    try {
      const quoteResponse = await fetch(quoteUrl);
      const quoteData = await quoteResponse.json();
      const quote = quoteData['Global Quote'];

      if (quote && quote['05. price']) {
        const indexNameDisplay = indexName.toUpperCase();
        const price = parseFloat(quote['05. price']).toFixed(2);
        const change = parseFloat(quote['09. change']).toFixed(2);
        const changePercent = quote['10. change percent'];

        const response = `${indexNameDisplay} (${indexTicker})\nis currently at **${price}**.\nChange: ${change} (${changePercent})\nVolume: N/A`;
        return { response, symbol: indexTicker };
      } else {
        if (quoteData.Note) return { response: `Could not retrieve quote for ${indexTicker}. The API provider noted: "${quoteData.Note}"`, symbol: indexTicker };
        return { response: `I found the index symbol ${indexTicker}, but couldn't get its current price.`, symbol: indexTicker };
      }
    } catch (error) {
      console.error("Index data fetch error:", error);
      return { response: "An error occurred connecting to the index data service.", symbol: null };
    }
  };

  const fetchCryptoData = async (prompt) => {
    if (!COINGECKO_API_BASE) return "Error: Crypto API base URL is missing.";
    const cryptoKeywords = ['bitcoin', 'ethereum', 'dogecoin', 'solana', 'cardano', 'ripple', 'btc', 'eth'];
    const cryptoId = cryptoKeywords.find(crypto => prompt.toLowerCase().includes(crypto));
    if (!cryptoId) return "I couldn't identify the cryptocurrency in your request.";
    const finalCryptoId = cryptoId === 'btc' ? 'bitcoin' : (cryptoId === 'eth' ? 'ethereum' : cryptoId);
    const url = `${COINGECKO_API_BASE}/simple/price?ids=${finalCryptoId}&vs_currencies=usd`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data[finalCryptoId] && data[finalCryptoId].usd) {
        const price = data[finalCryptoId].usd;
        return `The current price of ${finalCryptoId.charAt(0).toUpperCase() + finalCryptoId.slice(1)} is $${price.toLocaleString()}.`;
      } else {
        return `I couldn't retrieve the price for ${finalCryptoId}.`;
      }
    } catch (error) {
      return "Sorry, I couldn't connect to the crypto data service.";
    }
  };

  const fetchMarketStatus = async () => {
    if (!ALPHA_VANTAGE_KEY || ALPHA_VANTAGE_KEY === "YOUR_ALPHA_VANTAGE_KEY") return "Error: Alpha Vantage API key is missing.";
    const url = `https://www.alphavantage.co/query?function=MARKET_STATUS&apikey=${ALPHA_VANTAGE_KEY}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.markets && data.markets.length > 0) {
        let statusReport = "Here's a look at the current global market status:\n\n";
        const marketsToShow = ["United States", "India", "Europe", "Tokyo", "London"];

        let foundStatus = false;
        data.markets.forEach(market => {
          if (marketsToShow.includes(market.market_type)) {
            statusReport += `**${market.primary_exchanges} (${market.region})**: ${market.current_status}\n`;
            foundStatus = true;
          }
        });

        if (foundStatus) return statusReport;

        return "Could not retrieve the current global market status at this time.";

      } else {
        if (data.Note) return `Could not retrieve market status. The API provider noted: "${data.Note}"`;
        return "Could not retrieve the current global market status at this time.";
      }
    } catch (error) {
      console.error("Error fetching market status:", error);
      return "Sorry, I couldn't connect to the market status service.";
    }
  };

  const fetchForexData = async (prompt) => {
    if (!ALPHA_VANTAGE_KEY || ALPHA_VANTAGE_KEY === "YOUR_ALPHA_VANTAGE_KEY") return "Error: Alpha Vantage API key is missing.";

    let currencyMatch = await getCurrencyCodesFromText(prompt);
    if (!currencyMatch) {
      const regexMatch = prompt.toUpperCase().match(/([A-Z]{3})\s*(?:TO|\/)\s*([A-Z]{3})/);
      if (regexMatch) {
        currencyMatch = `${regexMatch[1]} to ${regexMatch[2]}`;
      } else {
        return "Could not retrieve the exchange rate. The currency codes may be invalid.";
      }
    }
    const [from_currency, to_currency] = currencyMatch.split(/\s*to\s*/i);
    const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${from_currency.trim()}&to_currency=${to_currency.trim()}&apikey=${ALPHA_VANTAGE_KEY}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      const rateInfo = data["Realtime Currency Exchange Rate"];
      if (rateInfo) {
        const exchangeRate = parseFloat(rateInfo['5. Exchange Rate']).toFixed(4);
        return `The current exchange rate for ${from_currency.trim()} to ${to_currency.trim()} is ${exchangeRate}.`;
      } else {
        if (data.Note) return `Could not retrieve exchange rate. The API provider noted: "${data.Note}"`;
        return "Could not retrieve the exchange rate. The currency codes may be invalid.";
      }
    } catch (error) {
      return "Sorry, I couldn't connect to the forex data service.";
    }
  };


  // --- CHAT MANAGEMENT FUNCTIONS (Omitted for brevity) ---

  const createNewChatAndPrompt = async (currentUserId) => {
    if (!currentUserId || !db.current) return;
    setIsLoading(true);

    const initialBotMessage = `👋 Welcome to Investor Ai Model! I'm here to provide quick, data-driven financial insights.\n\nTo get started, try one of these trending prompts:\n\n` +
      TRENDING_PROMPTS.map(p => `- *${p}*`).join('\n');

    try {
      // 1. Create the new chat document
      const newChatRef = await addDoc(collection(db.current, `artifacts/${firebaseConfig.appId}/users/${currentUserId}/chats`), {
        createdAt: serverTimestamp(), title: 'Welcome Chat'
      });
      setCurrentChatId(newChatRef.id);

      // 2. Add the introductory bot message
      await addDoc(collection(db.current, `artifacts/${firebaseConfig.appId}/users/${currentUserId}/chats/${newChatRef.id}/messages`), {
        text: initialBotMessage, sender: 'bot', timestamp: serverTimestamp()
      });

    } catch (error) {
      console.error("Error creating new chat with prompt:", error);
      showModal("Failed to create a new chat session.");
    } finally {
      setIsLoading(false);
      setIsClearingHistory(false);
      setIsFirstLogin(false); // Reset the flag once the prompt is done
    }
  };

  const createNewChat = async (currentUserId) => {
    if (!currentUserId || !db.current) return;
    setIsLoading(true);
    try {
      const newChatRef = await addDoc(collection(db.current, `artifacts/${firebaseConfig.appId}/users/${currentUserId}/chats`), {
        createdAt: serverTimestamp(), title: 'New Chat'
      });
      setCurrentChatId(newChatRef.id);
    } catch (error) {
      console.error("Error creating new chat:", error);
      showModal("Failed to create a new chat session.");
    } finally {
      setIsLoading(false);
      setIsClearingHistory(false);
    }
  };

  const handleSelectChat = (chatId) => {
    setCurrentChatId(chatId);
    setOpenMenuId(null);
  };

  const handleToggleChatSelect = (chatId) => {
    if (selectedChatIds.includes(chatId)) {
      setSelectedChatIds(selectedChatIds.filter(id => id !== chatId));
    } else {
      setSelectedChatIds([...selectedChatIds, chatId]);
    }
  };

  const clearChatMessages = async (chatId) => {
    setOpenMenuId(null);
    if (!userId || !db.current || !window.confirm("Are you sure you want to clear all messages in this chat?")) return;

    setIsLoading(true);
    try {
      const messagesRef = collection(db.current, `artifacts/${firebaseConfig.appId}/users/${userId}/chats/${chatId}/messages`);
      let messagesSnapshot = await getDocs(query(messagesRef, limit(500)));

      while (messagesSnapshot.size > 0) {
        const batch = writeBatch(db.current);
        messagesSnapshot.docs.forEach((d) => {
          batch.delete(d.ref);
        });
        await batch.commit();
        messagesSnapshot = await getDocs(query(messagesRef, limit(500)));
      }

      showModal(`Chat messages cleared.`);
      if (currentChatId === chatId) setMessages([]);

    } catch (error) {
      console.error("Error clearing chat messages:", error);
      showModal("Failed to clear chat messages. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteSingleChatLogic = async (chatId, batch) => {
    const chatDocRef = doc(db.current, `artifacts/${firebaseConfig.appId}/users/${userId}/chats/${chatId}`);
    const messagesRef = collection(db.current, `artifacts/${firebaseConfig.appId}/users/${userId}/chats/${chatId}/messages`);

    let messagesSnapshot = await getDocs(query(messagesRef, limit(500)));

    while (messagesSnapshot.size > 0) {
      messagesSnapshot.docs.forEach((d) => {
        batch.delete(d.ref);
      });
      await batch.commit();
      messagesSnapshot = await getDocs(query(messagesRef, limit(500)));
    }

    batch.delete(chatDocRef);
  }

  const deleteChat = async (chatId) => {
    setOpenMenuId(null);
    if (!userId || !db.current || !window.confirm("Are you sure you want to delete this chat tab and all its history?")) return;

    setIsLoading(true);
    try {
      const batch = writeBatch(db.current);
      await deleteSingleChatLogic(chatId, batch);
      await batch.commit();

      showModal(`Chat deleted successfully.`);

      if (currentChatId === chatId) {
        const chatIndex = chatList.findIndex(chat => chat.id === chatId);
        const nextChat = chatList.filter(chat => chat.id !== chatId)[chatIndex > 0 ? chatIndex - 1 : 0];
        setCurrentChatId(nextChat ? nextChat.id : null);
      }

    } catch (error) {
      console.error("Error deleting chat:", error);
      showModal("Failed to delete the chat. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteSelectedChats = async () => {
    if (!userId || !db.current || selectedChatIds.length === 0 ||
      !window.confirm(`Are you sure you want to delete ${selectedChatIds.length} selected chat tabs and all their history?`)) {
      return;
    }

    setIsLoading(true);
    setIsSelectMode(false);

    try {
      const deletionPromises = selectedChatIds.map(async (chatId) => {
        const batch = writeBatch(db.current);
        await deleteSingleChatLogic(chatId, batch);
        await batch.commit();
      });

      await Promise.all(deletionPromises);

      const nextChatList = chatList.filter(chat => !selectedChatIds.includes(chat.id));
      const nextCurrentChatId = nextChatList.length > 0 ? nextChatList[0].id : null;

      setSelectedChatIds([]);
      setCurrentChatId(nextCurrentChatId);

      showModal(`${selectedChatIds.length} chat(s) deleted successfully.`);

    } catch (error) {
      console.error("Error deleting selected chats:", error);
      showModal("Failed to delete selected chats. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };


  const clearAllHistory = async () => {
    if (!userId || !db.current || chatList.length === 0 || !window.confirm("Are you sure you want to delete ALL of your chat history? This cannot be undone.")) return;

    setIsClearingHistory(true);
    setCurrentChatId(null);
    setIsLoading(true);
    setOpenMenuId(null);

    try {
      const chatsToDelete = [...chatList];
      const deletePromises = chatsToDelete.map(async (chat) => {
        const batch = writeBatch(db.current);
        await deleteSingleChatLogic(chat.id, batch);
        await batch.commit();
      });

      await Promise.all(deletePromises);

      showModal("All chat history cleared successfully! Click 'Start New Query' to begin a new chat.");

    } catch (error) {
      console.error("Error clearing all history:", error);
      showModal("Failed to clear all chat history. Please try again.");
    } finally {
      setIsLoading(false);
      setIsClearingHistory(false);
    }
  };
  // --- END: CHAT MANAGEMENT FUNCTIONS ---


  // --- CORE APPLICATION LOGIC ---
  const handleSendMessage = async (rawMessageText) => {
    if (!rawMessageText || !userId || !currentChatId || !db.current) return;
    try {
      await addDoc(collection(db.current, `artifacts/${firebaseConfig.appId}/users/${userId}/chats/${currentChatId}/messages`), {
        text: rawMessageText, sender: 'user', timestamp: serverTimestamp()
      });
    } catch (e) { console.error("Error adding user message: ", e); return; }

    setIsLoading(true);
    const correctedMessageText = await correctUserTypo(rawMessageText);
    const lowerCaseMessage = correctedMessageText.toLowerCase().trim();

    let botResponse = null;
    const hasFinancialKeywords = /\b(stock|price|volume|shares|ticker|value|reliance|infosys|tcs|infy|hdfcbank|nse|bse|steel|zomato)\b/.test(lowerCaseMessage); // Added Zomato

    let stockSymbol = null;

    if (/^\s*(hi|hello|hey|greetings)\s*$/.test(lowerCaseMessage)) {
      const greetings = ["Hello! How can I assist with market data today?", "Hi there! What can I provide for you?"];
      botResponse = greetings[Math.floor(Math.random() * greetings.length)];
    }
    // ROUTE 1: Prioritize explicit index queries (Nifty, Sensex)
    else if (/\b(nifty 50|nifty|sensex)\b/.test(lowerCaseMessage)) {
      const indexResult = await fetchIndexData(lowerCaseMessage);
      botResponse = indexResult.response;
      stockSymbol = indexResult.symbol;
    }
    // ROUTE 2: General Market Status Check (for 'global' status, 'market status' etc.)
    else if (/\b(market status)\b/.test(lowerCaseMessage)) {
      botResponse = await fetchMarketStatus();
    }
    // ROUTE 3: Forex/Currency Conversion
    else if (/[a-z]{3}\s*(to|\/)\s*[a-z]{3}/.test(lowerCaseMessage) || /\b(rupee|dollar|euro|yen|pound|currency|exchange rate)\b/.test(lowerCaseMessage)) {
      botResponse = await fetchForexData(lowerCaseMessage);
    }
    // ROUTE 4: Cryptocurrency
    else if (/\b(bitcoin|ethereum|crypto|dogecoin|solana|btc|eth)\b/.test(lowerCaseMessage)) {
      botResponse = await fetchCryptoData(lowerCaseMessage);
    }
    // ROUTE 5: General Stocks (NSE/BSE/US)
    else if (hasFinancialKeywords) {
      // Pass the corrected (but unfiltered) message text to the fetch function
      const stockDataResult = await fetchStockData(correctedMessageText);
      botResponse = stockDataResult.response;
      stockSymbol = stockDataResult.symbol;
    }

    // FINAL FALLBACK: If no route matched OR if the botResponse is still null/generic failure, try Gemini
    if (botResponse === null || botResponse.includes("Sorry, I am unable to process that request at the moment.")) {
      const previousFailure = botResponse;

      botResponse = await generateContent(correctedMessageText);

      // If Gemini also failed, revert to the specific failure or a final generic error
      if (botResponse === "Sorry, I am unable to process that request at the moment." && previousFailure !== null) {
        botResponse = previousFailure;
      }
    }

    // Only render chart if we got a specific stock/index symbol and the response wasn't a failure message
    if (stockSymbol && !botResponse.includes("Could not retrieve") && !botResponse.includes("Error:") && !botResponse.includes("couldn't get its price")) {
      const chartJsonPayload = renderChartPayload(stockSymbol, { quote: botResponse }); // Pass quote for context
      botResponse = botResponse + '\n\n' + chartJsonPayload; // Append JSON string to text response
    }

    setIsLoading(false);

    if (botResponse) {
      try {
        await addDoc(collection(db.current, `artifacts/${firebaseConfig.appId}/users/${userId}/chats/${currentChatId}/messages`), {
          text: botResponse, sender: 'bot', timestamp: serverTimestamp()
        });
      } catch (e) { console.error("Error adding bot response: ", e); }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const userMessage = userInput.trim();
    if (!userMessage) return;
    setUserInput('');
    if (messages.length === 0 && userMessage.length > 0) {
      const newTitle = userMessage.length > 30 ? userMessage.substring(0, 30) + '...' : userMessage;
      try {
        await updateDoc(doc(db.current, `artifacts/${firebaseConfig.appId}/users/${userId}/chats/${currentChatId}`), { title: newTitle });
      } catch (e) {
        console.error("Error updating chat title: ", e);
      }
    }
    handleSendMessage(userMessage);
  };
  // --- END: CORE APPLICATION LOGIC ---


  // --- START: INITIALIZATION AND LISTENERS (Omitted for brevity) ---
  useEffect(() => {
    const app = initializeApp(firebaseConfig);
    db.current = getFirestore(app);
    auth.current = getAuth(app);

    const unsubscribeAuth = onAuthStateChanged(auth.current, (currentUser) => {
      setUser(currentUser);
      setUserId(currentUser?.uid || null);

      if (currentUser && initialAuthToken) {
        const signInUser = async () => {
          await signInWithCustomToken(auth.current, initialAuthToken);
        };
        signInUser();
      }
      setIsAuthReady(true);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !userId || !db.current) {
      setChatList([]);
      setCurrentChatId(null);
      return;
    }

    const chatsQuery = query(collection(db.current, `artifacts/${firebaseConfig.appId}/users/${userId}/chats`), orderBy('createdAt', 'desc'));
    const unsubscribeChats = onSnapshot(chatsQuery, (snapshot) => {
      const fetchedChats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setChatList(fetchedChats);
      const currentChatExists = fetchedChats.some(chat => chat.id === currentChatId);

      if (isFirstLogin) {
        // New login detected
        if (fetchedChats.length === 0) {
          createNewChatAndPrompt(userId);
        } else {
          // User had existing chats (e.g., from an anonymous session). Select most recent.
          setCurrentChatId(fetchedChats[0].id);
          setIsFirstLogin(false); // Reset flag
        }
      } else if (!currentChatId || !currentChatExists) {
        // Standard non-first-login, current chat deleted/not set. Select most recent.
        if (fetchedChats.length > 0) {
          setCurrentChatId(fetchedChats[0].id);
        } else {
          setCurrentChatId(null);
        }
      }
    }, (error) => {
      console.error("Error listening to chats: ", error);
      showModal("Could not load chat list.");
    });

    return () => unsubscribeChats();
  }, [userId, currentChatId, isAuthReady, isFirstLogin]);

  useEffect(() => {
    if (!currentChatId || !userId || !db.current) {
      setMessages([]);
      return;
    };
    const messagesQuery = query(collection(db.current, `artifacts/${firebaseConfig.appId}/users/${userId}/chats/${currentChatId}/messages`), orderBy('timestamp'));
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Error listening to messages: ", error);
      showModal("Could not load chat history.");
    });
    return () => unsubscribe();
  }, [currentChatId, userId]);

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (userInputRef.current && !isLoading && !error && currentChatId) {
      userInputRef.current.focus();
    }
  }, [isLoading, error, currentChatId]);


  // RENDER LOGIC
  if (!isAuthReady) {
    return <div className="loading-screen" style={{ minHeight: '100vh', backgroundColor: '#111827', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Loading Authentication...</div>;
  }

  if (!user) {
    return (
      <>
        <AuthScreen auth={auth.current} onLoginSuccess={handleLoginSuccess} showModal={showModal} />
        {error && (
          <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
            <div className="modal-content" style={{ backgroundColor: '#1f2937', padding: '2rem', borderRadius: '1rem', boxShadow: '0 5px 15px rgba(0, 0, 0, 0.5)', maxWidth: '400px', textAlign: 'center' }}>
              <p className="text-gray-200">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-4 bg-red-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  const userName = user.displayName || user.email;
  const avatarUrl = user.photoURL || 'image_961cdf.png';

  // --- MAIN CHAT UI ---
  return (
    <div className="flex font-sans bg-gray-900 min-h-screen p-4 justify-center items-center">
      <style>{`
        /* Reset margins/padding for full screen */
        body { margin: 0; padding: 0; } 
        #root { height: 100vh; width: 100vw; }
        
        /* FULL WINDOW CHAT: Ensures chat uses 100% viewport dimensions */
        .main-container { 
          display: flex; 
          width: 100vw; 
          height: 100vh; 
          max-width: none; 
          max-height: none; 
          border-radius: 0; 
          overflow: hidden; 
          box-shadow: none; 
        }
        
        .chat-sidebar { width: 300px; background-color: #1f2937; color: #ffffff; padding: 1.5rem; display: flex; flex-direction: column; border-right: 1px solid #374151; flex-shrink: 0;}
        .chat-container { flex-grow: 1; display: flex; flex-direction: column; background-color: #111827; }
        .chat-header { 
            background: #1f2937; 
            color: #ffffff; 
            padding: 1.2rem; 
            text-align: left; 
            font-size: 1.6rem; 
            font-weight: 700; 
            border-bottom: 1px solid #374151; 
            position: relative;
            display: flex; /* Enable flex for title and user info */
            justify-content: space-between;
            align-items: center;
        } 
        
        .header-title {
            font-size: 1.6rem;
            font-weight: 700;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        /* User Profile & Sign Out (Improved Professional Layout) */
        .user-profile-container {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.9rem;
            color: #ccc;
            flex-shrink: 0;
            padding-right: 1.5rem;
        }

        .user-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            overflow: hidden;
            background-color: #4f46e5;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
            font-size: 14px;
            font-weight: bold;
            border: 2px solid #fff;
            box-shadow: 0 0 0 2px #4f46e5;
        }
        .user-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .user-name-small {
            font-size: 0.85rem;
            font-weight: 600;
            color: #fff;
            margin-right: 15px; /* Separate name from sign-out button */
        }

        .signout-btn {
            background-color: #dc2626;
            color: white;
            padding: 0.4rem 0.8rem;
            border-radius: 0.5rem;
            font-size: 0.8rem;
            font-weight: 600;
            transition: background-color 0.2s;
            cursor: pointer;
            border: none;
        }
        .signout-btn:hover { background-color: #ef4444; }


        .chat-messages { flex-grow: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; background-color: #111827; scroll-behavior: smooth; }
        
        /* Message Styling */
        .message { max-width: 75%; padding: 0.8rem 1.2rem; border-radius: 1.5rem; word-wrap: break-word; line-height: 1.6; white-space: pre-wrap; transition: transform 0.2s; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3); }
        .message.user { background-color: #4f46e5; color: #ffffff; align-self: flex-end; border-bottom-right-radius: 0.5rem; }
        .message.bot { 
            background-color: #374151; 
            color: #e5e7eb; 
            align-self: flex-start; 
            border-bottom-left-radius: 0.5rem;
            white-space: normal; 
        }
        /* Custom styling for SVG charts within the chat */
        .message.bot pre {
            background-color: #111827;
            padding: 0.5rem;
            border-radius: 0.5rem;
            margin-top: 0.5rem;
            overflow-x: hidden;
        }

        /* Input/Button Styling */
        .chat-input { display: flex; padding: 1rem; border-top: 1px solid #374151; background-color: #1f2937; }
        .chat-input input { flex-grow: 1; border-radius: 2rem; padding: 0.75rem 1.25rem; outline: none; border: 1px solid #4b5563; background-color: #111827; color: #e5e7eb; transition: border-color 0.2s; }
        .chat-input input:focus { border-color: #4f46e5; }
        .chat-input button { background-color: #4f46e5; color: #ffffff; font-weight: 600; padding: 0.75rem 1.5rem; border-radius: 2rem; margin-left: 0.5rem; cursor: pointer; transition: background-color 0.2s, transform 0.1s; }
        .chat-input button:hover:not(:disabled) { background-color: #6366f1; transform: translateY(-1px); }
        .chat-input button:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Loader */
        .loader { display: flex; align-self: flex-start; padding: 0.8rem 1.2rem; }
        .loader-dot { width: 0.6rem; height: 0.6rem; background-color: #4f46e5; border-radius: 50%; margin: 0 0.2rem; animation: bounce 1.4s infinite ease-in-out both; }
        .loader-dot:nth-child(1) { animation-delay: -0.32s; }
        .loader-dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1.0); } }

        /* Sidebar & Menu Styles */
        .sidebar-actions { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem; }
        .new-chat-btn { background-color: #4f46e5; color: #ffffff; padding: 0.75rem 1.5rem; border-radius: 0.75rem; cursor: pointer; transition: background-color 0.2s; box-shadow: 0 4px 6px rgba(79, 70, 229, 0.2); }
        .new-chat-btn:hover:not(:disabled) { background-color: #6366f1; }
        
        .select-mode-btn { background-color: #374151; color: #ffffff; padding: 0.75rem 1.5rem; border-radius: 0.75rem; cursor: pointer; font-size: 1rem; transition: background-color 0.2s; }
        .select-mode-btn:hover:not(:disabled) { background-color: #4b5563; }

        .bulk-delete-btn { background-color: #dc2626; color: #ffffff; padding: 0.75rem 1.5rem; border-radius: 0.75rem; cursor: pointer; font-size: 1rem; transition: background-color 0.2s; }
        .bulk-delete-btn:hover:not(:disabled) { background-color: #ef4444; }
        
        .chat-item-wrapper { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          padding: 0.6rem 0.5rem; 
          border-radius: 0.5rem; 
          color: #d1d5db; 
          margin-bottom: 0.25rem; 
          position: relative; 
          transition: background-color 0.2s; 
          cursor: pointer;
        }
        .chat-item-wrapper.active { background-color: #4f46e5; color: white; }
        .chat-item-wrapper:hover:not(.active) { background-color: #374151; }

        .chat-item-wrapper.selected { background-color: #6366f1; }
        
        .chat-title-area { 
          flex-grow: 1; 
          overflow: hidden; 
          text-overflow: ellipsis; 
          white-space: nowrap; 
          font-size: 0.95rem; 
          padding-right: 0.5rem; 
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        /* Checkbox style */
        .chat-select-checkbox {
            width: 1rem;
            height: 1rem;
            accent-color: #4f46e5;
            cursor: pointer;
        }

        .menu-button-container { position: relative; height: 1.5rem; width: 1.5rem; flex-shrink: 0; }
        .menu-button { 
          background: none; 
          border: none; 
          color: #b5b5b5; 
          cursor: pointer; 
          padding: 0.25rem; 
          transition: color 0.2s; 
          opacity: 1; 
          position: absolute; 
          top: 50%; 
          left: 50%; 
          transform: translate(-50%, -50%); 
        }
        .menu-button:hover { color: #ffffff; }

        .dropdown-menu { 
          position: absolute; 
          top: 100%; 
          right: 0; 
          background-color: #2d3748; 
          border: 1px solid #4b5563; 
          border-radius: 0.5rem; 
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5); 
          min-width: 180px; 
          z-index: 20; 
          padding: 0.5rem 0; 
          transform: translateY(5px); 
          animation: fadeIn 0.1s ease-out; 
        }
        .menu-item { 
          padding: 0.6rem 1rem; 
          font-size: 0.9rem; 
          color: #e5e7eb; 
          cursor: pointer; 
          transition: background-color 0.15s; 
          display: flex; 
          align-items: center; 
          gap: 0.5rem; 
          font-weight: 500;
          border-radius: 0.25rem;
          margin: 0 0.5rem;
        }
        .menu-item:hover { background-color: #4b5563; }
        .menu-item.delete { color: #f87171; }
        .menu-item.clear { color: #34d399; }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(0); } to { opacity: 1; transform: translateY(5px); } }

        @media (max-width: 768px) {
            .main-container { flex-direction: column; height: 100vh; max-height: none; border-radius: 0; }
            .chat-sidebar { width: 100%; height: 250px; border-radius: 0; border-right: none; border-bottom: 1px solid #374151; flex-shrink: 0; }
            .chat-list-container { max-height: 100px; overflow-y: auto; }
            .chat-container { border-radius: 0; height: calc(100% - 250px); }
            .sidebar-actions { flex-direction: row; justify-content: space-between; gap: 1rem; }
            .new-chat-btn, .select-mode-btn, .bulk-delete-btn { flex-grow: 1; padding: 0.75rem 1rem; text-align: center; }
            .user-profile-container { padding-right: 0.5rem; gap: 5px; }
            .user-name-small { margin-right: 5px; }
        }
      `}</style>
      <div className="main-container">
        <div className="chat-sidebar">
          {/* Sidebar Header with Dynamic Content */}
          <div className="chat-sidebar-header font-bold text-xl mb-6 flex items-center gap-3 text-indigo-400">
            {/* Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path fill="#4f46e5" d="M12 21c-4.418 0-8-3.582-8-8 0-2.122 1.487-4.148 2.66-5.83A7.962 7.962 0 0112 5.07V3a1 1 0 011-1h1a1 1 0 011 1v2.07a7.962 7.962 0 014.34 1.17c1.173 1.682 2.66 3.708 2.66 5.83 0 4.418-3.582 8-8 8z" clipRule="evenodd" />
              <path stroke="#1f2937" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 21c-4.418 0-8-3.582-8-8 0-2.122 1.487-4.148 2.66-5.83A7.962 7.962 0 0112 5.07V3m0 18a8 8 0 008-8 8 8 0 00-2.66-5.83c.1-.17.2-.34.3-.51L17 5.07M12 5.07a7.962 7.962 0 014.34 1.17c1.173 1.682 2.66 3.708 2.66 5.83m0 0H12m6 0a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {!isSelectMode ? 'FinBot Pro' : (
              <button
                onClick={() => { setIsSelectMode(false); setSelectedChatIds([]); }}
                className="text-sm font-normal text-gray-400 hover:text-white transition-colors"
              >
                Exit Select Mode ❌
              </button>
            )}
          </div>

          <div className="sidebar-actions">
            {!isSelectMode && (
              <>
                <button onClick={() => createNewChat(userId)} className="new-chat-btn" disabled={isLoading}>
                  + Start New Query
                </button>
                <button
                  onClick={() => setIsSelectMode(true)}
                  className="select-mode-btn"
                  disabled={isLoading || chatList.length === 0}
                >
                  Select/Bulk Delete 🗑️
                </button>
              </>
            )}

            {/* Bulk Delete Button (Visible in select mode if items are selected) */}
            {isSelectMode && selectedChatIds.length > 0 && (
              <button
                onClick={deleteSelectedChats}
                className="bulk-delete-btn"
                disabled={isLoading}
              >
                Delete Selected ({selectedChatIds.length})
              </button>
            )}

            {/* Clear All History (Fallback/Separate function, visible in select mode if nothing is selected) */}
            {isSelectMode && selectedChatIds.length === 0 && (
              <button
                onClick={clearAllHistory}
                className="bulk-delete-btn"
                disabled={isLoading || chatList.length === 0}
              >
                Delete ALL History
              </button>
            )}
          </div>

          <div className="chat-list-container flex-grow overflow-y-auto pr-1">
            {chatList.map((chat) => (
              <div
                key={chat.id}
                // Apply 'selected' class if in select mode and ID is in the array
                className={`chat-item-wrapper ${chat.id === currentChatId ? 'active' : ''} ${isSelectMode && selectedChatIds.includes(chat.id) ? 'selected' : ''}`}
                onClick={isSelectMode ? () => handleToggleChatSelect(chat.id) : () => handleSelectChat(chat.id)}
              >
                <div
                  className="chat-title-area"
                  title={chat.title || `Chat...`}
                >
                  {/* Checkbox for Select Mode */}
                  {isSelectMode && (
                    <input
                      type="checkbox"
                      className="chat-select-checkbox"
                      checked={selectedChatIds.includes(chat.id)}
                      // Prevent click on checkbox from toggling twice due to wrapper click
                      onChange={() => handleToggleChatSelect(chat.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  {chat.title || `Chat...`}
                </div>

                {/* Meatballs Menu Button Container (Hidden in select mode) */}
                {!isSelectMode && (
                  <div className="menu-button-container" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setOpenMenuId(openMenuId === chat.id ? null : chat.id)}
                      className={`menu-button ${openMenuId === chat.id ? 'open' : ''}`}
                      title="Chat Options"
                      disabled={isLoading}
                    >
                      {/* Meatballs Icon (Three Vertical Dots) */}
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                    </button>

                    {/* Dropdown Menu */}
                    {openMenuId === chat.id && (
                      <div className="dropdown-menu">
                        <div
                          className="menu-item clear"
                          onClick={() => clearChatMessages(chat.id)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          Clear Chat Messages
                        </div>
                        <div
                          className="menu-item delete"
                          onClick={() => deleteChat(chat.id)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          Delete Chat Tab
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>

        <div className="chat-container">
          <div className="chat-header">
            <div className="header-title">
              Project Pulse: Financial Data & Insights
            </div>
            {user && (
              <div className="user-profile-container">
                <div className="user-avatar">
                  <img src={avatarUrl} alt="User Avatar" />
                </div>
                <span className="user-name-small">
                  {userName}
                </span>
                <button
                  onClick={handleSignOut}
                  className="signout-btn"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
          <div className="info-bar" style={{ padding: '0.5rem 1rem', backgroundColor: '#2d3748', color: '#9ca3af', fontSize: '0.75rem', textAlign: 'center' }}>User Session ID: {userId || 'Connecting...'}</div>
          <div className="chat-messages" ref={chatMessagesRef}>
            {messages.map((msg) => {
              // --- NEW CHART RENDERING LOGIC ---
              const chartPayloadMarker = msg.text.indexOf(CHART_PAYLOAD_START);

              let chartElement = null;
              let textContent = msg.text;

              if (chartPayloadMarker !== -1) {
                // 1. Extract the JSON string following the marker
                const jsonString = msg.text.substring(chartPayloadMarker + CHART_PAYLOAD_START.length);

                // 2. Separate the plain text content
                textContent = msg.text.substring(0, chartPayloadMarker).trim();

                try {
                  // 3. Parse the JSON payload
                  const payload = JSON.parse(jsonString);

                  // 4. Render the ChartRenderer component (using the enhanced SVG placeholder)
                  chartElement = (
                    <div style={{ alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', width: '100%', maxWidth: '400px' }}>
                      <div dangerouslySetInnerHTML={{ __html: renderStockChartPlaceholder(payload.symbol) }} />
                      <p style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.5rem', textAlign: 'center' }}>
                        Source: Alpha Vantage (Simulated Data)
                      </p>
                    </div>
                  );
                } catch (e) {
                  // Fallback if JSON parsing fails (show text as is)
                  console.error("Failed to parse chart JSON:", e);
                  textContent = msg.text;
                }
              }
              // --- END NEW CHART RENDERING LOGIC ---

              // 2. Render the message component
              return (
                <div key={msg.id} className={`message ${msg.sender}`}>
                  {/* Render the plain text content */}
                  {textContent}

                  {/* Render the chart element (only visible if chartElement is set) */}
                  {chartElement}
                </div>
              );
            })}
            {isLoading && (
              <div className="loader">
                <div className="loader-dot"></div>
                <div className="loader-dot"></div>
                <div className="loader-dot"></div>
              </div>
            )}
            {!currentChatId && !isLoading && (
              <div style={{ color: '#9ca3af', textAlign: 'center', margin: '2rem' }}>
                <p>Welcome! Click **'+ Start New Query'** to begin a new conversation.</p>
              </div>
            )}
          </div>
          <form className="chat-input" onSubmit={handleSubmit}>
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Ask 'price of google' or 'dollar to rupee'..."
              required
              disabled={isLoading || !currentChatId}
              ref={userInputRef}
            />
            <button type="submit" disabled={isLoading || !userInput.trim() || !currentChatId}>
              Send
            </button>
          </form>
        </div>
      </div>
      {error && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div className="modal-content" style={{ backgroundColor: '#1f2937', padding: '2rem', borderRadius: '1rem', boxShadow: '0 5px 15px rgba(0, 0, 0, 0.5)', maxWidth: '400px', textAlign: 'center' }}>
            <p className="text-gray-200">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-4 bg-red-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;