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

// Chart imports
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';

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
// Prefer environment variables in production (Vite: import.meta.env.VITE_*)
// Fallback to the constants already present in your file for now.
const GEMINI_API_KEY = (import.meta && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) || process.env.VITE_GEMINI_API_KEY || "AIzaSyDKVxGXSzQL5_du05FkTuyeQl5St_0MYbM";
const ALPHA_VANTAGE_KEY = (import.meta && import.meta.env && import.meta.env.VITE_ALPHA_VANTAGE_KEY) || process.env.VITE_ALPHA_VANTAGE_KEY || "6RKTJK2BFKQWX9QC";
const COINGECKO_API_BASE = (import.meta && import.meta.env && import.meta.env.VITE_COINGECKO_API_BASE) || process.env.VITE_COINGECKO_API_BASE || "https://api.coingecko.com/api/v3";
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

const renderChartPayload = (symbol, rawData, chartData) => {
  // This function formats the data into a JSON structure that the frontend will recognize
  const payload = {
    symbol: symbol,
    provider: "AlphaVantage",
    meta: rawData?.meta || null,
    chart: chartData // { labels: [...], values: [...] }
  };
  // Return the special string prefix followed by the JSON payload
  return `${CHART_PAYLOAD_START}${JSON.stringify(payload)}`;
};

// --- InvestmentChart Component (renders inline charts when message contains CHART payload) ---
const InvestmentChart = ({ labels, values, label = "Portfolio Value (₹)" }) => {
  const data = {
    labels,
    datasets: [
      {
        label,
        data: values,
        fill: false,
        tension: 0.25,
        borderWidth: 2,
        pointRadius: 1,
      },
    ],
  };
  const options = {
    responsive: true,
    plugins: {
      legend: { display: true },
      tooltip: { mode: 'index', intersect: false }
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: {
          callback: (v) => typeof v === 'number' ? Math.round(v).toLocaleString() : v
        }
      }
    }
  };
  return <div style={{ maxWidth: '700px', marginTop: '12px' }}><Line data={data} options={options} /></div>;
};

