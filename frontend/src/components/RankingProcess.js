import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import GroupSelection from './GroupSelection';

function RankingProcess({ 
  movies, 
  rankings, 
  comparisons,
  maxComparisons,
  onChoose, 
  onFinish, 
  onUndo,
  isHighImpact,
  calculateConfidence
}) {
  const [currentGroup, setCurrentGroup] = useState([]);
  const [currentMode, setCurrentMode] = useState('group'); // 'group' or 'pair'
  const [groupSize, setGroupSize] = useState(5); // Start with 5-item groups
  const [moviesUsed, setMoviesUsed] = useState(new Set());
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const moviesRef = useRef(movies);
  const containerRef = useRef(null);

  // Function to determine the current phase based on progress
  const determinePhase = useCallback(() => {
    const progress = comparisons / maxComparisons;
    
    // Use phase transitions based on progress
    if (progress < 0.35) {
      return { mode: 'group', size: 5 }; // Early phase: 5-movie groups
    } else if (progress < 0.75) {
      return { mode: 'group', size: 3 }; // Middle phase: 3-movie groups
    } else {
      return { mode: 'pair', size: 2 }; // Late phase: traditional pairs
    }
  }, [comparisons, maxComparisons]);

  // Update the mode and group size when the phase changes
  useEffect(() => {
    const { mode, size } = determinePhase();
    setCurrentMode(mode);
    setGroupSize(size);
  }, [determinePhase]);

  const calculateUncertainty = useCallback((movieId) => {
    const results = rankings[movieId].recentResults;
    if (results.length < 2) return 1;
    const flips = results.reduce((count, curr, i) => {
      return count + (i > 0 && curr.result !== results[i-1].result ? 1 : 0);
    }, 0);
    return flips / (results.length - 1);
  }, [rankings]);
  
  const calculateMovieValue = useCallback((movie, rankings, moviesUsed) => {
    // Prioritize movies with high uncertainty and few comparisons
    const uncertainty = calculateUncertainty(movie.identifier);
    const confidenceScore = calculateConfidence(movie.identifier);
    const comparisonsCount = rankings[movie.identifier].comparisons;
    
    // Calculate value based on confidence, uncertainty, and comparisons
    const infoGain = (1 - confidenceScore) * 
                     (1 + uncertainty) * 
                     (1 / (comparisonsCount + 1));
    
    // Add usage penalty for recently used movies
    const usagePenalty = moviesUsed.has(movie.identifier) ? 0.7 : 1;
    
    return infoGain * usagePenalty;
  }, [calculateUncertainty, calculateConfidence]);

  const calculateGroupValue = useCallback((movies, rankings) => {
    let totalValue = 0;
    
    // Calculate individual movie values
    const movieValues = movies.map(movie => ({
      movie,
      value: calculateMovieValue(movie, rankings, moviesUsed)
    }));
    
    // Calculate value from pairwise relationships
    for (let i = 0; i < movies.length - 1; i++) {
      for (let j = i + 1; j < movies.length; j++) {
        const movieA = movies[i];
        const movieB = movies[j];
        
        // Value based on rating difference
        const ratingDiff = Math.abs(
          rankings[movieA.identifier].rating - rankings[movieB.identifier].rating
        );
        
        // More value from movies that are close in rating
        const pairValue = 1 / (ratingDiff + 0.1);
        
        totalValue += pairValue;
      }
    }
    
    // Combine individual values and pairwise relationships
    return totalValue + movieValues.reduce((sum, item) => sum + item.value, 0);
  }, [calculateMovieValue, moviesUsed]);

  const memoizedMovies = useMemo(() => moviesRef.current, []);
  
  const selectGroup = useCallback(() => {
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
  
      if (availableMovies.length < groupSize) {
        console.log("Resetting movies used pool");
        availableMovies = [...moviesRef.current];
        setMoviesUsed(new Set());
      }
  
      let selectedGroup;
      const currentPhase = determinePhase();
  
      if (currentPhase.mode === 'pair') {
        // Traditional pair selection
        console.log("Pair selection mode");
        // Get two movies that maximize information gain
        const sortedByComparisons = [...availableMovies].sort((a, b) => 
          rankings[a.identifier].comparisons - rankings[b.identifier].comparisons
        );
  
        // Select first movie with fewest comparisons
        const firstMovie = sortedByComparisons[0];
        
        // Find best matching second movie
        const otherMovies = sortedByComparisons.slice(1, 10); // Limit to 10 candidates for efficiency
        const secondMovie = otherMovies.reduce((best, current) => {
          const currentValue = calculateMovieValue(current, rankings, moviesUsed);
          const bestValue = best ? calculateMovieValue(best, rankings, moviesUsed) : -1;
          return currentValue > bestValue ? current : best;
        });
  
        selectedGroup = [firstMovie, secondMovie];
      } else {
        console.log(`Group selection mode (size: ${currentPhase.size})`);
        
        // Group formation strategies
        const strategies = [
          // Strategy 1: Mix of high uncertainty movies across rating spectrum
          () => {
            const sortedByUncertainty = [...availableMovies].sort((a, b) => 
              calculateUncertainty(b.identifier) - calculateUncertainty(a.identifier)
            );
            
            // Take top uncertain movies, but ensure rating diversity
            const selectedMovies = [sortedByUncertainty[0]];
            const ratingBuckets = {
              low: [],
              mid: [],
              high: []
            };
            
            // Divide remaining movies into rating buckets
            for (let i = 1; i < sortedByUncertainty.length; i++) {
              const movie = sortedByUncertainty[i];
              const rating = rankings[movie.identifier].rating;
              
              if (rating < -0.5) ratingBuckets.low.push(movie);
              else if (rating > 0.5) ratingBuckets.high.push(movie);
              else ratingBuckets.mid.push(movie);
            }
            
            // Add from each bucket to ensure diversity
            if (ratingBuckets.low.length > 0) selectedMovies.push(ratingBuckets.low[0]);
            if (ratingBuckets.mid.length > 0) selectedMovies.push(ratingBuckets.mid[0]);
            if (ratingBuckets.high.length > 0) selectedMovies.push(ratingBuckets.high[0]);
            
            // Fill remaining slots with high uncertainty movies
            while (selectedMovies.length < currentPhase.size && sortedByUncertainty.length > selectedMovies.length) {
              const nextMovie = sortedByUncertainty[selectedMovies.length];
              if (!selectedMovies.find(m => m.identifier === nextMovie.identifier)) {
                selectedMovies.push(nextMovie);
              }
            }
            
            return selectedMovies;
          },
          
          // Strategy 2: Prioritize movies with few comparisons
          () => {
            return [...availableMovies]
              .sort((a, b) => rankings[a.identifier].comparisons - rankings[b.identifier].comparisons)
              .slice(0, currentPhase.size);
          },
          
          // Strategy 3: Create groups with similar ratings to refine precision
          () => {
            // Get a random movie as an anchor
            const randomIndex = Math.floor(Math.random() * availableMovies.length);
            const anchorMovie = availableMovies[randomIndex];
            const anchorRating = rankings[anchorMovie.identifier].rating;
            
            // Find movies with similar ratings
            return [anchorMovie, ...availableMovies
              .filter(m => m.identifier !== anchorMovie.identifier)
              .sort((a, b) => 
                Math.abs(rankings[a.identifier].rating - anchorRating) - 
                Math.abs(rankings[b.identifier].rating - anchorRating)
              )
              .slice(0, currentPhase.size - 1)];
          }
        ];
        
        // Create candidate groups using different strategies
        const candidateGroups = strategies.map(strategy => strategy());
        
        // Select the group with highest value
        selectedGroup = candidateGroups.reduce((best, current) => {
          const currentValue = calculateGroupValue(current, rankings);
          const bestValue = best ? calculateGroupValue(best, rankings) : -1;
          return currentValue > bestValue ? current : best;
        });
        
        // Ensure we have enough movies in the group
        while (selectedGroup.length < currentPhase.size && availableMovies.length > selectedGroup.length) {
          const remainingMovies = availableMovies.filter(
            movie => !selectedGroup.find(m => m.identifier === movie.identifier)
          );
          
          if (remainingMovies.length === 0) break;
          
          const nextMovie = remainingMovies[0];
          selectedGroup.push(nextMovie);
        }
      }
  
      // Log selected group
      console.log(`Selected group of ${selectedGroup.length} movies: ${selectedGroup.map(m => m.title).join(', ')}`);
      
      // Mark movies as used
      setCurrentGroup(selectedGroup);
      setMoviesUsed(prev => {
        const newUsed = new Set([...prev]);
        selectedGroup.forEach(movie => newUsed.add(movie.identifier));
        return newUsed;
      });
  
    } catch (err) {
      console.error("Error in selectGroup:", err);
      setError(`Error selecting movies: ${err.message}`);
    }
  }, [
    groupSize,
    comparisons, 
    maxComparisons, 
    moviesUsed, 
    rankings, 
    onFinish,
    calculateMovieValue,
    calculateGroupValue,
    determinePhase,
    memoizedMovies
  ]);

  const handlePairChoice = useCallback((winner, loser) => {
    console.log(`Pair choice made: ${winner.title} over ${loser.title}`);
    onChoose(winner.identifier, loser.identifier, [winner, loser]);
    setCurrentGroup([]); // This will trigger useEffect to select new group
  }, [onChoose]);

  const handleGroupChoice = useCallback((selectedIndex, groupMovies) => {
    console.log(`Group choice made: ${groupMovies[selectedIndex].title} selected from group of ${groupMovies.length}`);
    
    // The selected movie wins against all others in the group
    const winner = groupMovies[selectedIndex];
    const losers = groupMovies.filter((_, i) => i !== selectedIndex);
    
    // Process all implicit comparisons
    losers.forEach(loser => {
      onChoose(winner.identifier, loser.identifier, groupMovies);
    });
    
    setCurrentGroup([]); // This will trigger useEffect to select new group
  }, [onChoose]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (currentGroup.length < 2 || isAnimating) return;
      
      // Handle undo functionality
      if (e.key.toLowerCase() === 'u' && comparisons > 0) {
        const previousGroup = onUndo();
        if (previousGroup) {
          setCurrentGroup(previousGroup);
        }
        return;
      }
    };
  
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentGroup, comparisons, onUndo, isAnimating]);

  useEffect(() => {
    // Only select a new group if we don't have one already
    if (currentGroup.length === 0 && comparisons < maxComparisons) {
      selectGroup();
    }
  }, [currentGroup.length, comparisons, maxComparisons, selectGroup]);

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

  const handlePairSelect = (index) => {
    if (isAnimating || !currentGroup[index]) return;
    
    setIsAnimating(true);
    setSelectedIndex(index);
    
    setTimeout(() => {
      handlePairChoice(currentGroup[index], currentGroup[1 - index]);
      setSelectedIndex(null);
      setIsAnimating(false);
    }, 150);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl relative" ref={containerRef}>
      {/* Main content */}
      <div className="max-w-6xl mx-auto relative">
        {currentMode === 'pair' && currentGroup.length === 2 ? (
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
              {currentGroup.map((movie, index) => (
                <div className="relative" key={movie.identifier}>
                  <button
                    onClick={() => handlePairSelect(index)}
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
              ))}
            </div>
          </div>
        ) : currentMode === 'group' && currentGroup.length >= 3 ? (
          <GroupSelection 
            movies={currentGroup} 
            groupSize={groupSize}
            onSelect={handleGroupChoice}
            isHighImpact={isHighImpact}
          />
        ) : (
          <div className="flex justify-center items-center h-[60vh]">
            <div className="loading loading-spinner loading-lg text-primary"></div>
          </div>
        )}
        
        {/* Undo button section */}
        <div className="text-center mt-8">
          <button 
            onClick={() => {
              const previousGroup = onUndo();
              if (previousGroup) {
                setCurrentGroup(previousGroup);
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
  );
}

export default RankingProcess;
