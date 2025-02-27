'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useMovieStore } from '../store/movieStore';

export default function RankingProcess({ onFinish }) {
  const {
    movies,
    rankings,
    comparisons,
    maxComparisons,
    isCurrentComparisonHighImpact,
    comparisonHistory,
    incrementComparisons,
    setIsCurrentComparisonHighImpact,
    addComparisonToHistory,
    updateRankings,
    setPendingUpdates
  } = useMovieStore();
  
  const [pair, setPair] = useState([]);
  const [moviesUsed, setMoviesUsed] = useState(new Set());
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const moviesRef = useRef(movies);
  const containerRef = useRef(null);

  const calculateUncertainty = useCallback((movieId) => {
    const results = rankings[movieId]?.recentResults;
    if (!results || results.length < 2) return 1;
    
    const flips = results.reduce((count, curr, i) => {
      return count + (i > 0 && curr.result !== results[i-1].result ? 1 : 0);
    }, 0);
    
    return flips / (results.length - 1);
  }, [rankings]);
  
  const calculatePairValue = useCallback((movieA, movieB, rankings, moviesUsed) => {
    // Core information gain calculation
    const ratingDiff = Math.abs(
      rankings[movieA.identifier]?.rating - rankings[movieB.identifier]?.rating
    );
    
    const combinedComparisons = (rankings[movieA.identifier]?.comparisons || 0) + 
                               (rankings[movieB.identifier]?.comparisons || 0);
                               
    const uncertaintyScore = (calculateUncertainty(movieA.identifier) + 
                             calculateUncertainty(movieB.identifier)) / 2;
    
    // Base information gain
    const infoGain = (1 / (ratingDiff + 0.1)) * 
                     (1 / (combinedComparisons + 1)) * 
                     (1 + uncertaintyScore);
    
    // Add usage penalty for recently used movies
    const usageA = moviesUsed.has(movieA.identifier) ? 0.7 : 1;
    const usageB = moviesUsed.has(movieB.identifier) ? 0.7 : 1;
    
    return infoGain * usageA * usageB;
  }, [calculateUncertainty]);

  // Function to handle undo
  const handleUndo = useCallback(() => {
    if (comparisonHistory.length > 0) {
      // Create a copy of the history without the last item
      const newHistory = [...comparisonHistory];
      const lastComparison = newHistory.pop();
      
      // Clear any pending updates
      setPendingUpdates([]);

      // Reset high impact indicator
      const previousComparison = newHistory[newHistory.length - 1];
    
      // Explicitly set the high impact state from the history
      if (previousComparison) {
        setIsCurrentComparisonHighImpact(previousComparison.isHighImpact);
      } else {
        // If no previous comparison exists, reset to false
        setIsCurrentComparisonHighImpact(false);
      }
      
      // Reset the rankings to the previous state
      if (lastComparison) {
        updateRankings(lastComparison.rankings);
        return lastComparison.pair; // Return the previous pair
      }
    }
    return null;
  }, [comparisonHistory, updateRankings, setPendingUpdates, setIsCurrentComparisonHighImpact]);
  
  // Function to calculate comparison impact (simplified for now)
  const calculateComparisonImpact = useCallback((movieA, movieB, rankings, progress) => {
    if (progress < 0.2) return false;
    
    // Essential safety checks
    if (!movieA || !movieB || !movieA.identifier || !movieB.identifier) return false;
    if (!rankings[movieA.identifier] || !rankings[movieB.identifier]) return false;

    const recordA = rankings[movieA.identifier];
    const recordB = rankings[movieB.identifier];
    
    // Calculate rating uncertainty
    const ratingDiff = Math.abs(recordA.rating - recordB.rating);
    const avgComparisons = (recordA.comparisons + recordB.comparisons) / 2;
    const uncertaintyScore = 1 / (avgComparisons + 1);
    
    // More impactful if:
    // 1. Movies are close in rating
    // 2. We don't have many comparisons yet
    // 3. We're in the middle phase of ranking (20%-80%)
    const ratingProximity = 1 / (1 + Math.exp(5 * (ratingDiff - 0.5)));
    const phaseImportance = 1 - Math.abs(progress - 0.5) * 2;
    
    const impactScore = (
      ratingProximity * 0.5 +
      uncertaintyScore * 0.3 +
      phaseImportance * 0.2
    );

    // Return true if this is a high-impact comparison
    return impactScore > 0.7;
  }, []);

  const updateRankingsData = useCallback((winnerIdentifier, loserIdentifier, currentPair) => {
    // Save current state to history
    const currentProgress = comparisons / maxComparisons;
    const currentHighImpact = calculateComparisonImpact(
      rankings[winnerIdentifier]?.movie,
      rankings[loserIdentifier]?.movie,
      rankings,
      currentProgress
    );

    // Add to history
    addComparisonToHistory({
      winner: winnerIdentifier,
      loser: loserIdentifier,
      rankings: { ...rankings },
      pair: currentPair,
      isHighImpact: currentHighImpact
    });

    // Calculate impact before updating rankings
    const isHighImpact = calculateComparisonImpact(
      rankings[winnerIdentifier]?.movie,
      rankings[loserIdentifier]?.movie,
      rankings,
      currentProgress
    );
    
    setIsCurrentComparisonHighImpact(isHighImpact);

    // Add to pending updates
    setPendingUpdates(prev => {
      return [...prev, { winner: winnerIdentifier, loser: loserIdentifier }];
    });

    // Increment comparisons count
    incrementComparisons();
  }, [
    rankings, 
    comparisons, 
    maxComparisons, 
    calculateComparisonImpact, 
    addComparisonToHistory, 
    setIsCurrentComparisonHighImpact, 
    setPendingUpdates, 
    incrementComparisons
  ]);

  const selectPair = useCallback(() => {
    try {
      if (comparisons >= maxComparisons) {
        onFinish();
        return;
      }
  
      // Get available movies, refreshing the pool if needed
      let availableMovies = movies.filter(movie => 
        !moviesUsed.has(movie.identifier)
      );
  
      if (availableMovies.length < 2) {
        console.log("Resetting movies used pool");
        availableMovies = [...movies];
        setMoviesUsed(new Set());
      }
  
      // Early stage detection
      const ratingsArray = availableMovies.map(movie => rankings[movie.identifier]?.rating || 0);
      const ratingRange = Math.max(...ratingsArray) - Math.min(...ratingsArray);
      const isEarlyStage = ratingRange < 1.0 || comparisons < movies.length;
  
      let selectedPair;
  
      if (isEarlyStage) {
        // In early stage, prioritize establishing baseline rankings
        const sortedByComparisons = [...availableMovies].sort((a, b) => 
          (rankings[a.identifier]?.comparisons || 0) - (rankings[b.identifier]?.comparisons || 0)
        );
  
        // Select first movie with fewest comparisons
        const firstMovie = sortedByComparisons[0];
        
        // Find best matching second movie
        const otherMovies = sortedByComparisons.slice(1, 10); // Limit to 10 candidates for efficiency
        const secondMovie = otherMovies.reduce((best, current) => {
          const currentValue = calculatePairValue(firstMovie, current, rankings, moviesUsed);
          const bestValue = best ? calculatePairValue(firstMovie, best, rankings, moviesUsed) : -1;
          return currentValue > bestValue ? current : best;
        });
  
        selectedPair = [firstMovie, secondMovie];
      } else {
        // In refinement stage, use sophisticated pair selection
        const potentialPairs = [];
        
        // Consider top 10 movies for efficiency
        const candidateMovies = availableMovies.slice(0, 10);
        
        // Generate all possible pairs among candidates
        for (let i = 0; i < candidateMovies.length - 1; i++) {
          for (let j = i + 1; j < candidateMovies.length; j++) {
            const movieA = candidateMovies[i];
            const movieB = candidateMovies[j];
            
            const pairValue = calculatePairValue(movieA, movieB, rankings, moviesUsed);
            
            potentialPairs.push({
              pair: [movieA, movieB],
              value: pairValue
            });
          }
        }
  
        // Select highest value pair
        potentialPairs.sort((a, b) => b.value - a.value);
        selectedPair = potentialPairs[0]?.pair;
      }
  
      if (selectedPair && selectedPair.length === 2) {
        setPair(selectedPair);
        setMoviesUsed(prev => new Set([...prev, selectedPair[0].identifier, selectedPair[1].identifier]));
      } else {
        throw new Error("Failed to select a valid movie pair");
      }
  
    } catch (err) {
      console.error("Error in selectPair:", err);
      setError(`Error selecting movies: ${err.message}`);
    }
  }, [
    comparisons, 
    maxComparisons, 
    movies, 
    moviesUsed, 
    rankings, 
    calculatePairValue,
    onFinish
  ]);

  const handleChoice = useCallback((winner, loser) => {
    updateRankingsData(winner.identifier, loser.identifier, pair);
    setPair([]); // This will trigger useEffect to select new pair
  }, [updateRankingsData, pair]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (!pair.length || isAnimating) return;
      
      let index = null;
      if (e.key === 'ArrowLeft' || e.key === '1') {
        index = 0;
      } else if (e.key === 'ArrowRight' || e.key === '2') {
        index = 1;
      } else if (e.key.toLowerCase() === 'u' && comparisons > 0) {
        const previousPair = handleUndo();
        if (previousPair) {
          setPair(previousPair);
        }
        return;
      }
    
      if (index !== null) {
        setIsAnimating(true);
        setSelectedIndex(index);
        
        setTimeout(() => {
          handleChoice(pair[index], pair[1 - index]);
          setSelectedIndex(null);
          setIsAnimating(false);
        }, 150);
      }
    };
  
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [pair, comparisons, handleUndo, handleChoice, isAnimating]);

  useEffect(() => {
    // Only select a new pair if we don't have one already
    if (pair.length === 0 && comparisons < maxComparisons) {
      selectPair();
    }
  }, [pair.length, comparisons, maxComparisons, selectPair]);

  const handleSelect = (index) => {
    if (isAnimating || !pair[index]) return;
    
    setIsAnimating(true);
    setSelectedIndex(index);
    
    setTimeout(() => {
      handleChoice(pair[index], pair[1 - index]);
      setSelectedIndex(null);
      setIsAnimating(false);
    }, 150);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="card bg-base-200 p-6 shadow-lg">
          <h3 className="text-lg font-semibold text-error mb-2">Error</h3>
          <p className="text-base-content/70">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4">
      <div className="text-center mb-8 flex justify-center">
        <h2 className="text-2xl font-bold relative inline-flex items-center gap-2">
          {isCurrentComparisonHighImpact && (
            <div className="relative w-2 h-2 absolute -left-6">
              <div className="w-2 h-2 rounded-full bg-amber-500/20" />
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <div className="absolute inset-0 w-8 h-8 -m-3 bg-amber-500/20 blur-lg rounded-full" />
            </div>
          )}
          Which movie do you prefer?
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-[5%] [&:hover_button]:opacity-30">
        {pair.length === 2 ? pair.map((movie, index) => (
          <div className="relative" key={movie.identifier}>
            <button
              onClick={() => handleSelect(index)}
              className={[
                'group relative overflow-hidden rounded-lg w-full',
                'transition-all ease-in-out duration-300',
                selectedIndex === index ? 'scale-[0.98]' : 'hover:scale-[1.02]',
                'animate-[fadeIn_0.5s_ease-in-out_forwards]'
              ].join(' ')}
              disabled={isAnimating}
            >
              <div className={`relative aspect-[2/3] w-[90%] ${
                index === 0 ? 'ml-auto' : 'mr-auto'
              }`}>
                {/* Poster Container with fixed aspect ratio */}
                <div className="absolute inset-0">
                  {/* Consider replacing with Next.js Image component later */}
                  <img
                    src={movie.poster || '/api/placeholder/400/600'}
                    alt={movie.title}
                    className="w-full h-full object-cover rounded-lg"
                    style={{
                      objectPosition: 'center center'
                    }}
                  />
                </div>
                
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent rounded-lg opacity-90" />
                
                {/* Text Container */}
                <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
                  <h3 className="text-xl font-bold mb-2 text-white truncate" title={movie.title}>
                    {movie.title}
                  </h3>
                  <p className="text-white/90">{movie.year}</p>
                </div>
              </div>
            </button>
          </div>
        )) : (
          <div className="col-span-2 flex justify-center items-center h-[60vh]">
            <div className="loading loading-spinner loading-lg text-primary"></div>
          </div>
        )}
      </div>
      
      {/* Undo button section */}
      <div className="text-center mt-8">
        <button 
          onClick={() => {
            const previousPair = handleUndo();
            if (previousPair) {
              setPair(previousPair);
            }
          }}
          className={`btn btn-sm gap-2 ${comparisons === 0 ? 'btn-disabled' : 'btn-error btn-outline'}`}
          disabled={comparisons === 0}
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            className="w-4 h-4"
          >
            <path d="M9 14L4 9L9 4" />
            <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
          </svg>
          Undo Last Choice
        </button>
      </div>
    </div>
  );
}