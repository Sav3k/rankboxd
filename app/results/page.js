'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMovieStore } from '../store/movieStore';
import MovieResults from '../components/Results';

// Helper function to calculate confidence scores for movies
const calculateEnhancedConfidence = (movieId, rankings, allMovies) => {
  const record = rankings[movieId];
  if (!record || record.comparisons < 3) {
    return 0.2; // Minimum baseline confidence of 20%
  }

  // 1. Base Comparison Confidence (0-1)
  const comparisonScore = Math.min(
    record.comparisons / 5,
    1
  ) * 0.8 + 0.2; // Minimum 20% if at least MIN_COMPARISONS

  // 2. Position-Aware Consistency (0-1)
  const sortedMovies = Object.values(rankings).sort((a, b) => b.rating - a.rating);
  const position = sortedMovies.findIndex(r => r.movie.identifier === movieId);
  const relativePosition = position / sortedMovies.length;

  let expectedWinRate, positionWeight;
  if (relativePosition <= 0.25) {
    expectedWinRate = 0.75; // Top 25% should win most
    positionWeight = 0.8;
  } else if (relativePosition >= 0.75) {
    expectedWinRate = 0.25; // Bottom 25% should lose most
    positionWeight = 0.8;
  } else {
    expectedWinRate = 0.5; // Middle 50% can be mixed
    positionWeight = 0.5;
  }

  const actualWinRate = record.wins / record.comparisons;
  const consistencyScore = (1 - Math.abs(actualWinRate - expectedWinRate)) * positionWeight;

  // 3. Temporal Confidence (0-1) - based on recent results consistency
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
    (recentConsistency * 0.6) +
    (historicalConsistency * 0.4);

  // Combine all factors with weights
  const finalConfidence = (
    comparisonScore * 0.4 +
    consistencyScore * 0.3 +
    temporalConsistency * 0.3
  );

  // Ensure minimum confidence of 20% and maximum of 100%
  return Math.min(Math.max(finalConfidence, 0.2), 1);
};

export default function ResultsPage() {
  const router = useRouter();
  const { movies, rankings, setStep } = useMovieStore();

  useEffect(() => {
    // Redirect if no movies are loaded
    if (!movies || movies.length < 2 || Object.keys(rankings).length === 0) {
      router.push('/');
    }
    // Set the current step to 'results' in case someone navigates directly here
    setStep('results');
  }, [movies, rankings, router, setStep]);

  const calculateConfidence = (movieId) => {
    return calculateEnhancedConfidence(movieId, rankings, movies);
  };

  return (
    <div>
      <MovieResults 
        rankings={Object.values(rankings)} 
        calculateConfidence={calculateConfidence} 
      />
    </div>
  );
}