// --- LLM-POWERED HELPER & DATA FETCHING FUNCTIONS ---
// correctUserTypo, getCurrencyCodesFromText, extractStockSymbol, generateContent are mostly kept (slight improvements)
const correctUserTypo = async (prompt) => {
  if (!GEMINI_API_KEY) return prompt;
  const systemPrompt = `Correct spelling mistakes in the following user query for a financial chatbot. Only return the corrected query.`;
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

const extractStockSymbol = async (prompt) => {
  if (!GEMINI_API_KEY) return prompt;
  const systemPrompt = `Analyze the user query for a financial stock or mutual fund. Extract the main stock ticker or company/fund name. Respond ONLY with the extracted name/ticker in plain text. If no company/fund is found, return an empty string.`;
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

// New: analyzeUserQuery - returns structured JSON intent & params
const analyzeUserQuery = async (prompt) => {
  if (!GEMINI_API_KEY) return { intent: 'general' };
  const systemPrompt = `
You are a financial assistant. Analyze the query and return a JSON object only (no extra text) with the following keys:
- intent: one of ["investment_analysis","comparison","stock_price","mutual_fund_lookup","crypto_price","market_status","forex","general"]
- entities: array of detected entities (company names, fund names, tickers)
- parameters: object with keys possibly present: amount (number), currency, frequency ("monthly"/"yearly"/"one-time"), duration_years (number), start_date, end_date
- visualize: boolean (true if user asked for a chart)
Example output:
{"intent":"investment_analysis","entities":["TCS"],"parameters":{"amount":50000,"frequency":"yearly","duration_years":5},"visualize":true}
`;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const payload = { contents: [{ parts: [{ text: `${systemPrompt}\n\nQuery: "${prompt}"` }] }] };
  try {
    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { intent: 'general' };
    // Try to parse JSON from the returned text (strip code fences if present)
    const trimmed = text.trim().replace(/(^```json|```$)/g, '').trim();
    try {
      const parsed = JSON.parse(trimmed);
      return parsed;
    } catch (e) {
      // If failed to parse, attempt to find a JSON substring
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch (e2) { return { intent: 'general' }; }
      }
      return { intent: 'general' };
    }
  } catch (error) {
    console.error("analyzeUserQuery failed:", error);
    return { intent: 'general' };
  }
};

// generateContent: fallback LLM response generator (keeps your original style)
const generateContent = async (userPrompt, messageHistory = []) => {
  if (!GEMINI_API_KEY) return "Error: Gemini API key is missing.";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const systemPrompt = "Act as a specialized Investor Model. Provide concise, data-driven, and insightful responses. Focus on key metrics, market trends, and risk analysis.";
  const payload = {
    contents: [...messageHistory.map(msg => ({ role: msg.sender === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] })), { role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
  };
  try {
    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return text;
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

// Fetch historical monthly adjusted prices for a symbol (Alpha Vantage)
const fetchHistoricalPrices = async (symbol, years = 5) => {
  if (!ALPHA_VANTAGE_KEY) return { error: "Missing Alpha Vantage key" };
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
    const response = await fetch(url);
    const json = await response.json();
    if (!json["Monthly Adjusted Time Series"]) {
      if (json.Note) return { error: `AlphaVantage: ${json.Note}` };
      return { error: "No monthly data found" };
    }
    const ts = json["Monthly Adjusted Time Series"];
    // Convert to sorted array of { date, close }
    const arr = Object.keys(ts).map(date => ({ date, close: parseFloat(ts[date]["4. close"]) })).sort((a, b) => (new Date(a.date) - new Date(b.date)));
    // Filter by years window
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    const filtered = arr.filter(d => new Date(d.date) >= cutoff);
    return { meta: json['Meta Data'] || null, data: filtered };
  } catch (error) {
    console.error("fetchHistoricalPrices error:", error);
    return { error: "Network error fetching historical prices" };
  }
};

// Investment simulation: supports monthly/yearly SIP or lump-sum
const simulateInvestment = (priceSeries /* ascending dates */, amountPerPeriod, frequency = 'yearly') => {
  // frequency: 'monthly' or 'yearly' or 'one-time'
  // priceSeries: array sorted ascending by date [{date, close}]
  const portfolio = [];
  let totalUnits = 0;
  let invested = 0;

  if (frequency === 'one-time') {
    // invest once at first available price
    if (priceSeries.length === 0) return { portfolio: [], currentValue: 0, invested: 0, totalReturn: 0, cagr: 0 };
    const firstPrice = priceSeries[0].close;
    totalUnits += amountPerPeriod / firstPrice;
    invested += amountPerPeriod;
    priceSeries.forEach(p => {
      const value = totalUnits * p.close;
      portfolio.push({ date: p.date, value, invested });
    });
  } else if (frequency === 'yearly') {
    // invest once at each year boundary: pick one sample per 12 months
    for (let i = 0; i < priceSeries.length; i++) {
      // choose year-end months by approximate step
      if (i % 12 === 0) {
        const price = priceSeries[i].close;
        const units = amountPerPeriod / price;
        totalUnits += units;
        invested += amountPerPeriod;
      }
      const value = totalUnits * priceSeries[i].close;
      portfolio.push({ date: priceSeries[i].date, value, invested });
    }
  } else if (frequency === 'monthly') {
    // invest every month
    for (let i = 0; i < priceSeries.length; i++) {
      const price = priceSeries[i].close;
      const units = amountPerPeriod / price;
      totalUnits += units;
      invested += amountPerPeriod;
      const value = totalUnits * priceSeries[i].close;
      portfolio.push({ date: priceSeries[i].date, value, invested });
    }
  } else {
    // fallback treat as yearly
    return simulateInvestment(priceSeries, amountPerPeriod, 'yearly');
  }

  const currentValue = portfolio.length > 0 ? portfolio[portfolio.length - 1].value : 0;
  const totalReturn = invested === 0 ? 0 : ((currentValue - invested) / invested) * 100;

  // Compute approximate CAGR: using invested start date and current value
  let cagr = 0;
  if (invested > 0 && portfolio.length > 0) {
    const startDate = new Date(portfolio[0].date);
    const endDate = new Date(portfolio[portfolio.length - 1].date);
    const years = Math.max( (endDate - startDate) / (365.25 * 24 * 3600 * 1000), 0.0001);
    // For SIP it's approximate; we compute XIRR-like? Keep simple: approximate CAGR as (currentValue/invested)^(1/years)-1
    try {
      cagr = Math.pow((currentValue / invested) || 1, 1 / years) - 1;
      cagr = cagr * 100;
    } catch (e) {
      cagr = 0;
    }
  }

  return { portfolio, currentValue, invested, totalReturn, cagr };
};

// --- End of helper functions ---

// --- Chat UI components (AuthScreen, PreviewChartCard) ---
// For brevity reuse your existing AuthScreen and preview components from the uploaded file.
// Minimal AuthScreen to keep app compile-safe if not logged in (we'll render original AuthScreen code earlier if needed).
// (In this file we rely on the AuthScreen defined later in the original file content — keep that content if present)

// --- MAIN APP ---
function App() {
  // --- state & refs (mirrors your existing app variables) ---
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

  // The rest of your chat management functions (createNewChat, deleteChat, clearChatMessages, etc.)
  // Reuse the implementations from your existing App.jsx. For brevity they are not repeated here.

  // --- CORE MESSAGE HANDLER (updated with intent -> data -> chart pipeline) ---
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

    // 1) Try structured intent analysis
    const intentObj = await analyzeUserQuery(correctedMessageText);

    // Defaults
    let botResponse = null;
    let stockSymbol = null;

    // If intent is investment_analysis -> perform simulation pipeline
    if (intentObj && intentObj.intent === 'investment_analysis' && intentObj.entities && intentObj.entities.length > 0) {
      try {
        const entity = intentObj.entities[0]; // e.g., "TCS" or "HDFC Equity Fund"
        // Resolve symbol via AlphaVantage symbol search if possible
        let symbol = null;

        // Try extractStockSymbol for better resolution
        const extracted = await extractStockSymbol(entity || correctedMessageText);
        const searchKeywords = encodeURIComponent(extracted || entity);

        // Symbol search on Alpha Vantage
        const searchUrl = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${searchKeywords}&apikey=${ALPHA_VANTAGE_KEY}`;
        const searchResp = await fetch(searchUrl);
        const searchJson = await searchResp.json();
        const matches = searchJson.bestMatches || [];
        const bestMatch = matches.find(m => m['1. symbol'].endsWith('.NSE') || m['1. symbol'].endsWith('.BSE')) || matches[0];
        if (bestMatch) {
          symbol = bestMatch['1. symbol'];
        } else {
          // fallback: try using the entity directly
          symbol = entity;
        }

        // Use duration and frequency from intentObj.parameters
        const params = intentObj.parameters || {};
        const amount = params.amount || params.investment_amount || 0;
        const frequency = (params.frequency || 'yearly').toLowerCase();
        const duration_years = params.duration_years || params.duration || 5;

        // Fetch historical prices dynamically for 'duration_years'
        const hist = await fetchHistoricalPrices(symbol, Math.max(1, duration_years));
        if (hist.error) {
          botResponse = `Could not fetch historical data for ${symbol}. Reason: ${hist.error}`;
        } else if (!hist.data || hist.data.length === 0) {
          botResponse = `No sufficient historical price series available for ${symbol}.`;
        } else {
          // Simulate investment
          const sim = simulateInvestment(hist.data, amount, frequency);
          // Build a friendly summary
          const invested = sim.invested || 0;
          const currentValue = sim.currentValue || 0;
          const totalReturn = sim.totalReturn || 0;
          const cagr = sim.cagr || 0;

          botResponse = `If you invested ₹${Number(amount).toLocaleString()} (${frequency}) in ${entity} (${symbol}) for ${duration_years} years:\n\n` +
            `• Invested: ₹${Math.round(invested).toLocaleString()}\n` +
            `• Current value: ₹${Math.round(currentValue).toLocaleString()}\n` +
            `• Total return: ${totalReturn.toFixed(2)}%\n` +
            `• Approx. CAGR: ${cagr.toFixed(2)}%`;

          // Prepare chart payload: pick monthly snapshots from sim.portfolio
          const labels = sim.portfolio.map(p => p.date);
          const values = sim.portfolio.map(p => Math.round(p.value));
          const chartPayloadStr = renderChartPayload(symbol, hist.meta || {}, { labels, values });
          botResponse = botResponse + '\n\n' + chartPayloadStr;
          stockSymbol = symbol;
        }
      } catch (err) {
        console.error("investment_analysis pipeline failed:", err);
        botResponse = "Sorry — I couldn't complete the investment simulation due to an internal error.";
      }
    } else {
      // Fallback to existing routing logic (index, forex, crypto, stock price)
      const hasFinancialKeywords = /\b(stock|price|volume|shares|ticker|value|nse|bse)\b/.test(lowerCaseMessage);

      if (/^\s*(hi|hello|hey|greetings)\s*$/.test(lowerCaseMessage)) {
        const greetings = ["Hello! How can I assist with market data today?", "Hi there! What can I provide for you?"];
        botResponse = greetings[Math.floor(Math.random() * greetings.length)];
      } else if (/\b(nifty 50|nifty|sensex)\b/.test(lowerCaseMessage)) {
        const indexResult = await fetchIndexData(lowerCaseMessage);
        botResponse = indexResult.response;
        stockSymbol = indexResult.symbol;
      } else if (/\b(market status)\b/.test(lowerCaseMessage)) {
        botResponse = await fetchMarketStatus();
      } else if (/[a-z]{3}\s*(to|\/)\s*[a-z]{3}/.test(lowerCaseMessage) || /\b(rupee|dollar|euro|yen|pound|currency|exchange rate)\b/.test(lowerCaseMessage)) {
        botResponse = await fetchForexData(lowerCaseMessage);
      } else if (/\b(bitcoin|ethereum|crypto|dogecoin|solana|btc|eth)\b/.test(lowerCaseMessage)) {
        botResponse = await fetchCryptoData(lowerCaseMessage);
      } else if (hasFinancialKeywords) {
        const stockDataResult = await fetchStockData(correctedMessageText);
        botResponse = stockDataResult.response;
        stockSymbol = stockDataResult.symbol;
      } else {
        // final fallback: ask Gemini for general answer
        botResponse = await generateContent(correctedMessageText, messages);
      }
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

  // --- Message render helper: parse messages and detect CHART payload ---
  const renderMessageContent = (msg) => {
    if (!msg || !msg.text) return null;
    const text = msg.text;
    // detect chart payload
    const idx = text.indexOf(CHART_PAYLOAD_START);
    if (idx !== -1) {
      const plainText = text.substring(0, idx).trim();
      const payloadStr = text.substring(idx + CHART_PAYLOAD_START.length);
      try {
        const payload = JSON.parse(payloadStr);
        // Render plain text + chart
        return (
          <div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{plainText}</div>
            <InvestmentChart labels={payload.chart.labels} values={payload.chart.values} label={`${payload.symbol} - Portfolio`} />
          </div>
        );
      } catch (e) {
        // If parsing fails, just show raw text
        return <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>;
      }
    }
    // no chart payload
    return <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>;
  };

  // --- Initialization and listeners (kept similar to your file) ---
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
        if (fetchedChats.length === 0) {
          // create initial chat & prompt
          (async () => {
            setIsLoading(true);
            try {
              const newChatRef = await addDoc(collection(db.current, `artifacts/${firebaseConfig.appId}/users/${userId}/chats`), {
                createdAt: serverTimestamp(), title: 'Welcome Chat'
              });
              setCurrentChatId(newChatRef.id);
              const initialBotMessage = `👋 Welcome to Investor Ai Model! I'm here to provide quick, data-driven financial insights.\n\nTo get started, try one of these trending prompts:\n\n` +
                TRENDING_PROMPTS.map(p => `- *${p}*`).join('\n');
              await addDoc(collection(db.current, `artifacts/${firebaseConfig.appId}/users/${userId}/chats/${newChatRef.id}/messages`), {
                text: initialBotMessage, sender: 'bot', timestamp: serverTimestamp()
              });
            } catch (error) {
              console.error("Error creating new chat with prompt:", error);
              showModal("Failed to create a new chat session.");
            } finally {
              setIsLoading(false);
              setIsFirstLogin(false);
            }
          })();
        } else {
          setCurrentChatId(fetchedChats[0].id);
          setIsFirstLogin(false);
        }
      } else if (!currentChatId || !currentChatExists) {
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

  // Simple submit handler hooking into handleSendMessage
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

  // Render loading/auth screens roughly similar to your original file
  if (!isAuthReady) {
    return <div className="loading-screen" style={{ minHeight: '100vh', backgroundColor: '#111827', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Loading Authentication...</div>;
  }

  if (!user) {
    // You had a full AuthScreen component in your file. Use that.
    // For safety if not present, show prompt to sign in anonymously
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', color: 'white' }}>
        <div style={{ textAlign: 'center', maxWidth: 700 }}>
          <h2 style={{ fontSize: 28, marginBottom: 12 }}>Please sign in</h2>
          <p style={{ marginBottom: 18 }}>Sign in to use the Investor AI Model. You can continue as guest (anonymous) or sign in with Google.</p>
          <button onClick={async () => {
            try {
              await setPersistence(getAuth(), browserSessionPersistence);
              const res = await signInAnonymously(getAuth());
              handleLoginSuccess(res.user.uid);
            } catch (err) {
              console.error(err);
              showModal("Anonymous sign-in failed.");
            }
          }} style={{ padding: '10px 16px', background: '#4f46e5', color: 'white', borderRadius: 8, border: 'none', marginRight: 8 }}>Continue as Guest</button>
          <button onClick={async () => {
            try {
              await setPersistence(getAuth(), browserSessionPersistence);
              const provider = new GoogleAuthProvider();
              const result = await signInWithPopup(getAuth(), provider);
              handleLoginSuccess(result.user.uid);
            } catch (err) {
              console.error(err);
              showModal("Social login failed.");
            }
          }} style={{ padding: '10px 16px', background: '#111827', color: 'white', borderRadius: 8, border: '1px solid #374151' }}>Sign in with Google</button>
          {error && <div style={{ marginTop: 16, color: 'salmon' }}>{error}</div>}
        </div>
      </div>
    );
  }

  const userName = user.displayName || user.email;
  const avatarUrl = user.photoURL || 'image_961cdf.png';

  // main chat UI (simplified from original for focus)
  return (
    <div className="flex font-sans bg-gray-900 min-h-screen p-4 justify-center items-center">
      <div style={{ width: '100%', maxWidth: 1200, display: 'flex', gap: 16 }}>
        {/* Sidebar simplified */}
        <div style={{ width: 300, background: '#1f2937', padding: 16, borderRadius: 8 }}>
          <div style={{ fontWeight: 800, color: '#c7d2fe', marginBottom: 12 }}>Investor AI Model</div>
          <button onClick={async () => {
            // create new chat
            try {
              const newChatRef = await addDoc(collection(db.current, `artifacts/${firebaseConfig.appId}/users/${userId}/chats`), {
                createdAt: serverTimestamp(), title: 'New Chat'
              });
              setCurrentChatId(newChatRef.id);
            } catch (err) { console.error(err); showModal("Could not create chat"); }
          }} style={{ width: '100%', padding: 12, background: '#4f46e5', color: 'white', borderRadius: 8, border: 'none', marginBottom: 8 }}>New Chat</button>
          <div style={{ marginTop: 12 }}>
            {chatList.map(c => (
              <div key={c.id} style={{ padding: '8px 10px', background: c.id === currentChatId ? '#4f46e5' : 'transparent', borderRadius: 6, color: '#fff', marginBottom: 6, cursor: 'pointer' }} onClick={() => setCurrentChatId(c.id)}>
                {c.title || 'Untitled'}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>{(userName || 'U')[0]}</div>
              <div style={{ color: '#e5e7eb' }}>{userName}</div>
              <button onClick={handleSignOut} style={{ marginLeft: 'auto', padding: '6px 8px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6 }}>Sign out</button>
            </div>
          </div>
        </div>

        {/* Chat container */}
        <div style={{ flexGrow: 1, background: '#0b1220', borderRadius: 8, display: 'flex', flexDirection: 'column', minHeight: '70vh' }}>
          <div style={{ padding: 12, borderBottom: '1px solid #1f2937', color: 'white', fontWeight: 700 }}>Chat</div>
          <div ref={chatMessagesRef} style={{ padding: 16, overflowY: 'auto', flexGrow: 1 }}>
            {messages.map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                <div style={{
                  maxWidth: '75%',
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: m.sender === 'user' ? '#4f46e5' : '#263241',
                  color: 'white',
                  whiteSpace: 'pre-wrap'
                }}>
                  {renderMessageContent(m)}
                </div>
              </div>
            ))}
            {isLoading && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 8, height: 8, background: '#4f46e5', borderRadius: 8, animation: 'bounce 1s infinite alternate' }} />
                <div style={{ width: 8, height: 8, background: '#4f46e5', borderRadius: 8, animation: 'bounce 1s 0.2s infinite alternate' }} />
                <div style={{ width: 8, height: 8, background: '#4f46e5', borderRadius: 8, animation: 'bounce 1s 0.4s infinite alternate' }} />
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} style={{ padding: 12, display: 'flex', gap: 8, borderTop: '1px solid #1f2937' }}>
            <input ref={userInputRef} value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="Ask anything about stocks, funds, SIPs..." style={{ flexGrow: 1, padding: 12, borderRadius: 12, background: '#071025', color: 'white', border: '1px solid #1f2937' }} />
            <button disabled={!userInput.trim()} type="submit" style={{ padding: '10px 14px', borderRadius: 12, background: '#4f46e5', color: 'white', border: 'none' }}>Send</button>
          </form>
        </div>
      </div>

      {/* Simple modal for errors */}
      {error && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#1f2937', padding: 12, borderRadius: 8, color: 'white' }}>
          {error} <button onClick={() => setError(null)} style={{ marginLeft: 12, background: '#ef4444', color: 'white', border: 'none', padding: '4px 8px', borderRadius: 6 }}>Close</button>
        </div>
      )}
    </div>
  );
}

export default App;
