import React, { useMemo } from 'react';
import { Timer, Zap, Target, Info, Check } from 'lucide-react';

const getPhaseInfo = (progress) => {
  // Updated to match phase transitions in RankingProcess.js
  if (progress < 0.35) {
    return {
      message: "Initial sorting...",
      icon: Zap,
      color: "text-primary/70"
    };
  } else if (progress < 0.75) {
    return {
      message: "Refining rankings...",
      icon: Target,
      color: "text-primary"
    };
  } else {
    return {
      message: "Finalizing results...",
      icon: Timer,
      color: "text-primary/90"
    };
  }
};

const StatusBar = ({ 
  comparisons, 
  maxComparisons,
  avgConfidence,
  stabilityScore,
  estimatedMinutesLeft,
  learningRate,
  globalOptimizationStats
}) => {
  const progress = comparisons / maxComparisons;
  const phase = useMemo(() => getPhaseInfo(progress), [progress]);
  
  // Learning rate visualization - for adaptive learning rate feature
  const normalizedLearningRate = useMemo(() => {
    if (!learningRate) return 0.5; // Default if not provided
    const min = 0.01;
    const max = 0.2;
    return Math.min(1, Math.max(0, (learningRate - min) / (max - min)));
  }, [learningRate]);
  
  return (
    <div className="mt-8 mb-8 flex justify-center">
      <div className="relative px-6 py-2 bg-base-200 rounded-full">
        <div className="flex items-center gap-3">
          <phase.icon className={`w-4 h-4 ${phase.color}`} />
          <span className="text-sm font-medium">
            {phase.message}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {Math.round(progress * 100)}%
            </span>
            <div className="relative group">
              <Info className="w-4 h-4 text-base-content/50 hover:text-base-content cursor-help transition-colors" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-3 bg-base-300 rounded-lg 
                opacity-0 invisible group-hover:opacity-100 group-hover:visible
                transition-all duration-200 text-sm shadow-lg z-50">
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-base-content/70">Comparisons</div>
                    <div className="font-medium">{comparisons} / {maxComparisons}</div>
                  </div>
                  <div>
                    <div className="text-xs text-base-content/70">Confidence</div>
                    <div className="font-medium">{Math.round(avgConfidence * 100)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-base-content/70">Time Remaining</div>
                    <div className="font-medium">~{estimatedMinutesLeft} min</div>
                  </div>
                  <div className="flex items-center gap-1 bg-primary/5 -mx-1 px-1 py-0.5 rounded">
                    <Check className="w-3 h-3 text-primary/80" />
                    <div className="text-xs">Direct comparison consistency</div>
                  </div>
                  {learningRate && (
                    <div>
                      <div className="text-xs text-base-content/70">Learning Rate</div>
                      <div className="font-medium flex items-center gap-1">
                        {learningRate.toFixed(3)}
                        <div className="w-8 h-2 bg-base-100 rounded-full">
                          <div 
                            className="h-full rounded-full bg-primary/70" 
                            style={{ width: `${normalizedLearningRate * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {globalOptimizationStats && globalOptimizationStats.totalCorrections > 0 && (
                    <div>
                      <div className="text-xs text-base-content/70">Global Optimizations</div>
                      <div className="font-medium">
                        {globalOptimizationStats.totalCorrections} corrections
                      </div>
                      <div className="text-xs text-base-content/70">
                        Last: {comparisons - globalOptimizationStats.lastOptimizationComparison} comp. ago
                      </div>
                    </div>
                  )}
                </div>
                <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-base-300" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;