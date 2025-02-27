'use client';

import ProgressBar from './ui/ProgressBar';
import StatusBar from './ui/StatusBar';
import { useMovieStore } from '../store/movieStore';

export default function ClientWrapper({ children }) {
  const { step, comparisons, maxComparisons, movies, rankings } = useMovieStore();
  
  const calculateConfidence = (movieId) => {
    // This is a simplified placeholder - you'll need to implement the full confidence algorithm
    if (!rankings[movieId]) return 0;
    return (rankings[movieId].comparisons > 0) ? 
      Math.min(rankings[movieId].comparisons / 5, 1) * 0.8 + 0.2 : 
      0.2;
  };

  const calculateRankStability = () => {
    // Simplified placeholder
    return 0.5;
  };
  
  const showProgressBar = step !== 'input';
  const showStatusBar = step === 'ranking' || step === 'results';
  
  return (
    <>
      {showProgressBar && <ProgressBar currentStep={step} />}
      
      {children}
      
      {showStatusBar && (
        <StatusBar
          comparisons={comparisons}
          maxComparisons={maxComparisons}
          avgConfidence={Object.values(rankings).reduce((sum, r) => sum + calculateConfidence(r.movie.identifier), 0) / (movies.length || 1)}
          stabilityScore={calculateRankStability()}
          estimatedMinutesLeft={Math.ceil((maxComparisons - comparisons) * 0.1)}
        />
      )}
    </>
  );
}