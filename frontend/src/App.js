// App.js
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import InputForm from './components/InputForm';
import RankingProcess from './components/RankingProcess';
import MovieResults from './components/Results';
import ProgressBar from './components/ProgressBar';
import ModeSelection from './components/ModeSelection';
import StatusBar from './components/StatusBar';
import Instructions from './components/Instructions';

const CONFIDENCE_SCALING = {
  BASE_THRESHOLD: 0.7,
  MIN_DATASET: 10,
  MAX_DATASET: 500,
  EARLY_STAGE_MULTIPLIER: 0.8,
  LATE_STAGE_MULTIPLIER: 1.2,
  MIN_ALLOWED_THRESHOLD: 0.5,
  MAX_ALLOWED_THRESHOLD: 0.9
};

const CONFIDENCE_CONSTANTS = {
  MIN_COMPARISONS: 3,
  OPTIMAL_COMPARISONS: 5,
  LOCAL_RANGE: 3,
  RECENT_WEIGHT: 0.6,
  HISTORICAL_WEIGHT: 0.4,
  POSITION_WEIGHTS: {
    TOP: 0.8,    // Expect more consistent wins
    MIDDLE: 0.5, // Mixed results are okay
    BOTTOM: 0.8  // Expect more consistent losses
  },
  TRANSITIVITY_WEIGHT: 0.3,
  COMPARISON_QUALITY_WEIGHT: 0.2
};

const calculateAdaptiveThresholds = (movieCount, progress) => {
  // Calculate base scaling factor based on dataset size
  const sizeFactor = Math.min(Math.max(
    (movieCount - CONFIDENCE_SCALING.MIN_DATASET) / 
    (CONFIDENCE_SCALING.MAX_DATASET - CONFIDENCE_SCALING.MIN_DATASET),
    0
  ), 1);
  
  // Adjust base threshold based on dataset size
  // Smaller datasets need higher confidence thresholds
  const baseThreshold = CONFIDENCE_SCALING.BASE_THRESHOLD * (1 - sizeFactor * 0.3);
  
  // Calculate progress-based thresholds
  const progressMultiplier = progress < 0.3 ? 
    CONFIDENCE_SCALING.EARLY_STAGE_MULTIPLIER :
    progress > 0.7 ? 
      CONFIDENCE_SCALING.LATE_STAGE_MULTIPLIER : 
      1;
  
  // Calculate final threshold with bounds
  const adaptiveThreshold = Math.min(
    Math.max(
      baseThreshold * progressMultiplier,
      CONFIDENCE_SCALING.MIN_ALLOWED_THRESHOLD
    ),
    CONFIDENCE_SCALING.MAX_ALLOWED_THRESHOLD
  );

  return {
    confidence: adaptiveThreshold,
    stability: adaptiveThreshold * 0.8,
    transitivity: adaptiveThreshold * 0.9,
    rankChange: Math.max(0.02, 0.05 * (1 - sizeFactor))
  };
};

// Advanced cache for transitivity calculations with positional context and dependency tracking
class TransitivityCache {
  constructor() {
    this.cache = new Map(); // Main result cache
    this.dependencies = new Map(); // Tracks which movies affect each cache entry
    this.movieRelationships = new Map(); // Tracks relationships between movies for invalidation
  }
  
  // Get a cached result if available
  get(movieId, position) {
    const cacheKey = `${movieId}_${position}`;
    return this.cache.get(cacheKey);
  }
  
  // Check if a result is cached
  has(movieId, position) {
    const cacheKey = `${movieId}_${position}`;
    return this.cache.has(cacheKey);
  }
  
  // Store a result and its dependencies
  set(movieId, position, result, triads) {
    const cacheKey = `${movieId}_${position}`;
    this.cache.set(cacheKey, result);
    
    // Store dependencies for this cache entry
    this.dependencies.set(cacheKey, new Set(triads));
    
    // Update relationship tracking for each involved movie
    triads.forEach(triad => {
      triad.forEach(id => {
        if (!this.movieRelationships.has(id)) {
          this.movieRelationships.set(id, new Set());
        }
        // Link this movie to the cache entry
        this.movieRelationships.get(id).add(cacheKey);
      });
    });
  }
  
  // Selectively invalidate cache entries when a movie's rating or results change
  invalidateMovie(movieId) {
    // Find all cache entries that depend on this movie
    const affectedCacheKeys = this.movieRelationships.get(movieId);
    if (affectedCacheKeys) {
      // Invalidate each affected cache entry
      affectedCacheKeys.forEach(key => {
        this.cache.delete(key);
        
        // Clean up dependency entries for invalidated items
        const dependencies = this.dependencies.get(key);
        if (dependencies) {
          dependencies.forEach(triad => {
            triad.forEach(id => {
              const relationships = this.movieRelationships.get(id);
              if (relationships) {
                relationships.delete(key);
              }
            });
          });
        }
        this.dependencies.delete(key);
      });
    }
  }
  
  // Clear the entire cache
  clear() {
    this.cache.clear();
    this.dependencies.clear();
    this.movieRelationships.clear();
  }
  
  // Get statistics about the cache (for debugging/monitoring)
  getStats() {
    return {
      cacheSize: this.cache.size,
      dependendencyTrackedMovies: this.movieRelationships.size,
      totalDependencies: this.dependencies.size
    };
  }
}

// Create an instance of the enhanced transitivity cache
const transitivityCache = new TransitivityCache();

// Helper function to clear transitivity cache
const clearTransitivityCache = () => {
  transitivityCache.clear();
};

// Helper to selectively invalidate cache entries for specific movies
const invalidateTransitivityCache = (movieId) => {
  transitivityCache.invalidateMovie(movieId);
};

const calculateLocalTransitivity = (movieId, rankings, sortedMovies, position) => {
  // Check if the result is already cached
  if (transitivityCache.has(movieId, position)) {
    return transitivityCache.get(movieId, position);
  }
  
  const localRange = CONFIDENCE_CONSTANTS.LOCAL_RANGE;
  const start = Math.max(0, position - localRange);
  const end = Math.min(sortedMovies.length, position + localRange + 1);
  const localMovies = sortedMovies.slice(start, end);
  
  let weightedTransitivity = 0;
  let totalWeight = 0;
  const processedTriads = []; // Track processed triads for dependency tracking
  
  // Find high-value triads to prioritize
  const highValueTriads = [];
  const targetTriadCount = Math.min(100, Math.floor(localMovies.length * (localMovies.length - 1) * (localMovies.length - 2) / 6));
  const confidence_threshold = 0.85; // Confidence threshold for early termination
  
  // Build a quick lookup for recent comparisons
  const comparisonLookup = new Map();
  localMovies.forEach(m => {
    const id = m.movie.identifier;
    if (!comparisonLookup.has(id)) {
      comparisonLookup.set(id, new Set());
    }
    const opponents = comparisonLookup.get(id);
    rankings[id].recentResults.forEach(r => {
      if (r.opponent) opponents.add(r.opponent);
    });
  });
  
  // Check if two movies have been directly compared
  const hasDirectComparison = (idA, idB) => {
    return comparisonLookup.has(idA) && comparisonLookup.get(idA).has(idB);
  };
  
  // Prioritize triads with closer rating differences
  for (let i = 0; i < localMovies.length - 2; i++) {
    for (let j = i + 1; j < localMovies.length - 1; j++) {
      const a = localMovies[i].movie.identifier;
      const b = localMovies[j].movie.identifier;
      
      // Skip if no direct comparison exists
      if (!hasDirectComparison(a, b)) continue;
      
      for (let k = j + 1; k < localMovies.length; k++) {
        const c = localMovies[k].movie.identifier;
        
        // Only consider triads with existing comparison data
        if (hasDirectComparison(a, c) && hasDirectComparison(b, c)) {
          // Calculate triad value based on rating differences and position
          const ratingDiffs = Math.abs(rankings[a].rating - rankings[b].rating) +
                            Math.abs(rankings[b].rating - rankings[c].rating) +
                            Math.abs(rankings[a].rating - rankings[c].rating);
          
          // Calculate positional weight (closer positions matter more)
          const posWeight = 1 / (Math.abs(position - i) + 1);
          
          // Calculate overall triad importance
          const triadValue = posWeight * (1 / (1 + ratingDiffs));
          
          highValueTriads.push({
            indices: [i, j, k],
            ids: [a, b, c],
            value: triadValue
          });
        }
      }
    }
  }
  
  // Sort triads by value (most informative first)
  highValueTriads.sort((t1, t2) => t2.value - t1.value);
  
  // Process triads in order of decreasing value
  const processedTriadIds = new Set();
  
  // Cap the number of triads processed based on available high-value triads
  const triadsToProcess = Math.min(targetTriadCount, highValueTriads.length);
  
  for (let t = 0; t < triadsToProcess; t++) {
    const triad = highValueTriads[t];
    const [i, j, k] = triad.indices;
    const [a, b, c] = triad.ids;
    
    // Store this triad for dependency tracking
    processedTriads.push([a, b, c]);
    processedTriadIds.add(`${a}_${b}_${c}`);
    
    // Calculate positional weight (closer positions matter more)
    const posWeight = 1 / (Math.abs(position - i) + 1);
    
    // Calculate rating difference weight
    const ratingDiffs = Math.abs(rankings[a].rating - rankings[b].rating) +
                      Math.abs(rankings[b].rating - rankings[c].rating) +
                      Math.abs(rankings[a].rating - rankings[c].rating);
    const ratingWeight = 1 / (1 + ratingDiffs);
    
    const weight = posWeight * ratingWeight;
    
    // Check for transitivity
    totalWeight += weight;
    if ((rankings[a].rating > rankings[b].rating && 
         rankings[b].rating > rankings[c].rating && 
         rankings[a].rating > rankings[c].rating) ||
        (rankings[c].rating > rankings[b].rating && 
         rankings[b].rating > rankings[a].rating && 
         rankings[c].rating > rankings[a].rating)) {
      weightedTransitivity += weight;
    }
    
    // Check for early termination if we've processed enough triads
    if (t > Math.min(10, triadsToProcess / 4)) {
      const currentScore = totalWeight > 0 ? weightedTransitivity / totalWeight : 0.5;
      // If confidence is high enough, we can terminate early
      if (currentScore > confidence_threshold && t >= Math.min(20, triadsToProcess / 2)) {
        break;
      }
    }
  }
  
  // If we didn't find enough high-value triads, sample random triads to ensure
  // we have enough data for a reliable calculation
  if (totalWeight < 1 && localMovies.length > 3) {
    const additionalTriads = Math.min(20, localMovies.length);
    for (let sample = 0; sample < additionalTriads; sample++) {
      // Choose 3 random distinct indices
      const indices = new Set();
      while (indices.size < 3) {
        indices.add(Math.floor(Math.random() * localMovies.length));
      }
      
      const [i, j, k] = [...indices].sort((a, b) => a - b);
      const [a, b, c] = [
        localMovies[i].movie.identifier,
        localMovies[j].movie.identifier,
        localMovies[k].movie.identifier
      ];
      
      // Skip if already processed
      const triadKey = `${a}_${b}_${c}`;
      if (processedTriadIds.has(triadKey)) continue;
      
      // Store for dependency tracking
      processedTriads.push([a, b, c]);
      processedTriadIds.add(triadKey);
      
      // Calculate weights
      const posWeight = 1 / (Math.abs(position - i) + 1);
      const ratingDiffs = Math.abs(rankings[a].rating - rankings[b].rating) +
                         Math.abs(rankings[b].rating - rankings[c].rating) +
                         Math.abs(rankings[a].rating - rankings[c].rating);
      const ratingWeight = 1 / (1 + ratingDiffs);
      const weight = posWeight * ratingWeight;
      
      // Only count triads with comparison data
      if (hasDirectComparison(a, b) && hasDirectComparison(a, c) && hasDirectComparison(b, c)) {
        totalWeight += weight;
        if ((rankings[a].rating > rankings[b].rating && 
             rankings[b].rating > rankings[c].rating && 
             rankings[a].rating > rankings[c].rating) ||
            (rankings[c].rating > rankings[b].rating && 
             rankings[b].rating > rankings[a].rating && 
             rankings[c].rating > rankings[a].rating)) {
          weightedTransitivity += weight;
        }
      }
    }
  }
  
  const result = totalWeight > 0 ? weightedTransitivity / totalWeight : 0.5;
  
  // Cache the result with dependency information
  transitivityCache.set(movieId, position, result, processedTriads);
  
  return result;
};

