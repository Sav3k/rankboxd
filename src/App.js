// App.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

const calculateLocalTransitivity = (movieId, rankings, sortedMovies, position) => {
  const localRange = CONFIDENCE_CONSTANTS.LOCAL_RANGE;
  const start = Math.max(0, position - localRange);
  const end = Math.min(sortedMovies.length, position + localRange + 1);
  const localMovies = sortedMovies.slice(start, end);
  
  let weightedTransitivity = 0;
  let totalWeight = 0;
  
  for (let i = 0; i < localMovies.length - 2; i++) {
    for (let j = i + 1; j < localMovies.length - 1; j++) {
      for (let k = j + 1; k < localMovies.length; k++) {
        const [a, b, c] = [localMovies[i], localMovies[j], localMovies[k]]
          .map(m => m.movie.identifier);
          
        // Calculate positional weight (closer positions matter more)
        const posWeight = 1 / (Math.abs(position - i) + 1);
        
        // Calculate rating difference weight
        const ratingDiffs = Math.abs(rankings[a].rating - rankings[b].rating) +
                          Math.abs(rankings[b].rating - rankings[c].rating) +
                          Math.abs(rankings[a].rating - rankings[c].rating);
        const ratingWeight = 1 / (1 + ratingDiffs);
        
        const weight = posWeight * ratingWeight;
        
        if (rankings[a].recentResults.some(r => r.opponent === b || r.opponent === c) &&
            rankings[b].recentResults.some(r => r.opponent === c)) {
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
  }
  
  return totalWeight > 0 ? weightedTransitivity / totalWeight : 0.5;
};

const calculateEnhancedConfidence = (movieId, rankings, allMovies) => {
  const record = rankings[movieId];
  if (!record || record.comparisons < CONFIDENCE_CONSTANTS.MIN_COMPARISONS) {
    return 0.2; // Minimum baseline confidence of 20%
  }

  // 1. Base Comparison Confidence (0-1)
  const comparisonScore = Math.min(
    record.comparisons / CONFIDENCE_CONSTANTS.OPTIMAL_COMPARISONS,
    1
  ) * 0.8 + 0.2; // Minimum 20% if at least MIN_COMPARISONS

  // 2. Position-Aware Consistency (0-1)
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

  // 3. Local Performance (0-1)
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

  // 4. Temporal Confidence (0-1)
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

  // 5. Transitivity Score (0-1)
  const transitivityScore = calculateLocalTransitivity(
    movieId, 
    rankings, 
    sortedMovies, 
    position
  );

  // Combine all factors with weights
  const finalConfidence = (
    comparisonScore * 0.25 +
    consistencyScore * 0.20 +
    localConsistencyScore * 0.25 +
    temporalConsistency * 0.15 +
    transitivityScore * CONFIDENCE_CONSTANTS.TRANSITIVITY_WEIGHT
  );

  // Ensure minimum confidence of 20% and maximum of 100%
  return Math.min(Math.max(finalConfidence, 0.2), 1);
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

  const CONVERGENCE_CHECK_WINDOW = 10;
  const BASE_LEARNING_RATE = 0.1;

  const VOLATILITY_WINDOW = 20; // How many recent changes to consider
  const VOLATILITY_THRESHOLD_HIGH = 0.05; // High volatility threshold
  const VOLATILITY_THRESHOLD_LOW = 0.01; // Low volatility threshold

  const MOMENTUM_FACTOR = 0.9;
  const MIN_LEARNING_RATE = 0.01;
  const MAX_LEARNING_RATE = 0.2;

  const EARLY_TERMINATION = {
    MIN_PROGRESS: 0.4, // Don't terminate before 40% completion
    MIN_COMPARISONS_PER_MOVIE: 5,
    MIN_CONFIDENCE_THRESHOLD: 0.7,
    STABILITY_WINDOW: 15,
    STABILITY_THRESHOLD: 0.03,
    MIN_TRANSITIVITY_SCORE: 0.85,
    RELATIVE_RANK_STABILITY: 0.9
  };

  const calculateConfidence = useCallback((movieId) => {
    return calculateEnhancedConfidence(movieId, rankings, movies);
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
        rating: 0,
        movie: movie,
        wins: 0,
        losses: 0,
        comparisons: 0,
        recentResults: [], // Will store objects with opponent and result info
        confidenceScore: 0,
        uncertainty: 0
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
        setRankings(lastComparison.rankings);
        // Reset recent changes since we're going back
        setRecentChanges([]);
        return lastComparison.pair; // Return the previous pair
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

  const getDynamicLearningRate = useCallback((winner, loser) => {
    const progress = comparisons / maxComparisons;
    const ratingDiff = Math.abs(rankings[winner].rating - rankings[loser].rating);
    const winnerConfidence = calculateConfidence(winner);
    const loserConfidence = calculateConfidence(loser);
    
    // Start with base learning rate
    let learningRate = BASE_LEARNING_RATE;
    
    // Adjust based on progress
    learningRate *= (1 - progress * 0.5);
    
    // Adjust for rating difference
    const surpriseFactor = 1 / (1 + Math.exp(-5 * (1 - ratingDiff)));
    learningRate *= (1 + surpriseFactor);
    
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
    
    // Clamp learning rate
    return Math.max(MIN_LEARNING_RATE, Math.min(MAX_LEARNING_RATE, learningRate));
  }, [comparisons, maxComparisons, rankings, checkTransitivityViolation, calculateConfidence, movieMomentum]);
  
  const calculateOptimalBatchSize = useCallback(() => {
    const movieCount = movies.length;
    const batchParams = calculateBatchParameters(movieCount);
    const progress = comparisons / maxComparisons;
    
    // Calculate average confidence across all movies
    const avgConfidence = Object.values(rankings).reduce((sum, record) => {
      return sum + (record && record.movie ? calculateConfidence(record.movie.identifier) : 0);
    }, 0) / movieCount;
  
    console.log(`Current batch parameters for ${movieCount} movies:`, {
      early: batchParams.EARLY_STAGE_SIZE,
      mid: batchParams.MID_STAGE_SIZE,
      late: batchParams.LATE_STAGE_SIZE,
      progress: progress.toFixed(2),
      avgConfidence: avgConfidence.toFixed(2)
    });
  
    // Determine stage based on progress
    if (progress < batchParams.EARLY_STAGE_THRESHOLD) {
      return batchParams.EARLY_STAGE_SIZE;
    } else if (progress > batchParams.LATE_STAGE_THRESHOLD) {
      return batchParams.LATE_STAGE_SIZE;
    } else {
      return avgConfidence < batchParams.MIN_CONFIDENCE_THRESHOLD 
        ? batchParams.EARLY_STAGE_SIZE 
        : batchParams.MID_STAGE_SIZE;
    }
      }, [
        movies.length, 
        comparisons, 
        maxComparisons, 
        rankings, 
        calculateConfidence,  // Add this
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
  setRankings(prevRankings => {
    const newRankings = { ...prevRankings };
    const newMomentum = { ...movieMomentum };
    
    updates.forEach(({ winner, loser }) => {
      const learningRate = getDynamicLearningRate(winner, loser);
      
      const winnerStrength = Math.exp(prevRankings[winner].rating);
      const loserStrength = Math.exp(prevRankings[loser].rating);
      
      const expectedProbWinner = winnerStrength / (winnerStrength + loserStrength);
      const ratingChange = learningRate * (1 - expectedProbWinner);
      
      // Update momentum
      newMomentum[winner] = (newMomentum[winner] || 0) * MOMENTUM_FACTOR + ratingChange;
      newMomentum[loser] = (newMomentum[loser] || 0) * MOMENTUM_FACTOR - ratingChange;
      
      // Update ratings with momentum influence and store opponent info
      newRankings[winner] = {
        ...newRankings[winner],
        rating: prevRankings[winner].rating + ratingChange + newMomentum[winner] * MOMENTUM_FACTOR,
        wins: prevRankings[winner].wins + 1,
        comparisons: prevRankings[winner].comparisons + 1,
        recentResults: [...prevRankings[winner].recentResults.slice(-9), {
          opponent: loser,
          result: 1,
          ratingDiff: Math.abs(prevRankings[winner].rating - prevRankings[loser].rating)
        }]
      };
      
      newRankings[loser] = {
        ...newRankings[loser],
        rating: prevRankings[loser].rating - ratingChange + newMomentum[loser] * MOMENTUM_FACTOR,
        losses: prevRankings[loser].losses + 1,
        comparisons: prevRankings[loser].comparisons + 1,
        recentResults: [...prevRankings[loser].recentResults.slice(-9), {
          opponent: winner,
          result: 0,
          ratingDiff: Math.abs(prevRankings[winner].rating - prevRankings[loser].rating)
        }]
      };
      
      setRecentChanges(prev => [...prev.slice(-CONVERGENCE_CHECK_WINDOW + 1), ratingChange]);
    });
    
    setMovieMomentum(newMomentum);
    return newRankings;
  });
  
  checkConvergence();
}, [getDynamicLearningRate, checkConvergence, movieMomentum]);

const updateRankings = useCallback((winnerIdentifier, loserIdentifier, currentPair) => {
  // Save current state to history
  const currentProgress = comparisons / maxComparisons;
  const currentHighImpact = calculateComparisonImpact(
    rankings[winnerIdentifier].movie,
    rankings[loserIdentifier].movie,
    rankings,
    currentProgress
  );

  setComparisonHistory(prev => [...prev, {
    winner: winnerIdentifier,
    loser: loserIdentifier,
    rankings: { ...rankings },
    pair: currentPair,
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

    // Add to pending updates and process if optimal batch size reached
    setPendingUpdates(prev => {
      const newPending = [...prev, { winner: winnerIdentifier, loser: loserIdentifier }];
      const optimalBatchSize = calculateOptimalBatchSize();
      
      if (newPending.length >= optimalBatchSize) {
        console.log(`Processing batch of size ${optimalBatchSize}`);
        processBatchUpdate(newPending);
        return [];
      }
      return newPending;
    });

    setComparisons(prev => prev + 1);
  }, [rankings, processBatchUpdate, calculateOptimalBatchSize, comparisons, maxComparisons]);

  useEffect(() => {
    if (step === 'results' && pendingUpdates.length > 0) {
      processBatchUpdate(pendingUpdates);
      setPendingUpdates([]);
    }
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
            estimatedMinutesLeft={Math.ceil((maxComparisons - comparisons) * 0.1)}
          />
        )}
      </div>
    )}
  </div>
);
}

export default App;