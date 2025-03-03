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
  const timeoutRef = useRef(null);
  
  // Update moviesRef when movies change, with proper cleanup
  useEffect(() => {
    moviesRef.current = movies;
    return () => {
      // Clear the ref on unmount to prevent memory leaks
      moviesRef.current = null;
    };
  }, [movies]);

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

  // Cache for group value calculations
const groupValueCache = useRef(new Map());

const calculateGroupValue = useCallback((movies, rankings) => {
    // Create a cache key from movie identifiers (sorted to ensure consistency)
    const movieIds = movies.map(movie => movie.identifier).sort().join('_');
    
    // Check if this exact group has been calculated before
    if (groupValueCache.current.has(movieIds)) {
      return groupValueCache.current.get(movieIds);
    }
    
    let totalValue = 0;
    let individualSum = 0;
    
    // Calculate individual movie values without creating objects
    for (let i = 0; i < movies.length; i++) {
      individualSum += calculateMovieValue(movies[i], rankings, moviesUsed);
    }
    
    // Cache for pairwise values to avoid recalculation
    const pairCache = new Map();
    
    // Calculate value from pairwise relationships
    for (let i = 0; i < movies.length - 1; i++) {
      for (let j = i + 1; j < movies.length; j++) {
        const movieA = movies[i];
        const movieB = movies[j];
        
        // Create a unique pair key (always put smaller ID first to ensure consistency)
        const pairKey = [movieA.identifier, movieB.identifier].sort().join('_');
        
        // Check if this pair value was already calculated
        let pairValue;
        if (pairCache.has(pairKey)) {
          pairValue = pairCache.get(pairKey);
        } else {
          // Value based on rating difference
          const ratingDiff = Math.abs(
            rankings[movieA.identifier].rating - rankings[movieB.identifier].rating
          );
          
          // More value from movies that are close in rating
          pairValue = 1 / (ratingDiff + 0.1);
          
          // Store in pair cache for future use
          pairCache.set(pairKey, pairValue);
        }
        
        totalValue += pairValue;
      }
    }
    
    // Combine individual values and pairwise relationships
    const result = totalValue + individualSum;
    
    // Store in group cache
    groupValueCache.current.set(movieIds, result);
    
    return result;
  }, [calculateMovieValue, moviesUsed]);

  // References are already memoized by useRef, no need for additional useMemo
  // Just use moviesRef.current directly
  
  // Memoize available movies separately with proper dependencies
  const availableMoviesCache = useMemo(() => {
    return moviesRef.current.filter(movie => !moviesUsed.has(movie.identifier));
  }, [moviesRef.current, moviesUsed, moviesUsed.size]);
  
  // Fisher-Yates shuffle algorithm
  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Add a ref to track previously compared pairs
  const comparedPairsRef = useRef(new Map());

  const selectGroup = useCallback(() => {
    try {
      if (comparisons >= maxComparisons) {
        console.log("Finishing ranking process");
        onFinish();
        return;
      }
  
      // Get available movies, refreshing the pool if needed
      // Create a local copy to prevent reference issues
      let availableMovies = [...availableMoviesCache];
  
      if (availableMovies.length < groupSize) {
        console.log("Resetting movies used pool");
        // Create a fresh copy to break any lingering references
        availableMovies = moviesRef.current ? [...moviesRef.current] : [];
        setMoviesUsed(new Set());
      }
      
      // Add randomness to initial grouping if this is the first comparison
      if (comparisons === 0) {
        availableMovies = shuffleArray(availableMovies);
        // Initialize the compared pairs tracking map
        if (!comparedPairsRef.current) {
          comparedPairsRef.current = new Map();
        }
      }
  
      let selectedGroup;
      const currentPhase = determinePhase();
  
      if (currentPhase.mode === 'pair') {
        // Traditional pair selection with enhanced duplicate prevention
        console.log("Pair selection mode");

        // Get movies that maximize information gain
        const sortedByComparisons = [...availableMovies].sort((a, b) => 
          rankings[a.identifier].comparisons - rankings[b.identifier].comparisons
        );
  
        // Select first movie with fewest comparisons
        const firstMovie = sortedByComparisons[0];
        
        if (!firstMovie || !firstMovie.identifier) {
          console.error("No valid first movie found");
          return;
        }

        // Create a scoring function to find the best second movie
        const scorePairCandidate = (movie) => {
          if (!movie || !movie.identifier) return -Infinity;
          
          // Base score from movie value
          let score = calculateMovieValue(movie, rankings, moviesUsed);
          
          // Create a unique pair ID (always put smaller ID first to ensure consistency)
          const pairId = [firstMovie.identifier, movie.identifier].sort().join('_');
          
          // Check if this pair has been compared before and how recently
          if (comparedPairsRef.current.has(pairId)) {
            const lastComparisonIndex = comparedPairsRef.current.get(pairId);
            const recencyPenalty = 1 - Math.min(1, (comparisons - lastComparisonIndex) / 50);
            
            // Heavy penalty for recently compared pairs
            score *= (0.1 + recencyPenalty * 0.9);
          }

          // Check if they were directly compared in recent history
          const wasRecentlyCompared = 
            rankings[firstMovie.identifier].recentResults?.some(r => r.opponent === movie.identifier) ||
            rankings[movie.identifier].recentResults?.some(r => r.opponent === firstMovie.identifier);
          
          if (wasRecentlyCompared) {
            score *= 0.2; // Severe penalty for pairs in recent comparison history
          }
          
          return score;
        };

        // Score all candidate movies
        const otherMovies = sortedByComparisons.slice(1);
        let bestScore = -Infinity;
        let secondMovie = null;
        
        // Find movie with best score
        for (let i = 0; i < otherMovies.length; i++) {
          const currentScore = scorePairCandidate(otherMovies[i]);
          if (currentScore > bestScore) {
            bestScore = currentScore;
            secondMovie = otherMovies[i];
          }
        }

        // Special handling for small movie sets or late in the ranking process
        if (!secondMovie && otherMovies.length > 0) {
          console.log("Falling back to best available movie pair despite previous comparisons");
          secondMovie = otherMovies[0];
        }

        // Check if this is a duplicate pair that we've seen very recently
        if (firstMovie && secondMovie) {
          const pairId = [firstMovie.identifier, secondMovie.identifier].sort().join('_');
          const lastComparisonIndex = comparedPairsRef.current.get(pairId);
          
          // If comparison happened extremely recently (last 10 comparisons) and we have enough movies
          const isVeryRecentComparison = lastComparisonIndex && (comparisons - lastComparisonIndex) < 10;
          const haveEnoughMovies = availableMovies.length > 10;
          
          if (isVeryRecentComparison && haveEnoughMovies) {
            // Try again with a different first movie
            if (sortedByComparisons.length > 2) {
              console.log("Avoiding very recent pair, trying with different first movie");
              const alternateFirstMovie = sortedByComparisons[1];
              
              // Find best second movie for this alternate first
              let alternateBestScore = -Infinity;
              let alternateSecondMovie = null;
              
              for (let i = 0; i < sortedByComparisons.length; i++) {
                if (i !== 1) { // Skip the alternate first movie itself
                  const candidateMovie = sortedByComparisons[i];
                  const alternatePairId = [alternateFirstMovie.identifier, candidateMovie.identifier].sort().join('_');
                  
                  // Skip if this is also a very recent comparison
                  const lastAlternateComparisonIndex = comparedPairsRef.current.get(alternatePairId);
                  if (lastAlternateComparisonIndex && (comparisons - lastAlternateComparisonIndex) < 10) {
                    continue;
                  }
                  
                  const candidateScore = calculateMovieValue(candidateMovie, rankings, moviesUsed);
                  if (candidateScore > alternateBestScore) {
                    alternateBestScore = candidateScore;
                    alternateSecondMovie = candidateMovie;
                  }
                }
              }
              
              // Use alternate pair if found
              if (alternateSecondMovie) {
                selectedGroup = [alternateFirstMovie, alternateSecondMovie];
              } else {
                selectedGroup = [firstMovie, secondMovie]; // Fall back to original
              }
            } else {
              selectedGroup = [firstMovie, secondMovie]; // Not enough movies, use original
            }
          } else {
            selectedGroup = [firstMovie, secondMovie];
          }
        } else {
          console.error("Could not create a valid movie pair");
          // Emergency fallback - just take the first two available movies
          selectedGroup = availableMovies.slice(0, 2);
        }
      } else {
        console.log(`Group selection mode (size: ${currentPhase.size})`);
        
        // Group formation strategies - defined outside as constants to avoid recreating functions
        const strategyFunctions = [];
        
        // Strategy 1: Mix of high uncertainty movies across rating spectrum
        strategyFunctions.push(() => {
          // Get movies sorted by uncertainty but filter out recently compared pairs
          let sortedByUncertainty = [...availableMovies].sort((a, b) => 
            calculateUncertainty(b.identifier) - calculateUncertainty(a.identifier)
          );
          
          // Add randomness to initial grouping
          if (comparisons === 0) {
            const topCount = Math.max(1, Math.ceil(sortedByUncertainty.length * 0.2));
            const topMovies = sortedByUncertainty.slice(0, topCount);
            const shuffledTopMovies = shuffleArray(topMovies);
            sortedByUncertainty = [...shuffledTopMovies, ...sortedByUncertainty.slice(topCount)];
          }
          
          // Safely access the top movie
          if (sortedByUncertainty.length === 0) return [];
          const topMovie = sortedByUncertainty[0];
          
          // Get set of recently compared movies for the top uncertain movie
          const recentlyCompared = new Set();
          if (topMovie && rankings[topMovie.identifier] && rankings[topMovie.identifier].recentResults) {
            // Use for...of instead of forEach to avoid closure creation
            for (const result of rankings[topMovie.identifier].recentResults) {
              if (result.opponent) recentlyCompared.add(result.opponent);
            }
          }
          
          // Filter the remaining movies to exclude recently compared pairs
          const remainingMovies = [];
          for (const movie of availableMovies) {
            if (movie.identifier !== topMovie.identifier && !recentlyCompared.has(movie.identifier)) {
              remainingMovies.push(movie);
            }
          }
          
          // Sort remaining movies by uncertainty
          remainingMovies.sort((a, b) => 
            calculateUncertainty(b.identifier) - calculateUncertainty(a.identifier)
          );
          
          // Combine into final list
          const finalSortedList = [topMovie, ...remainingMovies];
          
          // Take top uncertain movies, but ensure rating diversity
          const selectedMovies = [finalSortedList[0]];
          const ratingBuckets = {
            low: [],
            mid: [],
            high: []
          };
          
          // Divide remaining movies into rating buckets - avoid creating functions in loop
          for (let i = 1; i < finalSortedList.length; i++) {
            const movie = finalSortedList[i];
            if (!movie || !movie.identifier || !rankings[movie.identifier]) continue;
            
            const rating = rankings[movie.identifier].rating;
            
            if (rating < -0.5) ratingBuckets.low.push(movie);
            else if (rating > 0.5) ratingBuckets.high.push(movie);
            else ratingBuckets.mid.push(movie);
          }
          
          // Add from each bucket to ensure diversity
          if (ratingBuckets.low.length > 0) selectedMovies.push(ratingBuckets.low[0]);
          if (ratingBuckets.mid.length > 0) selectedMovies.push(ratingBuckets.mid[0]);
          if (ratingBuckets.high.length > 0) selectedMovies.push(ratingBuckets.high[0]);
          
          // Fill remaining slots with high uncertainty movies - using for loop instead of while
          for (let i = selectedMovies.length; i < currentPhase.size && i < finalSortedList.length; i++) {
            const nextMovie = finalSortedList[i];
            let isDuplicate = false;
            
            // Check for duplicates without using find (which creates a function)
            for (let j = 0; j < selectedMovies.length; j++) {
              if (selectedMovies[j].identifier === nextMovie.identifier) {
                isDuplicate = true;
                break;
              }
            }
            
            if (!isDuplicate) {
              selectedMovies.push(nextMovie);
            }
          }
          
          return selectedMovies;
        });
        
        // Strategy 2: Prioritize movies with few comparisons while avoiding recent pairs
        strategyFunctions.push(() => {
          // Sort by fewest comparisons
          let sortedByComparisons = [...availableMovies];
          sortedByComparisons.sort((a, b) => {
            if (!a.identifier || !b.identifier) return 0;
            return rankings[a.identifier].comparisons - rankings[b.identifier].comparisons;
          });
          
          // Add randomness to initial grouping
          if (comparisons === 0) {
            const topCount = Math.max(1, Math.ceil(sortedByComparisons.length * 0.3));
            const topMovies = sortedByComparisons.slice(0, topCount);
            const shuffledTopMovies = shuffleArray(topMovies);
            sortedByComparisons = [...shuffledTopMovies, ...sortedByComparisons.slice(topCount)];
          }
            
          if (sortedByComparisons.length === 0) return [];
          
          // Get the first movie
          const firstMovie = sortedByComparisons[0];
          
          // Get recently compared movies for the first movie
          const recentlyCompared = new Set();
          if (firstMovie && rankings[firstMovie.identifier] && rankings[firstMovie.identifier].recentResults) {
            for (const result of rankings[firstMovie.identifier].recentResults) {
              if (result.opponent) recentlyCompared.add(result.opponent);
            }
          }
          
          // Filter remaining movies to avoid recent pairs - avoid creating functions in loop
          const remainingCandidates = [];
          for (let i = 1; i < sortedByComparisons.length; i++) {
            if (!recentlyCompared.has(sortedByComparisons[i].identifier)) {
              remainingCandidates.push(sortedByComparisons[i]);
            }
          }
          
          // Use filtered candidates if available, otherwise fall back to original sorted list
          const candidates = remainingCandidates.length > 0 ? 
            remainingCandidates : 
            sortedByComparisons.slice(1);
          
          return [firstMovie, ...candidates.slice(0, currentPhase.size - 1)];
        });
        
        // Strategy 3: Create groups with similar ratings to refine precision
        strategyFunctions.push(() => {
          if (availableMovies.length === 0) return [];
          
          // Get a random movie as an anchor
          const randomIndex = Math.floor(Math.random() * availableMovies.length);
          const anchorMovie = availableMovies[randomIndex];
          
          if (!anchorMovie || !anchorMovie.identifier || !rankings[anchorMovie.identifier]) {
            return availableMovies.slice(0, currentPhase.size);
          }
          
          const anchorRating = rankings[anchorMovie.identifier].rating;
          
          // Get recently compared movies for this anchor
          const recentlyCompared = new Set();
          if (rankings[anchorMovie.identifier].recentResults) {
            for (const result of rankings[anchorMovie.identifier].recentResults) {
              if (result.opponent) recentlyCompared.add(result.opponent);
            }
          }
          
          // Find movies with similar ratings but prioritize those not recently compared
          // Avoid filter + sort combination which creates multiple functions
          const candidates = [];
          for (const m of availableMovies) {
            if (m.identifier !== anchorMovie.identifier) {
              candidates.push(m);
            }
          }
          
          // Sort manually without creating inline functions
          candidates.sort((a, b) => {
            if (!a.identifier || !b.identifier) return 0;
            
            // First prioritize movies that haven't been recently compared
            const aRecent = recentlyCompared.has(a.identifier) ? 1 : 0;
            const bRecent = recentlyCompared.has(b.identifier) ? 1 : 0;
            if (aRecent !== bRecent) return aRecent - bRecent;
            
            // Then sort by rating similarity
            return Math.abs(rankings[a.identifier].rating - anchorRating) - 
                   Math.abs(rankings[b.identifier].rating - anchorRating);
          });
            
          return [anchorMovie, ...candidates.slice(0, currentPhase.size - 1)];
        });
        
        // Create candidate groups using different strategies - avoiding map to reduce function creation
        const candidateGroups = [];
        for (const strategyFn of strategyFunctions) {
          candidateGroups.push(strategyFn());
        }
        
        // Select the group with highest value - avoiding reduce to reduce function creation
        let bestGroup = null;
        let bestValue = -1;
        
        for (const group of candidateGroups) {
          const currentValue = calculateGroupValue(group, rankings);
          if (currentValue > bestValue) {
            bestValue = currentValue;
            bestGroup = group;
          }
        }
        
        selectedGroup = bestGroup;
        
        // Ensure we have enough movies in the group - avoid using filter and find
        if (selectedGroup && selectedGroup.length < currentPhase.size && availableMovies.length > selectedGroup.length) {
          // Manual implementation to avoid creating closures
          const remainingMovies = [];
          for (const movie of availableMovies) {
            let isInSelectedGroup = false;
            
            // Manual iteration to avoid .find
            for (let i = 0; i < selectedGroup.length; i++) {
              if (selectedGroup[i].identifier === movie.identifier) {
                isInSelectedGroup = true;
                break;
              }
            }
            
            if (!isInSelectedGroup) {
              remainingMovies.push(movie);
            }
          }
          
          // Add remaining movies until we reach the desired size
          for (let i = 0; i < remainingMovies.length && selectedGroup.length < currentPhase.size; i++) {
            selectedGroup.push(remainingMovies[i]);
          }
        }
      }
  
      // Log selected group - avoid using map which creates a function
      let movieTitles = '';
      if (selectedGroup && selectedGroup.length > 0) {
        for (let i = 0; i < selectedGroup.length; i++) {
          if (i > 0) movieTitles += ', ';
          movieTitles += selectedGroup[i].title || 'Unknown';
        }
      }
      console.log(`Selected group of ${selectedGroup ? selectedGroup.length : 0} movies: ${movieTitles}`);
      
      // For pair mode, store this comparison in our tracking map
      if (selectedGroup && selectedGroup.length === 2) {
        const pairId = [selectedGroup[0].identifier, selectedGroup[1].identifier].sort().join('_');
        comparedPairsRef.current.set(pairId, comparisons);
      }
      
      // Mark movies as used - avoid closure and forEach
      if (selectedGroup) {
        setCurrentGroup([...selectedGroup]); // Make a copy to avoid reference issues
        
        setMoviesUsed(prev => {
          // Create a new Set to ensure React detects the state change
          const newSet = new Set(prev);
          
          // Use for loop instead of forEach to avoid creating a function
          for (let i = 0; i < selectedGroup.length; i++) {
            if (selectedGroup[i] && selectedGroup[i].identifier) {
              newSet.add(selectedGroup[i].identifier);
            }
          }
          
          return newSet;
        });
      } else {
        // Handle null/undefined selectedGroup case
        setCurrentGroup([]);
      }
  
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
    // Use moviesRef.current directly instead of memoizedMovies
    availableMoviesCache,
    // shuffleArray doesn't need to be in the dependency array as it's defined outside the callback
  ]);

  const handlePairChoice = useCallback((winner, loser) => {
    console.log(`Pair choice made: ${winner.title} over ${loser.title}`);
    // Create new array to avoid reference leaks
    onChoose(winner.identifier, loser.identifier, [{...winner}, {...loser}]);
    setCurrentGroup([]); // This will trigger useEffect to select new group
  }, [onChoose]);

  const handleGroupChoice = useCallback((selectedIndex, groupMovies) => {
    console.log(`Group choice made: ${groupMovies[selectedIndex].title} selected from group of ${groupMovies.length}`);
    
    // The selected movie wins against all others in the group
    const winner = groupMovies[selectedIndex];
    const losers = groupMovies.filter((_, i) => i !== selectedIndex);
    
    // Create deep copies to prevent reference leaks
    const winnerCopy = {...winner};
    
    // Process all implicit comparisons
    losers.forEach(loser => {
      // Create new array for each comparison to prevent reference leaks
      const comparisonGroup = groupMovies.map(movie => ({...movie}));
      onChoose(winner.identifier, loser.identifier, comparisonGroup);
    });
    
    setCurrentGroup([]); // This will trigger useEffect to select new group
  }, [onChoose]);

  // Remove the auto-resolved pair state since we're handling silently

  useEffect(() => {
    // Memoize the handler to prevent recreating on each render
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
  
    // Use passive listener for better performance
    window.addEventListener('keydown', handleKeyPress, { passive: true });
    
    // Explicit cleanup function
    return () => {
      window.removeEventListener('keydown', handleKeyPress, { passive: true });
    };
  }, [currentGroup.length, comparisons, onUndo, isAnimating]);

  useEffect(() => {
    // Only select a new group if we don't have one already
    if (currentGroup.length === 0 && comparisons < maxComparisons) {
      // Clear pairwise cache when selecting a new group to avoid excessive memory usage
      // This allows reuse within a single group selection but clears between groups
      selectGroup();
    }
  }, [currentGroup.length, comparisons, maxComparisons, selectGroup]);
  
  // Add effect to check and auto-resolve previously compared pairs
  useEffect(() => {
    // Only check for auto-resolution in pair mode
    if (currentMode === 'pair' && currentGroup.length === 2 && !isAnimating) {
      const [movieA, movieB] = currentGroup;
      
      // Create unique pair ID
      const pairId = [movieA.identifier, movieB.identifier].sort().join('_');
      const lastComparisonIndex = comparedPairsRef.current?.get(pairId);
      
      // If this is an extremely recent comparison (within last 5 comparisons)
      if (lastComparisonIndex && (comparisons - lastComparisonIndex) < 5) {
        // Find previous result from rankingsA.recentResults
        const prevResult = rankings[movieA.identifier]?.recentResults?.find(
          r => r.opponent === movieB.identifier
        );
        
        // Or from rankingsB.recentResults
        const altPrevResult = !prevResult && rankings[movieB.identifier]?.recentResults?.find(
          r => r.opponent === movieA.identifier
        );
        
        if (prevResult || altPrevResult) {
          console.log("Silently auto-resolving previously compared pair");
          
          // Determine winner and loser from previous result
          let winner, loser;
          
          if (prevResult) {
            // If A won against B previously
            if (prevResult.result === 1) {
              winner = movieA;
              loser = movieB;
            } else {
              winner = movieB;
              loser = movieA;
            }
          } else if (altPrevResult) {
            // If B won against A previously
            if (altPrevResult.result === 1) {
              winner = movieB;
              loser = movieA;
            } else {
              winner = movieA;
              loser = movieB;
            }
          }
          
          // Auto-resolve with previous result immediately
          // Skip animation and proceed directly to the next pair
          if (winner && loser) {
            // Use a very short delay just to ensure state updates don't conflict
            setTimeout(() => {
              // Handle the choice silently
              onChoose(winner.identifier, loser.identifier, [{...winner}, {...loser}]);
              // Clear the current group to trigger selection of next pair
              setCurrentGroup([]);
            }, 10);
          }
        }
      }
    }
  }, [currentGroup, currentMode, isAnimating, rankings, comparisons, onChoose]);
  
  // Cleanup timeout and caches on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Clear caches to prevent memory leaks
      if (groupValueCache.current) {
        groupValueCache.current.clear();
      }
    };
  }, []);

  // Make sure to declare all hooks before any conditionals
  const handlePairSelect = useCallback((index) => {
    if (isAnimating || !currentGroup[index]) return;
    
    setIsAnimating(true);
    setSelectedIndex(index);
    
    // Clear any existing timeout to prevent memory leaks
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    timeoutRef.current = setTimeout(() => {
      // Create shallow copies to avoid reference leaks
      const item1 = {...currentGroup[index]};
      const item2 = {...currentGroup[1 - index]};
      
      handlePairChoice(item1, item2);
      setSelectedIndex(null);
      setIsAnimating(false);
      timeoutRef.current = null;
    }, 150);
  }, [isAnimating, currentGroup, handlePairChoice]);

  // Run finisher effect if needed inside render, before return
  useEffect(() => {
    if (comparisons >= maxComparisons) {
      onFinish();
    }
  }, [comparisons, maxComparisons, onFinish]);
  
  // Early return null is a common pattern and safe since it's above
  if (comparisons >= maxComparisons) {
    return null;
  }

  // Render appropriate UI based on state
  let content;
  if (error) {
    content = (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="card bg-base-200 p-6 shadow-lg">
          <h3 className="text-lg font-semibold text-error mb-2">Error</h3>
          <p className="text-base-content/70">{error}</p>
        </div>
      </div>
    );
  } else if (currentMode === 'pair' && currentGroup.length === 2) {
    content = (
      <div className="mx-auto px-4 py-8 flex flex-col justify-center items-center min-h-[70vh]" style={{ maxWidth: "min(100%, 30rem)" }}>
        <div className="text-center mb-6 md:mb-8">
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

        <div className="grid grid-cols-2 gap-4 md:gap-6 w-full [&:hover_button]:opacity-30">
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
                <div className="relative aspect-[2/3] w-full">
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
                  <div className="absolute bottom-0 left-0 right-0 p-2 md:p-4 z-10">
                    <h3 className="text-sm md:text-lg font-bold mb-0 md:mb-1 text-white truncate" title={movie.title}>
                      {movie.title}
                    </h3>
                    <p className="text-white/90 text-xs md:text-sm">{movie.year}</p>
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  } else if (currentMode === 'group' && currentGroup.length >= 3) {
    content = (
      <GroupSelection 
        movies={currentGroup} 
        groupSize={groupSize}
        onSelect={handleGroupChoice}
        isHighImpact={isHighImpact}
      />
    );
  } else {
    content = (
      <div className="flex justify-center items-center h-[70vh]">
        <div className="loading loading-spinner loading-lg text-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-4 max-w-6xl relative flex flex-col justify-center min-h-[80vh]" ref={containerRef}>
      {/* Main content */}
      <div className="mx-auto relative w-full">
        {content}
        
        {/* Undo button section */}
        <div className="text-center mt-6 md:mt-8 mb-4">
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