// Cache for enhanced confidence intermediate calculations
const enhancedConfidenceCache = new Map();

const calculateEnhancedConfidence = (movieId, rankings, allMovies) => {
  const record = rankings[movieId];
  if (!record || record.comparisons < CONFIDENCE_CONSTANTS.MIN_COMPARISONS) {
    return 0.2; // Minimum baseline confidence of 20%
  }

  // Create cache keys for the expensive parts
  const cacheKey = `${movieId}_${record.comparisons}_${record.wins}_${record.rating.toFixed(4)}`;
  
  // Check if we already calculated this exact configuration
  if (enhancedConfidenceCache.has(cacheKey)) {
    return enhancedConfidenceCache.get(cacheKey);
  }

  // 1. Base Comparison Confidence (0-1)
  const comparisonScore = Math.min(
    record.comparisons / CONFIDENCE_CONSTANTS.OPTIMAL_COMPARISONS,
    1
  ) * 0.8 + 0.2; // Minimum 20% if at least MIN_COMPARISONS

  // 2. Bayesian Confidence (based on uncertainty)
  // Lower uncertainty = higher confidence
  const bayesianConfidence = 1 - Math.min(record.ratingUncertainty, 1);

  // 3. Position-Aware Consistency (0-1)
  // Sorting is expensive - only do once and cache the result
  const sortedMovies = Object.values(rankings).sort((a, b) => b.rating - a.rating);
  const position = sortedMovies.findIndex(r => r.movie.identifier === movieId);
  const relativePosition = position / sortedMovies.length;

  let expectedWinRate, positionWeight;
    if (relativePosition <= 0.25) {
      expectedWinRate = 0.75; // Top 25% should win most
      positionWeight = CONFIDENCE_CONSTANTS.POSITION_WEIGHTS.TOP;
    } else if (relativePosition >= 0.75) {
      expectedWinRate = 0.25; // Bottom 25% should lose most
      positionWeight = CONFIDENCE_CONSTANTS.POSITION_WEIGHTS.BOTTOM;
    } else {
      expectedWinRate = 0.5; // Middle 50% can be mixed
      positionWeight = CONFIDENCE_CONSTANTS.POSITION_WEIGHTS.MIDDLE;
    }

  const actualWinRate = record.wins / record.comparisons;
  const consistencyScore = (1 - Math.abs(actualWinRate - expectedWinRate)) * positionWeight;

  // 4. Local Performance (0-1)
  const neighbors = sortedMovies
    .slice(
      Math.max(0, position - CONFIDENCE_CONSTANTS.LOCAL_RANGE),
      Math.min(sortedMovies.length, position + CONFIDENCE_CONSTANTS.LOCAL_RANGE + 1)
    )
    .map(r => r.movie.identifier)
    .filter(id => id !== movieId);

  const localComparisons = record.recentResults.filter(r => 
    neighbors.includes(r.opponent)
  );
  
  const localConsistencyScore = localComparisons.length > 0
    ? localComparisons.reduce((sum, r) => 
        sum + (r.result === (r.opponent.rating < record.rating ? 1 : 0)), 
        0
      ) / localComparisons.length
    : 0.5;

  // 5. Group Selection Confidence
  // Chosen/appearances ratio is a good indicator of confidence
  const groupConfidence = record.groupSelections.appearances > 0 
    ? (record.groupSelections.chosen / record.groupSelections.appearances) 
    : 0.5;

  // 6. Temporal Confidence (0-1)
  const recentResults = record.recentResults.slice(-5);
  const historicalResults = record.recentResults.slice(0, -5);
  
  const calculateResultsConsistency = results => {
    if (results.length < 2) return 0.5;
    let flips = 0;
    for (let i = 1; i < results.length; i++) {
      if (results[i].result !== results[i-1].result) flips++;
    }
    return 1 - (flips / (results.length - 1));
  };

  const recentConsistency = calculateResultsConsistency(recentResults);
  const historicalConsistency = calculateResultsConsistency(historicalResults);
  
  const temporalConsistency = 
    (recentConsistency * CONFIDENCE_CONSTANTS.RECENT_WEIGHT) +
    (historicalConsistency * CONFIDENCE_CONSTANTS.HISTORICAL_WEIGHT);

  // 7. Transitivity Score (0-1) - this function is already cached internally
  const transitivityScore = calculateLocalTransitivity(
    movieId, 
    rankings, 
    sortedMovies, 
    position
  );

  // Combine all factors with weights
  const finalConfidence = (
    comparisonScore * 0.15 +
    bayesianConfidence * 0.20 +
    consistencyScore * 0.15 +
    localConsistencyScore * 0.15 +
    groupConfidence * 0.10 +
    temporalConsistency * 0.15 +
    transitivityScore * 0.10
  );

  // Final confidence value
  const result = Math.min(Math.max(finalConfidence, 0.2), 1);
  
  // Store in cache
  enhancedConfidenceCache.set(cacheKey, result);
  
  return result;
};

const calculateComparisonImpact = (movieA, movieB, rankings, progress) => {
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
};

