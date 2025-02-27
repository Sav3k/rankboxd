'use client';

import InputForm from '../InputForm';
import { useMovieStore } from '../../store/movieStore';
import { useRouter } from 'next/navigation';
import ClientWrapper from '../ClientWrapper';

export default function HomePage() {
  const router = useRouter();
  const { setMovies } = useMovieStore();
  
  const handleSubmit = (movieList) => {
    setMovies(movieList);
    router.push('/mode-selection');
  };

  return (
    <ClientWrapper>
      <div className="min-h-screen flex flex-col items-center px-4">
        <h1 className="text-6xl font-crimson font-bold mt-12 mb-16 animate-fade-in">
          RankBoxd
        </h1>
        <InputForm onSubmit={handleSubmit} />
      </div>
    </ClientWrapper>
  );
}