import React, { useState, useEffect, useCallback } from 'react';
import { XCircle, Link as LinkIcon, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion'; 

function InputForm({ onSubmit }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationState, setValidationState] = useState('initial'); // 'initial', 'valid', 'invalid'
  const [errorMessage, setErrorMessage] = useState('');

  const isValidUrl = (string) => {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  };

  const isValidLetterboxdUrl = (url) => {
    // Basic check for letterboxd.com domain
    if (!url.includes('letterboxd.com/')) return false;
    
    // Check for valid structure: letterboxd.com/username and letterboxd.com/username/list/listname
    // But reject letterboxd.com/username/lists
    if (url.includes('/lists')) return false;
    
    const pattern = /^https?:\/\/(www\.)?letterboxd\.com\/[^/]+\/?$/;
    const patternWithList = /^https?:\/\/(www\.)?letterboxd\.com\/[^/]+\/list(\/.*)?$/;
    
    return pattern.test(url) || patternWithList.test(url);
  };

  const validateInput = useCallback((value) => {
    // Empty or whitespace-only input should be initial state
    if (!value || !value.trim()) {
      setValidationState('initial');
      setErrorMessage('');
      return;
    }
  
    // Base URL check - if it's not a Letterboxd URL, show as invalid
    if (!value.includes('letterboxd.com/')) {
      setValidationState('initial');
      setErrorMessage('');
      return;
    }
  
    // Everything beyond letterboxd.com/ is valid except /lists/
    if (value.includes('/lists/')) {
      setValidationState('invalid');
      setErrorMessage('Please enter a valid Letterboxd list URL');
    } else {
      setValidationState('valid');
      setErrorMessage('');
    }
  }, []);

  useEffect(() => {
    // Don't validate if input is empty
    if (!input.trim()) {
      setValidationState('initial');
      setErrorMessage('');
      return;
    }
  
    const timeoutId = setTimeout(() => validateInput(input.trim()), 300);
    return () => clearTimeout(timeoutId);
  }, [input, validateInput]);

  const handleFetchMovies = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch(`http://localhost:3001/fetch-movies?url=${encodeURIComponent(input)}`);
      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch movies');
      }
  
      const { data: { movies } } = data;
        
      if (!movies?.length) {
        throw new Error('No movies found in the provided URL');
      }
      if (movies.length < 2) {
        throw new Error('Please enter a link with at least 2 movies');
      }
      onSubmit(movies);
    } catch (error) {
      console.error("Error fetching movies:", error);
      setErrorMessage(error.message || "Failed to fetch movies. Please check the URL and try again.");
      setValidationState('invalid');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input) {
      setErrorMessage("Please enter a URL.");
      setValidationState('invalid');
      return;
    }
    if (!isValidUrl(input)) {
      setErrorMessage("Please enter a valid URL.");
      setValidationState('invalid');
      return;
    }
    handleFetchMovies();
  };

  return (
    <div className="max-w-2xl mx-auto p-6 card bg-base-200 shadow-xl">
      <h2 className="text-2xl font-bold mb-6 text-center">Import Your Movie List</h2>
      
      <div className="mb-8 text-sm">
      <div className="alert bg-primary/10 text-primary-content shadow-lg">
        <LinkIcon className="w-5 h-5 text-accent" />
        <span className="text-base-content/80">
          Copy and paste a Letterboxd list URL to get started
        </span>
      </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
      <div className="form-control w-full">
        <label className="label">
          <span className="label-text">Letterboxd List URL</span>
        </label>
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setValidationState('initial'); // Reset validation state on each change
              setInput(e.target.value);
            }}
            onPaste={(e) => {
              e.preventDefault();
              const pastedText = e.clipboardData.getData('text');
              const cleanUrl = pastedText.trim();
              
              if (isValidLetterboxdUrl(cleanUrl)) {
                setInput(cleanUrl);
                setTimeout(() => validateInput(cleanUrl), 0);
              } else {
                setValidationState('invalid');
                setErrorMessage('Please paste a valid Letterboxd list URL');
              }
            }}
            placeholder="https://letterboxd.com/username/list/..."
            className={`input input-bordered w-full pr-20 ${
              validationState === 'valid' ? 'input-success border-primary/50' : 
              validationState === 'invalid' ? 'input-error border-error/50' : ''
            }`}
            disabled={loading}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck="false"
          />
          <div className="absolute inset-y-0 right-3 flex items-center gap-2">
            <AnimatePresence>
              {validationState === 'valid' ? (
                <motion.img
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="w-6 h-6 rounded-sm"
                  src="https://a.ltrbxd.com/logos/letterboxd-mac-icon.png"
                  alt="Letterboxd"
                  onError={(e) => e.target.style.display = 'none'}
                />
              ) : validationState === 'invalid' ? (
                <XCircle className="w-5 h-5 text-error" />
              ) : (
                <LinkIcon className="w-5 h-5 text-base-content opacity-30" />
              )}
            </AnimatePresence>
          </div>
        </div>
        {errorMessage && (
          <label className="label">
            <span className="label-text-alt text-error">{errorMessage}</span>
          </label>
        )}
      </div>

        <div className="text-center">
        <button 
          type="submit" 
          disabled={loading || validationState !== 'valid'}
          className={`btn btn-wide gap-2 hover:brightness-110 transition-all
            ${validationState === 'valid' ? 'btn-primary' : 'btn-disabled'}`}
        >
          {loading ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              Fetching Movies...
            </>
          ) : (
            <>
              Start Ranking
              <ArrowRight className={`w-4 h-4 ${validationState === 'valid' ? 'text-primary-content' : 'text-accent'}`} />
            </>
          )}
        </button>
        </div>
      </form>

      <div className="divider mt-8">How It Works</div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
        <div className="card bg-base-300 p-4">
          <h3 className="font-bold mb-2">1. Import</h3>
          <p className="text-sm text-base-content/70">Paste your Letterboxd list URL</p>
        </div>
        <div className="card bg-base-300 p-4">
          <h3 className="font-bold mb-2">2. Compare</h3>
          <p className="text-sm text-base-content/70">Choose between pairs of movies</p>
        </div>
        <div className="card bg-base-300 p-4">
          <h3 className="font-bold mb-2">3. Rank</h3>
          <p className="text-sm text-base-content/70">Get your personalized ranking</p>
        </div>
      </div>
    </div>
  );
}

export default InputForm;