function App() {
  const [movies, setMovies] = useState([]);
  const [rankings, setRankings] = useState({});
  const [step, setStep] = useState('input');
  const [comparisons, setComparisons] = useState(0);
  const [maxComparisons, setMaxComparisons] = useState(0);
  const [pendingUpdates, setPendingUpdates] = useState([]);
  const [recentChanges, setRecentChanges] = useState([]);
  const [comparisonHistory, setComparisonHistory] = useState([]);
  const [movieMomentum, setMovieMomentum] = useState({});
  const [isCurrentComparisonHighImpact, setIsCurrentComparisonHighImpact] = useState(false);
  const [currentLearningRate, setCurrentLearningRate] = useState(0.1);
  const [globalOptimizationStats, setGlobalOptimizationStats] = useState({
    lastOptimizationComparison: 0,
    totalCorrections: 0,
    transitivityViolationsFixed: 0,
    inconsistencyCorrectionsMade: 0
  });
  const globalRecalculationRef = useRef(false);
  const prevRankingsRef = useRef(null);
  const prevMoviesCountRef = useRef(0);

  const CONVERGENCE_CHECK_WINDOW = 10;
  const BASE_LEARNING_RATE = 0.1;

  const VOLATILITY_WINDOW = 20; // How many recent changes to consider
  const VOLATILITY_THRESHOLD_HIGH = 0.05; // High volatility threshold
  const VOLATILITY_THRESHOLD_LOW = 0.01; // Low volatility threshold

  const MOMENTUM_FACTOR = 0.9;
  const MIN_LEARNING_RATE = 0.01;
  const MAX_LEARNING_RATE = 0.2;
  
  // Global Optimization parameters
  const GLOBAL_OPTIMIZATION = {
    RECALCULATION_INTERVAL: 10,    // Perform global recalculation more frequently (was 15)
    CONSISTENCY_THRESHOLD: 0.85,   // Threshold for consistency correction
    MAX_CORRECTION_STRENGTH: 0.5,  // Maximum correction strength (0-1)
    MIN_COMPARISONS_REQUIRED: 5,   // Fewer comparisons before optimizing (was 10)
    TRANSITIVITY_VIOLATIONS_WEIGHT: 0.7, // Weight for transitivity violation corrections
    INCREMENTAL_ADJUSTMENT: 0.6,   // Portion of correction to apply (incremental approach)
    CYCLES_DETECTION_SAMPLE: 300,  // Maximum number of cycles to check
    CYCLES_MAX_LENGTH: 5,          // Maximum cycle length to detect (3-5 recommended)
    DIRECT_COMPARISON_PRIORITY: 1.0, // Priority for direct comparisons (highest priority)
    DIRECT_CORRECTION_STRENGTH: 0.8  // Strength of direct comparison corrections (0-1)
  };
  
  // Learning rate adaptation parameters
  const LEARNING_RATE_PARAMS = {
    ADAPTATION_WINDOW: 15,         // Window size for adaptation calculation
    BASE_RATE: 0.1,                // Starting learning rate
    ADAPTIVE_FACTOR: 0.75,         // How much to rely on adaptation vs base rate
    CONSISTENCY_SCALING: 1.5,      // Scaling for consistent results
    INCONSISTENCY_SCALING: 0.6,    // Scaling for inconsistent results
    PROGRESS_DECAY: 0.5,           // Rate at which learning rate naturally decays with progress
    SURPRISE_BOOST: 1.5,           // Increase for surprising results
    EXPECTED_RESULT_DAMPING: 0.7,  // Decrease for expected results
    EARLY_PHASE_BOOST: 1.2,        // Higher learning rate in early phases
    LATE_PHASE_DAMPING: 0.8        // Lower learning rate in later phases
  };

  const EARLY_TERMINATION = {
    MIN_PROGRESS: 0.4, // Don't terminate before 40% completion
    MIN_COMPARISONS_PER_MOVIE: 5,
    MIN_CONFIDENCE_THRESHOLD: 0.7,
    STABILITY_WINDOW: 15,
    STABILITY_THRESHOLD: 0.03,
    MIN_TRANSITIVITY_SCORE: 0.85,
    RELATIVE_RANK_STABILITY: 0.9
  };

  // Implement confidence score caching with memoization
  // Cache for confidence scores
  const confidenceCache = useRef(new Map());
  
  // Enhanced cache that stores both confidence and transitivity results
  // Selectively clear cache when rankings change
  useEffect(() => {
    // Full cache clear is only needed when movies array changes (add/remove)
    if (Object.keys(rankings).length !== prevMoviesCountRef.current) {
      confidenceCache.current.clear();
      clearTransitivityCache(); // Full clear transitivity cache
      enhancedConfidenceCache.clear(); // Full clear enhanced confidence cache
      console.log('All confidence caches cleared due to movie count change');
      prevMoviesCountRef.current = Object.keys(rankings).length;
      return;
    }
    
    // For rating changes, selectively invalidate only affected movies
    if (prevRankingsRef.current) {
      const changedMovies = [];
      
      // Find which movies have changed ratings
      Object.keys(rankings).forEach(movieId => {
        if (prevRankingsRef.current[movieId] && 
            rankings[movieId].rating !== prevRankingsRef.current[movieId].rating) {
          changedMovies.push(movieId);
          
          // Clear confidence cache for this movie
          confidenceCache.current.delete(movieId);
          
          // Selectively invalidate transitivity cache for this movie
          invalidateTransitivityCache(movieId);
          
          // Clear enhanced confidence cache entries that depend on this movie
          // For simplicity, we'll just remove entries that have this movie's ID in the key
          Array.from(enhancedConfidenceCache.keys()).forEach(key => {
            if (key.includes(movieId)) {
              enhancedConfidenceCache.delete(key);
            }
          });
        }
      });
      
      if (changedMovies.length > 0) {
        console.log(`Selectively cleared cache for ${changedMovies.length} changed movies`);
      }
    }
    
    // Store current rankings for next comparison
    prevRankingsRef.current = JSON.parse(JSON.stringify(rankings));
  }, [rankings, movies]); // Only reset when rankings or movies change
  
  const calculateConfidence = useCallback((movieId) => {
    // Check if result is already in cache
    if (confidenceCache.current.has(movieId)) {
      return confidenceCache.current.get(movieId);
    }
    
    // Calculate if not cached
    const confidence = calculateEnhancedConfidence(movieId, rankings, movies);
    
    // Store in cache
    confidenceCache.current.set(movieId, confidence);
    
    return confidence;
  }, [rankings, movies]);

  const calculateBatchParameters = useCallback((movieCount) => {
    const scalingFactor = Math.log2(movieCount) / Math.log2(100);
  
    // Calculate base sizes
    const baseSizes = {
      EARLY_STAGE_SIZE: Math.min(8, Math.max(2, Math.floor(movieCount * 0.03 * scalingFactor))),
      MID_STAGE_SIZE: Math.min(12, Math.max(3, Math.floor(movieCount * 0.06 * scalingFactor))),
      LATE_STAGE_SIZE: Math.min(20, Math.max(4, Math.floor(movieCount * 0.1 * scalingFactor))),
      EARLY_STAGE_THRESHOLD: 0.15 + (0.05 * (1 - scalingFactor)),
      LATE_STAGE_THRESHOLD: 0.65 + (0.1 * scalingFactor),
      MIN_CONFIDENCE_THRESHOLD: 0.35 + (0.1 * scalingFactor)
    };
    
    // Calculate volatility factor based on recent rating changes
    const calculateVolatility = () => {
      if (recentChanges.length < VOLATILITY_WINDOW) {
        return 1; // Default to normal batch size if not enough data
      }
  
      // Calculate average magnitude of recent rating changes
      const recentVolatility = recentChanges
        .slice(-VOLATILITY_WINDOW)
        .reduce((sum, change) => sum + Math.abs(change), 0) / VOLATILITY_WINDOW;
  
      // Convert volatility to a scaling factor between 0.5 and 1.5
      if (recentVolatility > VOLATILITY_THRESHOLD_HIGH) {
        return 0.5; // High volatility = smaller batches
      } else if (recentVolatility < VOLATILITY_THRESHOLD_LOW) {
        return 1.5; // Low volatility = larger batches
      } else {
        // Linear interpolation between thresholds
        return 1 + ((VOLATILITY_THRESHOLD_HIGH - recentVolatility) / 
                    (VOLATILITY_THRESHOLD_HIGH - VOLATILITY_THRESHOLD_LOW));
      }
    };
  
    const volatilityFactor = calculateVolatility();
    
    // Apply volatility factor to batch sizes
    return {
      ...baseSizes,
      EARLY_STAGE_SIZE: Math.max(2, Math.round(baseSizes.EARLY_STAGE_SIZE * volatilityFactor)),
      MID_STAGE_SIZE: Math.max(3, Math.round(baseSizes.MID_STAGE_SIZE * volatilityFactor)),
      LATE_STAGE_SIZE: Math.max(4, Math.round(baseSizes.LATE_STAGE_SIZE * volatilityFactor))
    };
  }, [recentChanges]);

  const startRanking = useCallback((movieList) => {
    console.log(`Starting ranking process with ${movieList.length} movies`);
    const initialRankings = movieList.reduce((acc, movie) => {
      acc[movie.identifier] = {
        // Basic rating properties
        rating: 0,
        movie: movie,
        wins: 0,
        losses: 0,
        comparisons: 0,
        
        // Result tracking
        recentResults: [], // Will store objects with opponent and result info
        
        // Bayesian properties
        ratingMean: 0,       // Mean of the rating distribution
        ratingUncertainty: 1, // Standard deviation/uncertainty of rating
        
        // Group selection metrics
        groupSelections: {
          chosen: 0,         // Times chosen from a group
          appearances: 0     // Times appeared in groups
        },
        
        // Confidence metrics
        confidenceScore: 0,
        uncertainty: 1 // Initial high uncertainty
      };
      return acc;
    }, {});
    setMovies(movieList);
    setRankings(initialRankings);
    setStep('mode-selection');
  }, []);

  const selectMode = (mode, comparisonsCount) => {
    setMaxComparisons(comparisonsCount);
    setStep('instructions');
  };

  const finishRanking = useCallback(() => {
    console.log("Finishing ranking process");
    setTimeout(() => {
      setStep('results');
    }, 0);
  }, []);

  const handleUndo = useCallback(() => {
    if (comparisonHistory.length > 0) {
      const newHistory = [...comparisonHistory];
      const lastComparison = newHistory.pop();
      setComparisonHistory(newHistory);
      setComparisons(prev => Math.max(0, prev - 1));
      
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
      
      // Reset the rankings to the previous state and provide the previous pair
      if (lastComparison) {
        // Create a deep copy of the rankings to avoid reference leaks
        const previousRankings = Object.entries(lastComparison.rankings).reduce((acc, [key, value]) => {
          acc[key] = {
            ...value,
            movie: {...value.movie},
            recentResults: value.recentResults.map(result => ({...result}))
          };
          return acc;
        }, {});
        
        setRankings(previousRankings);
        
        // Reset recent changes since we're going back
        setRecentChanges([]);
        
        // Create a new array with copies of the pair objects
        const pairCopy = lastComparison.pair.map(item => ({...item}));
        return pairCopy; // Return copies of the previous pair
      }
    }
    return null;
  }, [comparisonHistory]);
  
  const checkTransitivityViolation = useCallback((winner, loser) => {
    const winnerRating = rankings[winner].rating;
    const loserRating = rankings[loser].rating;
    
    // If the winner's current rating is lower, this is a transitivity violation
    if (winnerRating < loserRating) {
      console.log(`Transitivity violation detected: ${winner} (${winnerRating}) beat ${loser} (${loserRating})`);
      return true;
    }
    return false;
  }, [rankings]);

  const calculateAdaptiveLearningRate = useCallback((winner, loser) => {
    // Get recent results for both movies
    const winnerResults = rankings[winner].recentResults || [];
    const loserResults = rankings[loser].recentResults || [];
    
    // Calculate consistency scores - higher is more consistent pattern
    const calculateConsistency = (results) => {
      if (results.length < 2) return 0.5; // Default for too few results
      
      let flips = 0;
      for (let i = 1; i < results.length; i++) {
        if (results[i].result !== results[i-1].result) flips++;
      }
      
      // Return consistency (1 = perfectly consistent, 0 = alternating results)
      return 1 - (flips / (results.length - 1));
    };
    
    const winnerConsistency = calculateConsistency(winnerResults);
    const loserConsistency = calculateConsistency(loserResults);
    const avgConsistency = (winnerConsistency + loserConsistency) / 2;
    
    // Check if most recent results match expectations based on ratings
    const expectedWinnerWins = rankings[winner].rating > rankings[loser].rating;
    let recentResultsMatchExpectations = true;
    
    if (winnerResults.length > 0) {
      const recentWinnerResult = winnerResults[winnerResults.length - 1];
      if (recentWinnerResult && recentWinnerResult.opponent) {
        const opponentRating = rankings[recentWinnerResult.opponent]?.rating || 0;
        const expectedResult = rankings[winner].rating > opponentRating ? 1 : 0;
        if (recentWinnerResult.result !== expectedResult) {
          recentResultsMatchExpectations = false;
        }
      }
    }
    
    if (loserResults.length > 0) {
      const recentLoserResult = loserResults[loserResults.length - 1];
      if (recentLoserResult && recentLoserResult.opponent) {
        const opponentRating = rankings[recentLoserResult.opponent]?.rating || 0;
        const expectedResult = rankings[loser].rating > opponentRating ? 1 : 0;
        if (recentLoserResult.result !== expectedResult) {
          recentResultsMatchExpectations = false;
        }
      }
    }
    
    // Calculate adaptation factor based on volatility
    const calculateVolatilityFromChanges = () => {
      if (recentChanges.length < LEARNING_RATE_PARAMS.ADAPTATION_WINDOW) {
        return 1; // Default factor if not enough history
      }
      
      // Calculate average magnitude of recent changes
      const avgChange = recentChanges
        .slice(-LEARNING_RATE_PARAMS.ADAPTATION_WINDOW)
        .reduce((sum, change) => sum + Math.abs(change), 0) / 
        LEARNING_RATE_PARAMS.ADAPTATION_WINDOW;
      
      // Normalize against a typical change of 0.1
      const normalizedVolatility = avgChange / 0.1;
      
      // Log scale for smoother changes
      return Math.max(0.5, Math.min(1.5, Math.log(normalizedVolatility + 1)));
    };
    
    // Return the adaptive learning rate factor
    const volatilityFactor = calculateVolatilityFromChanges();
    
    // Higher consistency should lead to higher learning rate to reinforce patterns
    const consistencyFactor = avgConsistency > 0.7 ? 
      LEARNING_RATE_PARAMS.CONSISTENCY_SCALING : 
      LEARNING_RATE_PARAMS.INCONSISTENCY_SCALING;
    
    // Surprise factor - if result matches expectations, lower rate
    const surpriseFactor = recentResultsMatchExpectations ? 
      LEARNING_RATE_PARAMS.EXPECTED_RESULT_DAMPING : 
      LEARNING_RATE_PARAMS.SURPRISE_BOOST;
    
    return {
      volatilityFactor,
      consistencyFactor,
      surpriseFactor
    };
  }, [rankings, recentChanges]);

  const getDynamicLearningRate = useCallback((winner, loser) => {
    const progress = comparisons / maxComparisons;
    const ratingDiff = Math.abs(rankings[winner].rating - rankings[loser].rating);
    const winnerConfidence = calculateConfidence(winner);
    const loserConfidence = calculateConfidence(loser);
    
    // Get adaptive factors
    const { 
      volatilityFactor, 
      consistencyFactor, 
      surpriseFactor 
    } = calculateAdaptiveLearningRate(winner, loser);
    
    // Start with base learning rate
    let learningRate = LEARNING_RATE_PARAMS.BASE_RATE;
    
    // Adjust based on progress - apply more sophisticated decay
    const progressFactor = progress < 0.3 ? 
      LEARNING_RATE_PARAMS.EARLY_PHASE_BOOST : 
      progress > 0.7 ? 
        LEARNING_RATE_PARAMS.LATE_PHASE_DAMPING : 
        1.0;
    
    learningRate *= (1 - progress * LEARNING_RATE_PARAMS.PROGRESS_DECAY) * progressFactor;
    
    // Adjust for rating difference
    const surpriseValueFactor = 1 / (1 + Math.exp(-5 * (1 - ratingDiff)));
    learningRate *= (1 + surpriseValueFactor);
    
    // Confidence adjustment
    const confidenceFactor = 1 - (winnerConfidence + loserConfidence) / 4;
    learningRate *= confidenceFactor;
    
    // Transitivity violation adjustment
    if (checkTransitivityViolation(winner, loser)) {
      learningRate *= 1.5;
    }
    
    // Apply momentum if available
    const winnerMomentum = movieMomentum[winner] || 0;
    const loserMomentum = movieMomentum[loser] || 0;
    const avgMomentum = (Math.abs(winnerMomentum) + Math.abs(loserMomentum)) / 2;
    learningRate *= (1 + avgMomentum * MOMENTUM_FACTOR);
    
    // Apply adaptive factors from learning rate adaptation
    learningRate *= volatilityFactor * consistencyFactor * surpriseFactor;
    
    // Clamp learning rate
    return Math.max(MIN_LEARNING_RATE, Math.min(MAX_LEARNING_RATE, learningRate));
  }, [
    comparisons, 
    maxComparisons, 
    rankings, 
    checkTransitivityViolation, 
    calculateConfidence, 
    movieMomentum,
    calculateAdaptiveLearningRate
  ]);
  
  const calculateOptimalBatchSize = useCallback(() => {
    const movieCount = movies.length;
    const batchParams = calculateBatchParameters(movieCount);
    const progress = comparisons / maxComparisons;
    
    // Calculate average confidence across all movies
    const avgConfidence = Object.values(rankings).reduce((sum, record) => {
      return sum + (record && record.movie ? calculateConfidence(record.movie.identifier) : 0);
    }, 0) / movieCount;
  
    // Calculate system uncertainty based on movie uncertainty values
    const systemUncertainty = Object.values(rankings).reduce((sum, record) => {
      return sum + (record ? record.ratingUncertainty : 0);
    }, 0) / movieCount;
    
    console.log(`Current batch parameters for ${movieCount} movies:`, {
      early: batchParams.EARLY_STAGE_SIZE,
      mid: batchParams.MID_STAGE_SIZE,
      late: batchParams.LATE_STAGE_SIZE,
      progress: progress.toFixed(2),
      avgConfidence: avgConfidence.toFixed(2),
      systemUncertainty: systemUncertainty.toFixed(2)
    });
    
    // Adaptive batch size based on system state
    // Large uncertainty = smaller batches for more frequent updates
    // Small uncertainty = larger batches for efficiency
    const uncertaintyScaling = systemUncertainty > 0.5 ? 0.8 : 
                             systemUncertainty < 0.2 ? 1.3 : 1.0;
    
    // Determine stage based on progress with uncertainty scaling
    if (progress < batchParams.EARLY_STAGE_THRESHOLD) {
      return Math.max(2, Math.round(batchParams.EARLY_STAGE_SIZE * uncertaintyScaling));
    } else if (progress > batchParams.LATE_STAGE_THRESHOLD) {
      return Math.max(3, Math.round(batchParams.LATE_STAGE_SIZE * uncertaintyScaling));
    } else {
      return avgConfidence < batchParams.MIN_CONFIDENCE_THRESHOLD 
        ? Math.max(2, Math.round(batchParams.EARLY_STAGE_SIZE * uncertaintyScaling))
        : Math.max(3, Math.round(batchParams.MID_STAGE_SIZE * uncertaintyScaling));
    }
  }, [
    movies.length, 
    comparisons, 
    maxComparisons, 
    rankings, 
    calculateConfidence,
    calculateBatchParameters
  ]);
  

  const calculateTransitivityScore = useCallback(() => {
    let transitiveTriads = 0;
    let totalTriads = 0;
  
    // Get sorted movies by rating
    const sortedMovies = Object.values(rankings)
      .sort((a, b) => b.rating - a.rating)
      .map(r => r.movie.identifier);
  
    // Check random sample of triads for transitivity
    const sampleSize = Math.min(1000, Math.floor(sortedMovies.length * (sortedMovies.length - 1) * (sortedMovies.length - 2) / 6));
    
    for (let i = 0; i < sampleSize; i++) {
      const idx1 = Math.floor(Math.random() * sortedMovies.length);
      const idx2 = Math.floor(Math.random() * sortedMovies.length);
      const idx3 = Math.floor(Math.random() * sortedMovies.length);
      
      if (idx1 !== idx2 && idx2 !== idx3 && idx1 !== idx3) {
        totalTriads++;
        const [a, b, c] = [sortedMovies[idx1], sortedMovies[idx2], sortedMovies[idx3]].sort(
          (x, y) => rankings[y].rating - rankings[x].rating
        );
        
        if (rankings[a].rating > rankings[b].rating && 
            rankings[b].rating > rankings[c].rating && 
            rankings[a].rating > rankings[c].rating) {
          transitiveTriads++;
        }
      }
    }
  
    return totalTriads > 0 ? transitiveTriads / totalTriads : 0;
  }, [rankings]);
  
  const calculateRankStability = useCallback(() => {
    if (comparisonHistory.length < EARLY_TERMINATION.STABILITY_WINDOW) {
      return 0;
    }

    const currentRanking = Object.values(rankings)
      .sort((a, b) => b.rating - a.rating)
      .map(r => r.movie.identifier);

    const previousRanking = Object.values(
      comparisonHistory[comparisonHistory.length - EARLY_TERMINATION.STABILITY_WINDOW].rankings
    )
      .sort((a, b) => b.rating - a.rating)
      .map(r => r.movie.identifier);

    let stabilityScore = 0;
    const totalMovies = currentRanking.length;

    for (let i = 0; i < totalMovies; i++) {
      const previousIndex = previousRanking.indexOf(currentRanking[i]);
      const positionWeight = 1 - (i / totalMovies); // Top positions matter more
      const maxPossibleDiff = totalMovies - 1;
      const actualDiff = Math.abs(i - previousIndex);
      const positionStability = 1 - (actualDiff / maxPossibleDiff);
      stabilityScore += positionStability * positionWeight;
    }

    return stabilityScore / totalMovies;
  }, [rankings, comparisonHistory, EARLY_TERMINATION.STABILITY_WINDOW]);
  
  // Detect cycles in the pairwise comparison graph using Tarjan's algorithm for SCC
  const detectPreferenceCycles = useCallback(() => {
    const movieIds = Object.keys(rankings);
    const numMovies = movieIds.length;
    
    // Safety checks
    if (numMovies < 3) return []; // Need at least 3 movies to form a cycle
    
    // Build a directed graph of preferences with adjacency list
    const preferenceGraph = {};
    movieIds.forEach(id => {
      preferenceGraph[id] = [];
    });
    
    // Calculate preference strengths for targeted search
    const preferenceStrengths = new Map();
    
    // Fill the graph with observed preferences
    for (const comparison of comparisonHistory) {
      const { winner, loser } = comparison;
      if (!preferenceGraph[winner]) continue;
      
      // Add the edge if it doesn't exist
      if (!preferenceGraph[winner].includes(loser)) {
        preferenceGraph[winner].push(loser);
        
        // Calculate edge strength (rating difference)
        const ratingDiff = Math.abs(rankings[winner]?.rating - rankings[loser]?.rating || 0);
        const key = `${winner}:${loser}`;
        // Store the inverse of rating difference - smaller differences have higher priority
        preferenceStrengths.set(key, 1 / (ratingDiff + 0.1));
      }
    }
    
    // Tarjan's algorithm to find Strongly Connected Components (SCCs)
    // SCCs are groups of nodes where each node is reachable from every other node
    // Any SCC with more than one node contains at least one cycle
    const findStronglyConnectedComponents = () => {
      let index = 0;
      const indices = new Map();
      const lowLinks = new Map();
      const onStack = new Set();
      const stack = [];
      const components = [];
      
      // Helper function for Tarjan's algorithm
      const strongConnect = (node) => {
        // Set the depth index for node
        indices.set(node, index);
        lowLinks.set(node, index);
        index++;
        stack.push(node);
        onStack.add(node);
        
        // Consider successors
        for (const successor of preferenceGraph[node] || []) {
          if (!indices.has(successor)) {
            // Successor has not yet been visited; recurse on it
            strongConnect(successor);
            lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(successor)));
          } else if (onStack.has(successor)) {
            // Successor is on stack and hence in the current SCC
            lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(successor)));
          }
        }
        
        // If node is a root node, pop the stack and generate an SCC
        if (lowLinks.get(node) === indices.get(node)) {
          const component = [];
          let w;
          do {
            w = stack.pop();
            onStack.delete(w);
            component.push(w);
          } while (w !== node);
          
          // Only store components with more than one node (these contain cycles)
          if (component.length > 1) {
            components.push(component);
          }
        }
      };
      
      // Apply targeted search based on rating inconsistencies
      // First sort nodes by their potential for cycles
      const potentialProblems = movieIds.filter(id => {
        if (!rankings[id]) return false;
        
        // Find nodes that have preference inconsistencies
        // A node has inconsistency if it's rated lower than a movie it beat
        // or higher than a movie that beat it
        const hasInconsistency = comparisonHistory.some(comp => 
          (comp.winner === id && rankings[id].rating < rankings[comp.loser]?.rating) ||
          (comp.loser === id && rankings[id].rating > rankings[comp.winner]?.rating)
        );
        
        return hasInconsistency;
      });
      
      // Process problem nodes first, then random sample of remaining nodes
      const priorityNodes = [...potentialProblems];
      const remainingNodes = movieIds.filter(id => !priorityNodes.includes(id))
                                      .sort(() => Math.random() - 0.5)
                                      .slice(0, Math.min(50, numMovies));
      
      const nodesToProcess = [...priorityNodes, ...remainingNodes];
      
      // Run the algorithm on each node that hasn't been visited
      for (const node of nodesToProcess) {
        if (!indices.has(node)) {
          strongConnect(node);
        }
      }
      
      return components;
    };
    
    // Find strongly connected components which will contain all cycles
    const stronglyConnectedComponents = findStronglyConnectedComponents();
    
    // Convert SCCs to cycles by finding cyclic paths within each component
    const cycles = [];
    
    for (const component of stronglyConnectedComponents) {
      // For larger components, we need a more efficient approach
      if (component.length > GLOBAL_OPTIMIZATION.CYCLES_MAX_LENGTH + 3) {
        // For large components, use Johnson's algorithm for finding elementary cycles
        // We'll implement a simplified version targeting highest priority cycles
        
        // First, identify high-conflict edges (smallest rating differences)
        // These are edges where the actual ratings contradict the preference
        const highConflictEdges = [];
        
        for (const node of component) {
          for (const succ of preferenceGraph[node] || []) {
            if (!component.includes(succ)) continue;
            
            // Check if this edge represents a conflict (ratings in opposite direction of preference)
            const ratingConflict = rankings[node] && rankings[succ] && 
                                  rankings[node].rating <= rankings[succ].rating;
            
            if (ratingConflict) {
              // This is a high priority edge - ratings and preferences disagree
              highConflictEdges.push({
                from: node,
                to: succ,
                // Higher conflict score for bigger rating contradictions
                conflictScore: rankings[succ].rating - rankings[node].rating
              });
            } else {
              // Include all edges but with lower priority
              highConflictEdges.push({
                from: node,
                to: succ,
                conflictScore: 0
              });
            }
          }
        }
        
        // Sort edges by conflict (descending)
        highConflictEdges.sort((a, b) => b.conflictScore - a.conflictScore);
        
        // Keep only the most conflicting edges to simplify the component
        // For large components, focus on the highest conflict subset
        const maxEdges = Math.min(component.length * 2, 50);
        const topConflictEdges = highConflictEdges.slice(0, maxEdges);
        
        // Build a subgraph with just these critical edges
        const criticalSubgraph = {};
        component.forEach(node => {
          criticalSubgraph[node] = [];
        });
        
        topConflictEdges.forEach(edge => {
          if (!criticalSubgraph[edge.from].includes(edge.to)) {
            criticalSubgraph[edge.from].push(edge.to);
          }
        });
        
        // Find cycles in this critical subgraph
        // Use a fast cycle detection algorithm
        const findCyclesInCriticalSubgraph = () => {
          // Track best cycles found so far
          const bestCycles = [];
          const maxCycles = 20; // Limit to most significant cycles
          
          // Find cycles starting from each high-conflict node
          const startNodes = [...new Set(topConflictEdges
            .filter(e => e.conflictScore > 0) // Start from nodes with conflicts
            .map(e => e.from))];
            
          // If we don't have any clear conflicts, sample from the component
          const nodesToCheck = startNodes.length > 0 ? 
            startNodes : 
            component.sort(() => Math.random() - 0.5).slice(0, Math.min(5, component.length));
          
          for (const startNode of nodesToCheck) {
            const visited = new Set();
            const path = [];
            
            const dfs = (node, depth = 0) => {
              if (depth >= GLOBAL_OPTIMIZATION.CYCLES_MAX_LENGTH) return;
              if (bestCycles.length >= maxCycles) return;
              
              visited.add(node);
              path.push(node);
              
              for (const neighbor of criticalSubgraph[node] || []) {
                if (neighbor === startNode && depth > 1) {
                  // We found a cycle
                  const cycle = [...path];
                  bestCycles.push(cycle);
                  
                  if (bestCycles.length >= maxCycles) break;
                } else if (!visited.has(neighbor)) {
                  dfs(neighbor, depth + 1);
                }
              }
              
              path.pop();
              visited.delete(node);
            };
            
            dfs(startNode, 0);
            
            if (bestCycles.length >= maxCycles) break;
          }
          
          return bestCycles;
        };
        
        // Get the most significant cycles from this component
        const significantCycles = findCyclesInCriticalSubgraph();
        cycles.push(...significantCycles);
        
        // Limit total number of cycles
        if (cycles.length >= GLOBAL_OPTIMIZATION.CYCLES_DETECTION_SAMPLE) break;
      } else {
        // For smaller components, find all elementary cycles
        const findElementaryCycles = () => {
          const elementaryCycles = [];
          const visited = new Map(); // Map node to bool
          const stack = [];
          
          const findCycles = (start, curr, depth) => {
            if (depth > GLOBAL_OPTIMIZATION.CYCLES_MAX_LENGTH) return;
            
            // Mark current as visited
            visited.set(curr, true);
            stack.push(curr);
            
            for (const neighbor of preferenceGraph[curr] || []) {
              // If we found start, we have a cycle
              if (neighbor === start && depth >= 2) {
                elementaryCycles.push([...stack]);
              } 
              // If not visited, recurse
              else if (!visited.get(neighbor) && component.includes(neighbor)) {
                findCycles(start, neighbor, depth + 1);
              }
            }
            
            // Backtrack
            stack.pop();
            visited.set(curr, false);
          };
          
          // Try from each node in component
          for (const node of component) {
            component.forEach(n => visited.set(n, false));
            stack.length = 0;
            findCycles(node, node, 0);
            
            // Limit number of cycles per component
            if (elementaryCycles.length > 20) break;
          }
          
          return elementaryCycles;
        };
        
        cycles.push(...findElementaryCycles());
      }
      
      // Limit the total number of cycles we process
      if (cycles.length > GLOBAL_OPTIMIZATION.CYCLES_DETECTION_SAMPLE) break;
    }
    
    // Sort cycles by priority based on conflicts and rating violations
    cycles.sort((a, b) => {
      const calculateConflictScore = (cycle) => {
        let score = 0;
        let ratingViolations = 0;
        
        for (let i = 0; i < cycle.length; i++) {
          const node = cycle[i];
          const nextNode = cycle[(i + 1) % cycle.length];
          
          if (rankings[node] && rankings[nextNode]) {
            // Check if this edge represents a conflict with current ratings 
            // (preference direction disagrees with rating order)
            if (rankings[node].rating <= rankings[nextNode].rating) {
              // This is a rating violation - preference says node > nextNode 
              // but ratings say node <= nextNode
              ratingViolations++;
              
              // Higher score for larger contradictions 
              score += (rankings[nextNode].rating - rankings[node].rating + 0.1) * 10;
            } else {
              // Still count non-violations but with lower weight
              score += 1 / (rankings[node].rating - rankings[nextNode].rating + 0.5);
            }
          }
        }
        
        // Heavily weight cycles with more rating violations
        return (ratingViolations * 100) + (score / cycle.length);
      };
      
      return calculateConflictScore(b) - calculateConflictScore(a);
    });
    
    // Return limited number of highest priority cycles
    return cycles.slice(0, GLOBAL_OPTIMIZATION.CYCLES_DETECTION_SAMPLE);
  }, [rankings, comparisonHistory]);
  
  // Find and fix transitivity violations
  const findTransitivityViolations = useCallback(() => {
    const allMovies = Object.values(rankings);
    const cycles = detectPreferenceCycles();
    const violations = [];
    
    // Additional checks for transitivity violations outside cycles
    // Sample random triads and check if they violate transitivity
    const sample = Math.min(GLOBAL_OPTIMIZATION.CYCLES_DETECTION_SAMPLE, allMovies.length * (allMovies.length - 1) * (allMovies.length - 2) / 6);
    
    for (let i = 0; i < sample; i++) {
      // Randomly select 3 different movies
      const indices = new Set();
      while (indices.size < 3) {
        indices.add(Math.floor(Math.random() * allMovies.length));
      }
      
      const [a, b, c] = [...indices].map(idx => allMovies[idx]);
      const idA = a.movie.identifier;
      const idB = b.movie.identifier;
      const idC = c.movie.identifier;
      
      // Check if ratings A > B > C but preference goes against transitivity
      if (a.rating > b.rating && b.rating > c.rating) {
        // Check history if there's evidence against this transitivity
        const violatesAC = comparisonHistory.some(comp => 
          comp.winner === idC && comp.loser === idA);
        const violatesAB = comparisonHistory.some(comp => 
          comp.winner === idB && comp.loser === idA);
        const violatesBC = comparisonHistory.some(comp => 
          comp.winner === idC && comp.loser === idB);
          
        if (violatesAC || (violatesAB && violatesBC)) {
          violations.push({ type: 'triad', movies: [idA, idB, idC] });
        }
      }
    }
    
    // Convert cycles to transitive violations
    for (const cycle of cycles) {
      violations.push({ type: 'cycle', movies: cycle });
    }
    
    return violations;
  }, [rankings, comparisonHistory, detectPreferenceCycles]);
  
  // Build preference graph from direct comparisons
  const buildPreferenceGraph = useCallback(() => {
    const preferenceGraph = {};
    
    // Initialize graph with all movie IDs
    Object.keys(rankings).forEach(id => {
      preferenceGraph[id] = {
        outgoing: new Set(), // Movies that this movie was preferred over
        incoming: new Set()  // Movies that were preferred over this movie
      };
    });
    
    // Fill the graph with all direct comparison results
    for (const comparison of comparisonHistory) {
      const { winner, loser } = comparison;
      if (!preferenceGraph[winner] || !preferenceGraph[loser]) continue;
      
      preferenceGraph[winner].outgoing.add(loser);
      preferenceGraph[loser].incoming.add(winner);
    }
    
    return preferenceGraph;
  }, [rankings, comparisonHistory]);
  
  // Check for direct comparison constraint violations in current rankings
  const findDirectComparisonViolations = useCallback(() => {
    const preferenceGraph = buildPreferenceGraph();
    const violations = [];
    
    // Check each pair of movies for rating violations against direct comparisons
    for (const movieId in preferenceGraph) {
      // Check outgoing edges (movies this one should outrank)
      for (const loserId of preferenceGraph[movieId].outgoing) {
        // Violation if the rating doesn't match the direct comparison result
        if (rankings[movieId].rating <= rankings[loserId].rating) {
          violations.push({
            type: 'direct',
            winner: movieId,
            loser: loserId,
            ratingDiff: rankings[loserId].rating - rankings[movieId].rating
          });
        }
      }
    }
    
    return violations;
  }, [rankings, buildPreferenceGraph]);

  // Perform global optimization to fix inconsistencies
  const performGlobalOptimization = useCallback(() => {
    // Skip if too early or currently processing
    if (comparisons < GLOBAL_OPTIMIZATION.MIN_COMPARISONS_REQUIRED || 
        globalRecalculationRef.current ||
        comparisons - globalOptimizationStats.lastOptimizationComparison < GLOBAL_OPTIMIZATION.RECALCULATION_INTERVAL) {
      return;
    }
    
    console.log(`Starting global optimization at comparison #${comparisons}`);
    globalRecalculationRef.current = true;
    
    try {
      // Find both transitivity violations and direct comparison violations
      const transitivityViolations = findTransitivityViolations();
      const directViolations = findDirectComparisonViolations();
      
      const allViolations = [...transitivityViolations, ...directViolations];
      
      let correctionsMade = 0;
      let transitivityFixed = 0;
      let directComparisonFixed = 0;
      
      // Create a working copy of rankings
      const updatedRankings = { ...rankings };
      
      if (allViolations.length > 0) {
        console.log(`Found ${transitivityViolations.length} transitivity violations and ${directViolations.length} direct comparison violations`);
        
        // Process direct comparison violations first (they have priority)
        directViolations.forEach(violation => {
          const { winner, loser, ratingDiff } = violation;
          
          // Calculate target adjustment to fix the violation with some margin
          const targetDiff = ratingDiff + 0.1; // Ensure clear separation
          
          // Apply stronger correction for direct comparison violations
          const DIRECT_CORRECTION_FACTOR = 0.8; // 80% adjustment toward target
          const adjustment = targetDiff * DIRECT_CORRECTION_FACTOR;
          
          // Apply more aggressive adjustment to fix direct comparisons
          // Split the adjustment between both movies
          updatedRankings[winner].rating += adjustment * 0.6; // 60% boost to winner
          updatedRankings[loser].rating -= adjustment * 0.4;  // 40% reduction to loser
          
          correctionsMade++;
          directComparisonFixed++;
        });
        
        // Then process transitivity violations
        transitivityViolations.forEach(violation => {
          // Process each violation
          const { type, movies } = violation;
          
          if (type === 'cycle') {
            // For a cycle, make incremental adjustments to all movies in the cycle
            const cycleLength = movies.length;
            
            // Calculate average rating in the cycle
            const avgRating = movies.reduce((sum, id) => sum + updatedRankings[id].rating, 0) / cycleLength;
            
            // Apply incremental adjustments to move ratings toward consistency
            movies.forEach((id, i) => {
              const nextId = movies[(i + 1) % cycleLength]; // next movie in cycle
              
              if (updatedRankings[id].rating <= updatedRankings[nextId].rating) {
                // If current rating violates the preference, adjust both
                const diff = (updatedRankings[nextId].rating - updatedRankings[id].rating) + 0.05;
                const adjustment = diff * GLOBAL_OPTIMIZATION.INCREMENTAL_ADJUSTMENT;
                const maxAdjustment = GLOBAL_OPTIMIZATION.MAX_CORRECTION_STRENGTH;
                
                // Adjust toward average while fixing inconsistency
                updatedRankings[id].rating += Math.min(adjustment, maxAdjustment);
                updatedRankings[nextId].rating -= Math.min(adjustment, maxAdjustment);
                
                correctionsMade++;
              }
            });
            
            transitivityFixed++;
          } else if (type === 'triad') {
            // For a triad violation, adjust the most uncertain movie
            const [idA, idB, idC] = movies;
            
            // Find most uncertain movie in the triad
            const uncertainties = [
              updatedRankings[idA].ratingUncertainty,
              updatedRankings[idB].ratingUncertainty,
              updatedRankings[idC].ratingUncertainty
            ];
            
            const maxUncertaintyIndex = uncertainties.indexOf(Math.max(...uncertainties));
            const adjustId = movies[maxUncertaintyIndex];
            
            // Calculate target rating that preserves transitivity
            let targetRating;
            if (maxUncertaintyIndex === 0) {
              // A should be greater than B
              targetRating = updatedRankings[idB].rating + 0.1;
            } else if (maxUncertaintyIndex === 1) {
              // B should be between A and C
              targetRating = (updatedRankings[idA].rating + updatedRankings[idC].rating) / 2;
            } else {
              // C should be less than B
              targetRating = updatedRankings[idB].rating - 0.1;
            }
            
            // Apply incremental adjustment
            const current = updatedRankings[adjustId].rating;
            const adjustment = (targetRating - current) * GLOBAL_OPTIMIZATION.INCREMENTAL_ADJUSTMENT;
            const maxAdjustment = GLOBAL_OPTIMIZATION.MAX_CORRECTION_STRENGTH;
            
            // Apply capped adjustment
            updatedRankings[adjustId].rating += Math.min(Math.abs(adjustment), maxAdjustment) * Math.sign(adjustment);
            
            correctionsMade++;
            transitivityFixed++;
          }
        });
      }
      
      // Re-normalize ratings to maintain scale
      const allRatings = Object.values(updatedRankings).map(r => r.rating);
      const meanRating = allRatings.reduce((sum, r) => sum + r, 0) / allRatings.length;
      const stdDev = Math.sqrt(allRatings.reduce((sum, r) => sum + Math.pow(r - meanRating, 2), 0) / allRatings.length);
      
      if (stdDev > 0) {
        Object.keys(updatedRankings).forEach(id => {
          updatedRankings[id].rating = (updatedRankings[id].rating - meanRating) / stdDev;
        });
      }
      
      // Verify that direct comparison constraints are still maintained after normalization
      const postNormViolations = [];
      const preferenceGraph = buildPreferenceGraph();
      
      for (const movieId in preferenceGraph) {
        for (const loserId of preferenceGraph[movieId].outgoing) {
          if (updatedRankings[movieId].rating <= updatedRankings[loserId].rating) {
            // Small final adjustment if normalization reintroduced violations
            const adjustment = 0.05;
            updatedRankings[movieId].rating += adjustment;
            updatedRankings[loserId].rating -= adjustment;
            postNormViolations.push({ winner: movieId, loser: loserId });
          }
        }
      }
      
      if (postNormViolations.length > 0) {
        console.log(`Fixed ${postNormViolations.length} violations introduced by normalization`);
        correctionsMade += postNormViolations.length;
      }
      
      // Update rankings if corrections were made
      if (correctionsMade > 0) {
        console.log(`Applied ${correctionsMade} corrections (${directComparisonFixed} direct comparison, ${transitivityFixed} transitivity)`);
        
        // Track which movies were changed for selective cache invalidation
        const changedMovieIds = new Set();
        
        // Find all movies whose ratings changed
        Object.keys(updatedRankings).forEach(movieId => {
          if (rankings[movieId].rating !== updatedRankings[movieId].rating) {
            changedMovieIds.add(movieId);
          }
        });
        
        // Selectively invalidate caches for changed movies before updating rankings
        changedMovieIds.forEach(movieId => {
          // Invalidate confidence cache
          confidenceCache.current.delete(movieId);
          
          // Selectively invalidate transitivity cache
          invalidateTransitivityCache(movieId);
          
          // Clear enhanced confidence cache entries
          Array.from(enhancedConfidenceCache.keys()).forEach(key => {
            if (key.includes(movieId)) {
              enhancedConfidenceCache.delete(key);
            }
          });
        });
        
        console.log(`Selectively invalidated caches for ${changedMovieIds.size} changed movies during optimization`);
        
        // Now update the rankings
        setRankings(updatedRankings);
        
        // Update statistics
        setGlobalOptimizationStats(prev => ({
          lastOptimizationComparison: comparisons,
          totalCorrections: prev.totalCorrections + correctionsMade,
          transitivityViolationsFixed: prev.transitivityViolationsFixed + transitivityFixed,
          inconsistencyCorrectionsMade: prev.inconsistencyCorrectionsMade + correctionsMade
        }));
      } else {
        console.log('No corrections needed during global optimization');
        setGlobalOptimizationStats(prev => ({
          ...prev,
          lastOptimizationComparison: comparisons
        }));
      }
    } catch (err) {
      console.error('Error in global optimization:', err);
    } finally {
      globalRecalculationRef.current = false;
    }
  }, [rankings, comparisons, comparisonHistory, findTransitivityViolations, findDirectComparisonViolations, buildPreferenceGraph, globalOptimizationStats, invalidateTransitivityCache]);

  const checkRankingStability = useCallback(() => {
    const progress = comparisons / maxComparisons;
    const adaptiveThresholds = calculateAdaptiveThresholds(movies.length, progress);
    
    // Don't check before minimum progress
    if (comparisons / maxComparisons < EARLY_TERMINATION.MIN_PROGRESS) {
      return false;
    }
  
    // Check minimum comparisons per movie
    const insufficientComparisons = Object.values(rankings).some(
      record => record.comparisons < EARLY_TERMINATION.MIN_COMPARISONS_PER_MOVIE
    );
    if (insufficientComparisons) {
      return false;
    }
  
    // Calculate average confidence with adaptive threshold
    const avgConfidence = Object.values(rankings).reduce(
      (sum, record) => sum + calculateConfidence(record.movie.identifier),
      0
    ) / movies.length;
    if (avgConfidence < Math.max(adaptiveThresholds.confidence, EARLY_TERMINATION.MIN_CONFIDENCE_THRESHOLD)) {
      return false;
    }
  
    // Check recent stability with adaptive threshold
    if (recentChanges.length < EARLY_TERMINATION.STABILITY_WINDOW) {
      return false;
    }
    const recentInstability = recentChanges
      .slice(-EARLY_TERMINATION.STABILITY_WINDOW)
      .some(change => Math.abs(change) > Math.min(adaptiveThresholds.rankChange, EARLY_TERMINATION.STABILITY_THRESHOLD));
    if (recentInstability) {
      return false;
    }
  
    // Check transitivity with adaptive threshold
    const transitivityScore = calculateTransitivityScore();
    if (transitivityScore < Math.max(adaptiveThresholds.transitivity, EARLY_TERMINATION.MIN_TRANSITIVITY_SCORE)) {
      return false;
    }
  
    // Check relative rank stability with adaptive threshold
    const rankStability = calculateRankStability();
    if (rankStability < Math.max(adaptiveThresholds.stability, EARLY_TERMINATION.RELATIVE_RANK_STABILITY)) {
      return false;
    }
  
    console.log('Early termination conditions met:', {
      progress: (comparisons / maxComparisons).toFixed(2),
      avgConfidence: avgConfidence.toFixed(2),
      transitivityScore: transitivityScore.toFixed(2),
      rankStability: rankStability.toFixed(2),
      adaptiveThresholds: {
        confidence: adaptiveThresholds.confidence.toFixed(2),
        stability: adaptiveThresholds.stability.toFixed(2),
        transitivity: adaptiveThresholds.transitivity.toFixed(2),
        rankChange: adaptiveThresholds.rankChange.toFixed(3)
      }
    });
  
    return true;
  }, [
    movies.length,
    comparisons,
    maxComparisons,
    rankings,
    recentChanges,
    calculateConfidence,
    calculateTransitivityScore,
    calculateRankStability,
    EARLY_TERMINATION.MIN_PROGRESS,
    EARLY_TERMINATION.MIN_COMPARISONS_PER_MOVIE,
    EARLY_TERMINATION.MIN_CONFIDENCE_THRESHOLD,
    EARLY_TERMINATION.STABILITY_WINDOW,
    EARLY_TERMINATION.STABILITY_THRESHOLD,
    EARLY_TERMINATION.MIN_TRANSITIVITY_SCORE,
    EARLY_TERMINATION.RELATIVE_RANK_STABILITY
  ]);

