import React, { useMemo } from 'react';
import { Timer, Zap, Target } from 'lucide-react';

const RANKING_CONSTANTS = {
  QUICK_MULTIPLIER: 1.5,
  BALANCED_MULTIPLIER: 3,
  THOROUGH_MULTIPLIER: 5,
  MIN_QUICK_COMPARISONS: 20,
  MIN_BALANCED_COMPARISONS: 30,
  MIN_THOROUGH_COMPARISONS: 40,
  MAX_BALANCED_COMPARISONS: 1500,
  MAX_THOROUGH_COMPARISONS: 2000
};

const ModeOption = ({ title, description, comparisons, time, icon: Icon, onClick }) => (
    <button
      onClick={onClick}
      className="relative w-full group overflow-hidden rounded-lg border border-base-content/10 bg-base-200 p-6 transition-all hover:border-primary/50 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5"
    >
    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    
    <div className="relative space-y-4 w-full">
      <div className="flex items-center gap-3">
      <div className="p-2 rounded-md bg-base-300 text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors">
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      
      <p className="text-sm text-base-content/70">{description}</p>
      
      <div className="pt-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-base-content/60">
          <Timer className="w-4 h-4" />
          <span>~{time} min</span>
        </div>
        <div className="px-2 py-1 rounded bg-base-300 text-xs font-medium">
          {comparisons} comparisons
        </div>
      </div>
    </div>
  </button>
);

const ModeSelection = ({ movies, onModeSelect }) => {
  const getEstimatedTime = (comparisons) => Math.ceil(comparisons * 0.1);

  const modeOptions = useMemo(() => {
    const calculateOptions = (movieCount) => {
      // Quick mode - less accurate but faster
      const quickComparisons = Math.max(
        Math.ceil(movieCount * RANKING_CONSTANTS.QUICK_MULTIPLIER),
        RANKING_CONSTANTS.MIN_QUICK_COMPARISONS
      );
      
      // Balanced mode - good balance between accuracy and time
      const baseComparisons = movieCount * RANKING_CONSTANTS.BALANCED_MULTIPLIER;
      const extraComparisons = Math.ceil(movieCount * Math.log2(movieCount));
      const balancedComparisons = Math.min(
        Math.max(baseComparisons + extraComparisons, RANKING_CONSTANTS.MIN_BALANCED_COMPARISONS),
        RANKING_CONSTANTS.MAX_BALANCED_COMPARISONS
      );
      
      // Thorough mode - highest accuracy
      const thoroughComparisons = Math.min(
        Math.max(movieCount * RANKING_CONSTANTS.THOROUGH_MULTIPLIER + extraComparisons, RANKING_CONSTANTS.MIN_THOROUGH_COMPARISONS),
        RANKING_CONSTANTS.MAX_THOROUGH_COMPARISONS
      );

      return {
        quick: quickComparisons,
        balanced: balancedComparisons,
        thorough: thoroughComparisons
      };
    };

    const options = calculateOptions(movies.length);

    return [
      {
        id: 'quick',
        title: 'Quick Mode',
        description: 'Get a rough ranking quickly. Best for casual sorting or when time is limited.',
        comparisons: options.quick,
        time: getEstimatedTime(options.quick),
        icon: Zap
      },
      {
        id: 'balanced',
        title: 'Balanced Mode',
        description: 'A good balance between accuracy and time investment. Recommended for most users.',
        comparisons: options.balanced,
        time: getEstimatedTime(options.balanced),
        icon: Target
      },
      {
        id: 'thorough',
        title: 'Thorough Mode',
        description: 'Maximum accuracy with more comparisons. Ideal for definitive rankings.',
        comparisons: options.thorough,
        time: getEstimatedTime(options.thorough),
        icon: Timer
      }
    ];
  }, [movies.length]);

  return (
    <div className="container mx-auto p-6">
        <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">Choose Your Ranking Mode</h2>
            <p className="text-base-content/70">
            Select how thorough you want the ranking process to be
            </p>
        </div>

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 lg:gap-8 max-w-md lg:max-w-4xl mx-auto place-items-center">
        {modeOptions.map(mode => (
          <ModeOption
            key={mode.id}
            {...mode}
            onClick={() => onModeSelect(mode.id, mode.comparisons)}
          />
        ))}
      </div>

        <p className="text-xs text-center mt-8 text-base-content/50">
        All modes will produce a complete ranking, but more comparisons generally lead to higher accuracy
        </p>
    </div>
  );
};

export default ModeSelection;