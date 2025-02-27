import './styles/globals.css';
import ProgressBar from './components/ui/ProgressBar';
import StatusBar from './components/ui/StatusBar';
import { useMovieStore } from './store/movieStore';
import { Crimson_Text } from 'next/font/google';

// Initialize fonts
const crimson = Crimson_Text({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-crimson',
});

export const metadata = {
  title: 'RankBoxd',
  description: 'Rank movies through pairwise comparisons, inspired by Letterboxd',
};

// Client Components wrapper for components that need store access
function ClientComponentsWrapper({ children }) {
  'use client';
  
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

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="night">
      <body className={`min-h-screen bg-base-100 text-base-content font-sans ${crimson.variable}`}>
        <ClientComponentsWrapper>
          {children}
        </ClientComponentsWrapper>
      </body>
    </html>
  );
}