const checkConvergence = useCallback(() => {
  if (checkRankingStability()) {
    console.log("Rankings have converged with high confidence - finishing early");
    finishRanking();
  }
}, [checkRankingStability, finishRanking]);

const processBatchUpdate = useCallback((updates) => {
  // Sort updates by uncertainty priority - process high uncertainty movies first
  const sortedUpdates = [...updates].sort((a, b) => {
    const aUncertainty = Math.max(
      rankings[a.winner]?.ratingUncertainty || 0,
      rankings[a.loser]?.ratingUncertainty || 0
    );
    const bUncertainty = Math.max(
      rankings[b.winner]?.ratingUncertainty || 0,
      rankings[b.loser]?.ratingUncertainty || 0
    );
    return bUncertainty - aUncertainty; // Higher uncertainty first
  });
  
  // Detect redundant updates - skip processing duplicates of the same movie pairs
  const uniqueUpdates = [];
  const processedPairs = new Set();
  
  sortedUpdates.forEach(update => {
    // Create a unique key for the movie pair (order doesn't matter)
    const pairKey = [update.winner, update.loser].sort().join('_');
    
    // Only process if this pair hasn't been processed yet
    if (!processedPairs.has(pairKey)) {
      uniqueUpdates.push(update);
      processedPairs.add(pairKey);
    }
  });
  
  console.log(`Processing batch: ${updates.length} total updates, ${uniqueUpdates.length} after deduplication`);
  
  // For multiple updates to the same movie, batch them for efficiency
  const movieUpdates = new Map(); // Map of movieId -> array of updates
  
  uniqueUpdates.forEach(update => {
    // Add to winner's updates
    if (!movieUpdates.has(update.winner)) {
      movieUpdates.set(update.winner, { wins: [], losses: [] });
    }
    movieUpdates.get(update.winner).wins.push(update.loser);
    
    // Add to loser's updates
    if (!movieUpdates.has(update.loser)) {
      movieUpdates.set(update.loser, { wins: [], losses: [] });
    }
    movieUpdates.get(update.loser).losses.push(update.winner);
  });
  
  // Process the updates with dependency tracking for efficient cache management
  setRankings(prevRankings => {
    const newRankings = { ...prevRankings };
    const newMomentum = { ...movieMomentum };
    const updatedMovies = new Set(); // Track which movies are updated for selective cache invalidation
    let totalRatingChange = 0;
    
    // Process each movie's cumulative updates
    movieUpdates.forEach((updates, movieId) => {
      // Process wins
      updates.wins.forEach(loser => {
        const learningRate = getDynamicLearningRate(movieId, loser);
        
        if (updates.wins.length === 1) {
          // Only update UI learning rate for single comparisons
          setCurrentLearningRate(learningRate);
        }
        
        // Get the adaptive factors for fine-tuning the updates
        const { 
          volatilityFactor, 
          consistencyFactor 
        } = calculateAdaptiveLearningRate(movieId, loser);
        
        // Traditional ELO-style rating update
        const winnerStrength = Math.exp(prevRankings[movieId].rating);
        const loserStrength = Math.exp(prevRankings[loser].rating);
        
        const expectedProbWinner = winnerStrength / (winnerStrength + loserStrength);
        const ratingChange = learningRate * (1 - expectedProbWinner);
        totalRatingChange += ratingChange;
        
        // Update momentum with adaptive scaling
        const momentumScaling = volatilityFactor * consistencyFactor;
        newMomentum[movieId] = (newMomentum[movieId] || 0) * MOMENTUM_FACTOR + ratingChange * momentumScaling;
        
        // Bayesian rating update
        // Get current uncertainty values
        const winnerUncertainty = prevRankings[movieId].ratingUncertainty;
        
        // Calculate observation strength based on group context and consistency
        const isGroupComparison = prevRankings[movieId].groupSelections.appearances > 0 || 
                                prevRankings[loser].groupSelections.appearances > 0;
        
        // Adjust observation strength based on group context and adaptive factors
        const baseObservationStrength = isGroupComparison ? 0.8 : 1.0;
        const adaptiveObservationStrength = baseObservationStrength * volatilityFactor;
        
        // Adaptively adjust uncertainty reduction rate based on progress and consistency
        const progress = comparisons / maxComparisons;
        const uncertaintyReductionRate = 0.1 * (
          progress < 0.3 ? 0.8 : // Slower reduction early on
          progress > 0.7 ? 1.2 : // Faster reduction late in the process
          1.0
        ) * consistencyFactor;  // More consistent results lead to faster reduction
        
        // Calculate new uncertainties with adaptive reduction
        const newWinnerUncertainty = winnerUncertainty * (1 - uncertaintyReductionRate * adaptiveObservationStrength);
        
        // Calculate Bayesian adjusted rating changes with adaptive scaling
        const bayesianWinnerChange = ratingChange * (1 + winnerUncertainty) * adaptiveObservationStrength;
        
        // Only initialize once per movie in the batch
        if (!updatedMovies.has(movieId)) {
          // Set initial update for this movie
          newRankings[movieId] = {
            ...prevRankings[movieId],
            // Start with base rating
            rating: prevRankings[movieId].rating,
            ratingMean: prevRankings[movieId].ratingMean,
            ratingUncertainty: prevRankings[movieId].ratingUncertainty,
            wins: prevRankings[movieId].wins,
            comparisons: prevRankings[movieId].comparisons,
            recentResults: [...prevRankings[movieId].recentResults]
          };
          updatedMovies.add(movieId);
        }
        
        // Incrementally update the movie's rating and stats
        newRankings[movieId] = {
          ...newRankings[movieId],
          // Accumulate rating changes
          rating: newRankings[movieId].rating + ratingChange,
          ratingMean: newRankings[movieId].ratingMean + bayesianWinnerChange,
          ratingUncertainty: Math.max(0.1, newWinnerUncertainty),
          wins: newRankings[movieId].wins + 1,
          comparisons: newRankings[movieId].comparisons + 1,
          recentResults: [...newRankings[movieId].recentResults.slice(-9), {
            opponent: loser,
            result: 1,
            ratingDiff: Math.abs(prevRankings[movieId].rating - prevRankings[loser].rating),
            learningRate: learningRate
          }]
        };
      });
      
      // Apply momentum after all individual updates
      if (updates.wins.length > 0 || updates.losses.length > 0) {
        // Apply momentum as a single adjustment at the end
        newRankings[movieId].rating += newMomentum[movieId] * MOMENTUM_FACTOR;
      }
    });
    
    // Make a second pass for losses to ensure we have the most updated winner ratings
    movieUpdates.forEach((updates, movieId) => {
      // Process losses
      updates.losses.forEach(winner => {
        const learningRate = getDynamicLearningRate(winner, movieId);
        
        // Get the adaptive factors for fine-tuning the updates
        const { 
          volatilityFactor, 
          consistencyFactor 
        } = calculateAdaptiveLearningRate(winner, movieId);
        
        // Use already calculated rating from winner update if available
        // Otherwise do a new calculation
        let ratingChange;
        
        // If winner was already processed, use consistent rating change
        if (movieUpdates.has(winner) && movieUpdates.get(winner).wins.includes(movieId)) {
          // Find matching win that corresponds to this loss
          const winnerUpdates = uniqueUpdates.find(u => 
            u.winner === winner && u.loser === movieId);
          
          if (winnerUpdates) {
            // Use the same change amount from the winner's update for consistency
            const winnerStrength = Math.exp(prevRankings[winner].rating);
            const loserStrength = Math.exp(prevRankings[movieId].rating);
            const expectedProbWinner = winnerStrength / (winnerStrength + loserStrength);
            ratingChange = learningRate * (1 - expectedProbWinner);
          } else {
            // Calculate new if not found (shouldn't typically happen)
            const winnerStrength = Math.exp(prevRankings[winner].rating);
            const loserStrength = Math.exp(prevRankings[movieId].rating);
            const expectedProbWinner = winnerStrength / (winnerStrength + loserStrength);
            ratingChange = learningRate * (1 - expectedProbWinner);
          }
        } else {
          // Calculate new if winner wasn't in the batch
          const winnerStrength = Math.exp(prevRankings[winner].rating);
          const loserStrength = Math.exp(prevRankings[movieId].rating);
          const expectedProbWinner = winnerStrength / (winnerStrength + loserStrength);
          ratingChange = learningRate * (1 - expectedProbWinner);
        }
        
        // Update momentum with adaptive scaling
        const momentumScaling = volatilityFactor * consistencyFactor;
        newMomentum[movieId] = (newMomentum[movieId] || 0) * MOMENTUM_FACTOR - ratingChange * momentumScaling;
        
        // Bayesian rating update
        // Get current uncertainty values
        const loserUncertainty = prevRankings[movieId].ratingUncertainty;
        
        // Calculate observation strength based on group context and consistency
        const isGroupComparison = prevRankings[winner].groupSelections.appearances > 0 || 
                                prevRankings[movieId].groupSelections.appearances > 0;
        
        // Adjust observation strength based on group context and adaptive factors
        const baseObservationStrength = isGroupComparison ? 0.8 : 1.0;
        const adaptiveObservationStrength = baseObservationStrength * volatilityFactor;
        
        // Adaptively adjust uncertainty reduction rate based on progress and consistency
        const progress = comparisons / maxComparisons;
        const uncertaintyReductionRate = 0.1 * (
          progress < 0.3 ? 0.8 : // Slower reduction early on
          progress > 0.7 ? 1.2 : // Faster reduction late in the process
          1.0
        ) * consistencyFactor;  // More consistent results lead to faster reduction
        
        // Calculate new uncertainties with adaptive reduction
        const newLoserUncertainty = loserUncertainty * (1 - uncertaintyReductionRate * adaptiveObservationStrength);
        
        // Calculate Bayesian adjusted rating changes with adaptive scaling
        const bayesianLoserChange = ratingChange * (1 + loserUncertainty) * adaptiveObservationStrength;
        
        // Only initialize once per movie in the batch
        if (!updatedMovies.has(movieId)) {
          // Set initial update for this movie
          newRankings[movieId] = {
            ...prevRankings[movieId],
            // Start with base rating
            rating: prevRankings[movieId].rating,
            ratingMean: prevRankings[movieId].ratingMean,
            ratingUncertainty: prevRankings[movieId].ratingUncertainty,
            losses: prevRankings[movieId].losses,
            comparisons: prevRankings[movieId].comparisons,
            recentResults: [...prevRankings[movieId].recentResults]
          };
          updatedMovies.add(movieId);
        }
        
        // Incrementally update the movie's rating and stats
        newRankings[movieId] = {
          ...newRankings[movieId],
          // Accumulate rating changes
          rating: newRankings[movieId].rating - ratingChange,
          ratingMean: newRankings[movieId].ratingMean - bayesianLoserChange,
          ratingUncertainty: Math.max(0.1, newLoserUncertainty),
          losses: (newRankings[movieId].losses || 0) + 1,
          comparisons: newRankings[movieId].comparisons + 1,
          recentResults: [...newRankings[movieId].recentResults.slice(-9), {
            opponent: winner,
            result: 0,
            ratingDiff: Math.abs(prevRankings[winner].rating - prevRankings[movieId].rating),
            learningRate: learningRate
          }]
        };
      });
      
      // Apply momentum after all individual updates
      if (updates.losses.length > 0) {
        // Apply momentum as a single adjustment at the end
        newRankings[movieId].rating += newMomentum[movieId] * MOMENTUM_FACTOR;
      }
    });
    
    // Selectively invalidate cache for updated movies
    updatedMovies.forEach(movieId => {
      // Invalidate confidence cache
      confidenceCache.current.delete(movieId);
      
      // Selectively invalidate transitivity cache
      invalidateTransitivityCache(movieId);
      
      // Clear relevant enhanced confidence cache entries
      Array.from(enhancedConfidenceCache.keys()).forEach(key => {
        if (key.includes(movieId)) {
          enhancedConfidenceCache.delete(key);
        }
      });
    });
    
    // Log cache statistics occasionally
    if (Math.random() < 0.1) {
      console.log('Transitivity cache stats:', transitivityCache.getStats());
      console.log(`Batch update: Updated ${updatedMovies.size} movies from ${uniqueUpdates.length} comparisons`);
    }
    
    // Add average rating change to recent changes for convergence tracking
    if (uniqueUpdates.length > 0) {
      const avgRatingChange = totalRatingChange / uniqueUpdates.length;
      setRecentChanges(prev => [...prev.slice(-CONVERGENCE_CHECK_WINDOW + 1), avgRatingChange]);
    }
    
    setMovieMomentum(newMomentum);
    return newRankings;
  });
  
  checkConvergence();
}, [
  rankings,
  getDynamicLearningRate, 
  calculateAdaptiveLearningRate,
  checkConvergence, 
  movieMomentum,
  comparisons,
  maxComparisons,
  invalidateTransitivityCache
]);

