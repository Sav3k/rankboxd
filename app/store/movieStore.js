'use client';

import { create } from 'zustand';

export const useMovieStore = create((set) => ({
  // Movie data
  movies: [],
  rankings: {},
  
  // Ranking process settings
  maxComparisons: 0,
  comparisons: 0,
  rankingMode: 'balanced',
  
  // Current state
  step: 'input', // 'input', 'mode-selection', 'instructions', 'ranking', 'results'
  
  // Movie comparison tracking
  comparisonHistory: [],
  pendingUpdates: [],
  recentChanges: [],
  movieMomentum: {},
  
  // Current comparison state
  isCurrentComparisonHighImpact: false,
  
  // Actions
  setMovies: (movieList) => {
    set(() => {
      const initialRankings = movieList.reduce((acc, movie) => {
        acc[movie.identifier] = {
          rating: 0,
          movie: movie,
          wins: 0,
          losses: 0,
          comparisons: 0,
          recentResults: [],
          confidenceScore: 0,
          uncertainty: 0
        };
        return acc;
      }, {});
      
      return {
        movies: movieList,
        rankings: initialRankings,
        step: 'mode-selection'
      };
    });
  },
  
  setRankingMode: (mode) => set({ rankingMode: mode }),
  setMaxComparisons: (count) => set({ maxComparisons: count }),
  setComparisons: (count) => set({ comparisons: count }),
  incrementComparisons: () => set((state) => ({ comparisons: state.comparisons + 1 })),
  setStep: (step) => set({ step }),
  
  // Rankings update actions
  updateRankings: (newRankings) => set({ rankings: newRankings }),
  setPendingUpdates: (updates) => set({ pendingUpdates: updates }),
  addComparisonToHistory: (comparisonData) => set((state) => ({
    comparisonHistory: [...state.comparisonHistory, comparisonData]
  })),
  setRecentChanges: (changes) => set({ recentChanges: changes }),
  setMovieMomentum: (momentum) => set({ movieMomentum: momentum }),
  setIsCurrentComparisonHighImpact: (isHighImpact) => set({ isCurrentComparisonHighImpact: isHighImpact }),
  
  // Reset store
  resetStore: () => set({
    movies: [],
    rankings: {},
    maxComparisons: 0,
    comparisons: 0,
    rankingMode: 'balanced',
    step: 'input',
    comparisonHistory: [],
    pendingUpdates: [],
    recentChanges: [],
    movieMomentum: {},
    isCurrentComparisonHighImpact: false
  }),
}));