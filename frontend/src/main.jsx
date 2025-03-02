import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './globals.css'

// Start memory monitoring in development
if (typeof window !== 'undefined' && window.memoryMonitor) {
  window.memoryMonitor.start();
  console.log('Memory monitoring enabled');
}

// Force cleanup on route changes or component unmounts
const cleanupMemory = () => {
  if (typeof window !== 'undefined' && window.gcCollect) {
    window.gcCollect();
  }
};

// Add event listener for route changes
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupMemory);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)