// Queue system for pending comparison operations
// This helps prioritize high-impact and high-uncertainty comparisons
class PriorityUpdateQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }
  
  // Add update to the queue with priority metadata
  enqueue(update, priority, uncertainty) {
    this.queue.push({
      ...update,
      priority: priority || 0,
      uncertainty: uncertainty || 0,
      timestamp: Date.now()
    });
    
    // Sort queue by priority (high to low), then uncertainty (high to low), then timestamp (older first)
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      if (a.uncertainty !== b.uncertainty) return b.uncertainty - a.uncertainty;
      return a.timestamp - b.timestamp; // Process older requests first when other factors are equal
    });
  }
  
  // Get the next batch of updates to process
  dequeue(batchSize) {
    if (this.queue.length === 0) return [];
    return this.queue.splice(0, batchSize);
  }
  
  // Check if the queue is empty
  isEmpty() {
    return this.queue.length === 0;
  }
  
  // Get the current queue size
  size() {
    return this.queue.length;
  }
  
  // Get queue statistics
  getStats() {
    if (this.isEmpty()) return { size: 0, avgPriority: 0, avgUncertainty: 0 };
    
    const avgPriority = this.queue.reduce((sum, item) => sum + item.priority, 0) / this.queue.length;
    const avgUncertainty = this.queue.reduce((sum, item) => sum + item.uncertainty, 0) / this.queue.length;
    
    return {
      size: this.queue.length,
      avgPriority: avgPriority,
      avgUncertainty: avgUncertainty
    };
  }
}

