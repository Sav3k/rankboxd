import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, ChevronUp, Download, LineChart } from 'lucide-react';
import MovieStatsPanel from './MovieStatsPanel';
import EnhancedExplanation from './Explanation';

const style = document.createElement('style');
style.textContent = `
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  .background-animate::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.05),
      transparent
    );
    animation: shimmer 4s infinite;
  }
`;
document.head.appendChild(style);

const MovieResults = ({ rankings, calculateConfidence }) => {
  const [expandedMovie, setExpandedMovie] = useState(null);
  const sortedMovies = [...rankings].sort((a, b) => b.rating - a.rating);

  const calculateNeighborPerformance = (movies, currentIndex) => {
    const range = 5;
    const start = Math.max(0, currentIndex - range);
    const end = Math.min(movies.length - 1, currentIndex + range);
    const neighborMovies = movies.slice(start, end + 1);
    const currentMovie = movies[currentIndex];
    
    // Weight recent matches more heavily
    const timeDecay = 0.9;
    let weightedWins = 0;
    let totalWeight = 0;
    
    currentMovie.recentResults.forEach((result, idx) => {
      const neighbor = neighborMovies.find(n => n.movie.identifier === result.opponent);
      if (neighbor) {
        const timeWeight = Math.pow(timeDecay, currentMovie.recentResults.length - 1 - idx);
        const ratingDiff = Math.abs(currentMovie.rating - neighbor.rating);
        const diffWeight = 1 / (1 + ratingDiff); // Closer ratings matter more
        
        const weight = timeWeight * diffWeight;
        totalWeight += weight;
        if (result.result === 1) {
          weightedWins += weight;
        }
      }
    });
    
    return {
      percentage: totalWeight ? ((weightedWins / totalWeight) * 100).toFixed(1) : 0,
      total: currentMovie.recentResults.filter(r => 
        neighborMovies.some(n => n.movie.identifier === r.opponent)
      ).length
    };
  };

  const exportToCsv = () => {
    const csvContent = [
      ['Rank', 'Title', 'Year'],
      ...sortedMovies.map((rankingData, index) => [
        index + 1,
        rankingData.movie.title,
        rankingData.movie.year,
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'movie-rankings.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
        <div className="flex flex-col gap-6 mb-12 max-w-3xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-4xl font-bold">Your Movie Rankings</h2>
              <EnhancedExplanation />
            </div>
            <button
              onClick={exportToCsv}
              className="btn btn-primary gap-2"
            >
              <Download className="w-5 h-5" />
              Export
            </button>
          </div>

        {(() => {
          const avgConfidence = rankings.reduce((sum, r) => sum + calculateConfidence(r.movie.identifier), 0) / rankings.length;
          return avgConfidence < 0.75 && (
            <div className="relative overflow-hidden bg-gradient-to-r from-warning/20 via-warning/10 to-warning/5 
                            border border-warning/20 rounded-lg px-6 py-4">
              <div className="absolute inset-0 bg-warning/5 background-animate" />
              <div className="relative flex gap-4 items-start">
                <div className="p-2 rounded-full bg-warning/20">
                  <AlertCircle className="w-5 h-5 text-warning" />
                </div>
                <div className="space-y-2 flex-1">
                  <div className="font-medium text-base-content">
                    Ranking Confidence Notice
                  </div>
                  <div className="text-sm text-base-content/80 leading-relaxed">
                    The overall confidence in these rankings is {Math.round(avgConfidence * 100)}%, 
                    which is lower than ideal. This could happen if:
                    <ul className="mt-2 ml-4 space-y-1 list-disc text-base-content/70">
                      <li>You had some inconsistent preferences between movies</li>
                      <li>The ranking process was completed with to little comparisons</li>
                      <li>Your movie list was particularly large</li>
                    </ul>
                    <div className="mt-3 text-base-content/90 font-medium">
                      Tip: Try running the ranking again in "Thorough Mode" for higher accuracy.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Results List */}
      <div className="space-y-4 max-w-3xl mx-auto">
        {sortedMovies.map((rankingData, index) => (
          <motion.div
            key={rankingData.movie.identifier}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <div className={`group relative flex gap-6 p-4 ${
              expandedMovie === rankingData.movie.identifier 
                ? 'bg-base-300 shadow-lg shadow-primary/5 -translate-y-0.5 border-primary/20' 
                : 'bg-base-200'
            } rounded-lg transition-all duration-300
            hover:bg-base-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5
            border border-base-content/5 hover:border-primary/20`}>
              {/* Subtle gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.03] via-transparent to-transparent 
                            opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
              
              {/* Movie Poster */}
              <div className="w-16 h-24 flex-shrink-0 overflow-hidden rounded shadow-md">
              <img
                src={rankingData.movie.poster || '/api/placeholder/400/600'}
                alt={rankingData.movie.title}
                className={`w-full h-full object-cover rounded transition-transform duration-300
                            ${expandedMovie === rankingData.movie.identifier ? 'scale-105' : ''}
                            group-hover:scale-105`}
              />
              </div>
              
              {/* Movie Info and Stats Button */}
              <div className="flex-grow flex items-center justify-between min-w-0 relative z-10">
                <div className="flex items-center min-w-0">
                  <div className="mr-6 w-10 text-center flex-shrink-0">
                    <span className="font-bold text-2xl text-primary group-hover:text-primary/80 transition-colors">
                      #{index + 1}
                    </span>
                  </div>
                  
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-3">
                      <h3 className="font-crimson font-bold text-2xl leading-tight truncate">
                        {rankingData.movie.title}
                      </h3>
                      <span className="text-lg text-base-content/70 flex-shrink-0 transition-colors
                                   group-hover:text-base-content/80">
                        {rankingData.movie.year}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stats Button */}
                <button
                  onClick={() => setExpandedMovie(
                    expandedMovie === rankingData.movie.identifier 
                      ? null 
                      : rankingData.movie.identifier
                  )}
                  className={`ml-4 btn btn-sm btn-ghost gap-2 ${expandedMovie === rankingData.movie.identifier ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                >
                  {expandedMovie === rankingData.movie.identifier ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      Hide Stats
                    </>
                  ) : (
                    <>
                      <LineChart className="w-4 h-4" />
                      Show Stats
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Stats Panel */}
            <AnimatePresence>
              {expandedMovie === rankingData.movie.identifier && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="mt-1"
                >
                  <MovieStatsPanel
                    movie={rankingData.movie}
                    stats={{
                      rating: rankingData.rating,
                      wins: rankingData.wins || 0,
                      losses: rankingData.losses || 0,
                      comparisons: rankingData.comparisons || 0,
                      recentResults: rankingData.recentResults || [],
                      confidence: calculateConfidence(rankingData.movie.identifier),
                      neighborPerformance: calculateNeighborPerformance(sortedMovies, index),
                      // New Bayesian properties
                      ratingMean: rankingData.ratingMean || 0,
                      ratingUncertainty: rankingData.ratingUncertainty || 1,
                      groupSelections: rankingData.groupSelections || { chosen: 0, appearances: 0 }
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default MovieResults;