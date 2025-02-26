import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

function RankingProcess({ 
  movies, 
  rankings, 
  comparisons,
  maxComparisons,
  onChoose, 
  onFinish, 
  onUndo,
  isHighImpact
}) {
  const [pair, setPair] = useState([]);
  const [moviesUsed, setMoviesUsed] = useState(new Set());
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const moviesRef = useRef(movies);
  const containerRef = useRef(null);

  const calculateUncertainty = useCallback((movieId) => {
    const results = rankings[movieId].recentResults;
    if (results.length < 2) return 1;
    const flips = results.reduce((count, curr, i) => {
      return count + (i > 0 && curr !== results[i-1] ? 1 : 0);
    }, 0);
    return flips / (results.length - 1);
  }, [rankings]);
  
  const calculatePairValue = useCallback((movieA, movieB, rankings, moviesUsed) => {
    // Core information gain calculation
    const ratingDiff = Math.abs(
      rankings[movieA.identifier].rating - rankings[movieB.identifier].rating
    );
    const combinedComparisons = rankings[movieA.identifier].comparisons + 
                               rankings[movieB.identifier].comparisons;
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

  const memoizedMovies = useMemo(() => moviesRef.current, []);
  
  const selectPair = useCallback(() => {
    try {
      if (comparisons >= maxComparisons) {
        console.log("Finishing ranking process");
        onFinish();
        return;
      }
  
      // Get available movies, refreshing the pool if needed
      let availableMovies = memoizedMovies.filter(movie => 
        !moviesUsed.has(movie.identifier)
      );
  
      if (availableMovies.length < 2) {
        console.log("Resetting movies used pool");
        availableMovies = [...moviesRef.current];
        setMoviesUsed(new Set());
      }
  
      // Early stage detection
      const ratingsArray = availableMovies.map(movie => rankings[movie.identifier].rating);
      const ratingRange = Math.max(...ratingsArray) - Math.min(...ratingsArray);
      const isEarlyStage = ratingRange < 1.0 || comparisons < movies.length;
  
      let selectedPair;
  
      if (isEarlyStage) {
        console.log("Early stage selection");
        // In early stage, prioritize establishing baseline rankings
        const sortedByComparisons = [...availableMovies].sort((a, b) => 
          rankings[a.identifier].comparisons - rankings[b.identifier].comparisons
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
        console.log("Refinement stage selection");
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
        selectedPair = potentialPairs[0].pair;
      }
  
      console.log(`Selected pair: ${selectedPair[0].title} vs ${selectedPair[1].title}`);
      setPair(selectedPair);
      setMoviesUsed(prev => new Set([...prev, selectedPair[0].identifier, selectedPair[1].identifier]));
  
    } catch (err) {
      console.error("Error in selectPair:", err);
      setError(`Error selecting movies: ${err.message}`);
    }
  }, [
    comparisons, 
    maxComparisons, 
    moviesUsed, 
    rankings, 
    movies.length, 
    onFinish,
    calculatePairValue,
    memoizedMovies
  ]);

  const handleChoice = useCallback((winner, loser) => {
    console.log(`Choice made: ${winner.title} over ${loser.title}`);
    onChoose(winner.identifier, loser.identifier, pair);
    setPair([]); // This will trigger useEffect to select new pair
  }, [onChoose, pair]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (!pair.length || isAnimating) return;
      
      let index = null;
      if (e.key === 'ArrowLeft' || e.key === '1') {
        index = 0;
      } else if (e.key === 'ArrowRight' || e.key === '2') {
        index = 1;
      } else if (e.key.toLowerCase() === 'u' && comparisons > 0) {
        const previousPair = onUndo();
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
  }, [pair, comparisons, onUndo, handleChoice, onChoose, isAnimating]);

  useEffect(() => {
    // Only select a new pair if we don't have one already
    if (pair.length === 0 && comparisons < maxComparisons) {
      selectPair();
    }
  }, [pair.length, comparisons, maxComparisons, selectPair]);

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

  if (comparisons >= maxComparisons) {
    onFinish();
    return null;
  }

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

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl relative" ref={containerRef}>
  
        {/* Main content */}
        <div className="max-w-6xl mx-auto relative">

          {/* Center content with movies */}
          <div className="max-w-2xl mx-auto px-4">
          <div className="text-center mb-8 flex justify-center">
            <h2 className="text-2xl font-bold relative inline-flex items-center gap-2">
            {isHighImpact && (
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
                  const previousPair = onUndo();
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

        </div>
  </div>
);
}

export default RankingProcess;