const updateRankings = useCallback((winnerIdentifier, loserIdentifier, currentGroup) => {
  // Save current state to history
  const currentProgress = comparisons / maxComparisons;
  const currentHighImpact = calculateComparisonImpact(
    rankings[winnerIdentifier].movie,
    rankings[loserIdentifier].movie,
    rankings,
    currentProgress
  );

  // Create deep copies of the rankings to avoid memory leaks
  const rankingsCopy = Object.entries(rankings).reduce((acc, [key, value]) => {
    // Create a new object for each movie with a deep copy of movie data
    acc[key] = {
      ...value,
      movie: {...value.movie},
      recentResults: value.recentResults.map(result => ({...result}))
    };
    return acc;
  }, {});
  
  setComparisonHistory(prev => [...prev, {
    winner: winnerIdentifier,
    loser: loserIdentifier,
    rankings: rankingsCopy,
    pair: currentGroup.map(item => ({...item})), // Create shallow copies of each item
    isHighImpact: currentHighImpact
  }]);

  // Calculate progress for impact determination
  const progress = comparisons / maxComparisons;
  
  // Add safety check
  if (!rankings[winnerIdentifier] || !rankings[loserIdentifier]) {
    console.error('Missing ranking records:', { winnerIdentifier, loserIdentifier, rankings });
    setIsCurrentComparisonHighImpact(false);
  } else {
    // Calculate impact before updating rankings
    const isHighImpact = calculateComparisonImpact(
      rankings[winnerIdentifier].movie,
      rankings[loserIdentifier].movie,
      rankings,
      progress
    );
    setIsCurrentComparisonHighImpact(isHighImpact);
  }

  // Update group selection metrics
  setRankings(prevRankings => {
    const newRankings = { ...prevRankings };
    
    // Identify if this was a group selection
    const isGroupSelection = currentGroup.length > 2;
    
    if (isGroupSelection) {
      // Update appearance counts for all movies in the group
      currentGroup.forEach(movie => {
        const id = movie.identifier;
        if (newRankings[id]) {
          newRankings[id] = {
            ...newRankings[id],
            groupSelections: {
              ...newRankings[id].groupSelections,
              appearances: newRankings[id].groupSelections.appearances + 1
            }
          };
        }
      });
      
      // Update chosen count for winner
      if (newRankings[winnerIdentifier]) {
        newRankings[winnerIdentifier] = {
          ...newRankings[winnerIdentifier],
          groupSelections: {
            ...newRankings[winnerIdentifier].groupSelections,
            chosen: newRankings[winnerIdentifier].groupSelections.chosen + 1
          }
        };
      }
    }
    
    return newRankings;
  });

  // Initialize priority queue for updates if it doesn't exist
  if (!window.updateQueue) {
    window.updateQueue = new PriorityUpdateQueue();
  }
  
  // Calculate priority and uncertainty metrics for this update
  const updatePriority = isCurrentComparisonHighImpact ? 1.0 : 0.5;
  const updateUncertainty = Math.max(
    rankings[winnerIdentifier]?.ratingUncertainty || 0,
    rankings[loserIdentifier]?.ratingUncertainty || 0
  );
  
  // Add to priority queue with metadata
  window.updateQueue.enqueue(
    { winner: winnerIdentifier, loser: loserIdentifier },
    updatePriority,
    updateUncertainty
  );
  
  // Log queue stats occasionally
  if (Math.random() < 0.1) {
    console.log('Update queue stats:', window.updateQueue.getStats());
  }
  
  // Process queue if we have enough updates
  setPendingUpdates(prev => {
    // Determine optimal batch size
    const optimalBatchSize = calculateOptimalBatchSize();
    
    // Check if we should process a batch now
    if (window.updateQueue.size() >= optimalBatchSize) {
      // Get the highest priority batch from the queue
      const batchToProcess = window.updateQueue.dequeue(optimalBatchSize);
      
      console.log(`Processing batch of ${batchToProcess.length} updates (${window.updateQueue.size()} remaining in queue)`);
      
      // Process this high-priority batch
      processBatchUpdate(batchToProcess);
      return [];
    } else {
      // Check if any pending updates are stored from before the queue was implemented
      const newPending = [...prev, { winner: winnerIdentifier, loser: loserIdentifier }];
      
      // If we have enough pending updates (from before implementing queue), process them
      if (newPending.length >= optimalBatchSize) {
        console.log(`Processing batch of ${newPending.length} legacy updates`);
        processBatchUpdate(newPending);
        return [];
      }
      
      return newPending;
    }
  });

  setComparisons(prev => {
    const newComparisons = prev + 1;
    
    // Check if we should perform global optimization
    if (newComparisons >= GLOBAL_OPTIMIZATION.MIN_COMPARISONS_REQUIRED && 
        newComparisons % GLOBAL_OPTIMIZATION.RECALCULATION_INTERVAL === 0) {
      // Schedule global optimization to run after state updates
      setTimeout(() => performGlobalOptimization(), 0);
    }
    
    // Check if we should force-process the update queue
    if (window.updateQueue && window.updateQueue.size() > 0 && 
        newComparisons % 5 === 0) { // Every 5 comparisons
      setTimeout(() => {
        // Process whatever is in the queue, regardless of size
        const queueContent = window.updateQueue.dequeue(window.updateQueue.size());
        if (queueContent.length > 0) {
          console.log(`Force processing ${queueContent.length} queued updates`);
          processBatchUpdate(queueContent);
        }
      }, 0);
    }
    
    return newComparisons;
  });
}, [
  rankings, 
  processBatchUpdate, 
  calculateOptimalBatchSize, 
  comparisons, 
  maxComparisons, 
  performGlobalOptimization,
  isCurrentComparisonHighImpact
]);

  useEffect(() => {
    if (step === 'results') {
      // Process any remaining updates in the queue and pending state when reaching results
      if (window.updateQueue && !window.updateQueue.isEmpty()) {
        const queuedUpdates = window.updateQueue.dequeue(window.updateQueue.size());
        if (queuedUpdates.length > 0) {
          console.log(`Processing ${queuedUpdates.length} remaining queued updates at completion`);
          processBatchUpdate(queuedUpdates);
        }
      }
      
      // Process any legacy pending updates
      if (pendingUpdates.length > 0) {
        console.log(`Processing ${pendingUpdates.length} remaining legacy updates at completion`);
        processBatchUpdate(pendingUpdates);
        setPendingUpdates([]);
      }
    }
    
    // Cleanup on step change - suggest garbage collection
    return () => {
      if (typeof window !== 'undefined') {
        // Clear update queue when changing steps
        if (window.updateQueue) {
          window.updateQueue = new PriorityUpdateQueue();
        }
        
        // Request garbage collection if available
        if (window.gcCollect) {
          window.gcCollect();
        }
      }
    };
  }, [step, pendingUpdates, processBatchUpdate]);

  const memoizedRankingProcess = useMemo(() => (
    <RankingProcess 
      movies={movies} 
      rankings={rankings}
      comparisons={comparisons}
      maxComparisons={maxComparisons}
      calculateConfidence={calculateConfidence}
      onChoose={updateRankings} 
      onFinish={finishRanking}
      onUndo={handleUndo}
      isHighImpact={isCurrentComparisonHighImpact} 
    />
  ), [movies, rankings, comparisons, maxComparisons, calculateConfidence, 
      updateRankings, finishRanking, handleUndo, isCurrentComparisonHighImpact]);

