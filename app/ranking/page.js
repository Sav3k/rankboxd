'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMovieStore } from '../store/movieStore';
import RankingProcess from '../components/RankingProcess';

function RankingPage() {
  const router = useRouter();
  const {
    movies,
    comparisons,
    maxComparisons,
    setStep
  } = useMovieStore();
  
  // Redirect if no movies are loaded
  useEffect(() => {
    if (!movies || movies.length < 2) {
      router.push('/');
    }
  }, [movies, router]);

  // When we reach max comparisons, go to results
  useEffect(() => {
    if (comparisons >= maxComparisons) {
      finishRanking();
    }
  }, [comparisons, maxComparisons]);

  const finishRanking = () => {
    setStep('results');
    router.push('/results');
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl relative">
      <div className="max-w-6xl mx-auto relative">
        <RankingProcess onFinish={finishRanking} />
      </div>
    </div>
  );
}

export default RankingPage;