return (
  <div className="min-h-screen bg-base-100 text-base-content font-sans">
    {step === 'input' ? (
      <div className="min-h-screen flex flex-col items-center px-4">
        <h1 className="text-6xl font-crimson font-bold mt-12 mb-16 animate-fade-in">
          RankBoxd
        </h1>
        <InputForm onSubmit={startRanking} />
      </div>
    ) : (
      <div className="flex flex-col min-h-screen">
        <ProgressBar currentStep={step} />
        <main className="flex-grow">
          {step === 'mode-selection' && (
            <ModeSelection 
              movies={movies} 
              onModeSelect={selectMode}
            />
          )}
          {step === 'instructions' && (
            <Instructions onContinue={() => setStep('ranking')} />
          )}
          {step === 'ranking' && memoizedRankingProcess}
          {step === 'results' && (
            <MovieResults
              rankings={Object.values(rankings)}
              calculateConfidence={calculateConfidence}
            />
          )}
        </main>
        
        {(step === 'ranking' || step === 'results') && (
          <StatusBar
            comparisons={comparisons}
            maxComparisons={maxComparisons}
            avgConfidence={Object.values(rankings).reduce((sum, r) => sum + calculateConfidence(r.movie.identifier), 0) / movies.length}
            stabilityScore={calculateRankStability()}
            learningRate={currentLearningRate}
            globalOptimizationStats={globalOptimizationStats}
            estimatedMinutesLeft={Math.ceil(
              // More accurate time estimation for remaining comparisons
              ((maxComparisons - comparisons) * 0.08) * (1 - Math.log10(maxComparisons - comparisons) / 20)
            )}
          />
        )}
      </div>
    )}
  </div>
);
}

export default App;