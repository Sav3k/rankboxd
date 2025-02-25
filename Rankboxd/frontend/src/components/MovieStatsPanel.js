import React from 'react';
import { AlertCircle, ArrowUp, BarChart2, Sigma } from 'lucide-react';

const STAT_TOOLTIPS = {
    "Win Rate": "The percentage of head-to-head comparisons this movie won. A higher win rate indicates this movie was consistently preferred over others.",
    "Comparisons": "The total number of times this movie was compared against other movies. More comparisons generally lead to more accurate ranking.",
    "Confidence": "Our statistical confidence in this movie's current ranking position, based on consistency of results and number of comparisons. Higher confidence means more reliable placement.",
    "Relative Strength": "How well this movie performed against others ranked nearby (±5 positions). A high percentage indicates strong performance against similar-ranked movies."  };

const getConfidenceLevel = (score) => {
    if (score >= 0.8) return { label: 'Very High', color: 'text-primary' };
    if (score >= 0.6) return { label: 'High', color: 'text-primary/80' };
    if (score >= 0.4) return { label: 'Moderate', color: 'text-warning' };
    return { label: 'Low', color: 'text-error' };
  };

  const generateNarrative = (stats) => {
    const winRate = (stats.wins / stats.comparisons * 100).toFixed(1);
    const confidenceLevel = getConfidenceLevel(stats.confidence);
    const neighborPerformance = stats.neighborPerformance?.percentage || 0;

    const verb = winRate >= 50 ? 'won' : 'lost';
    const stat = winRate >= 50 ? winRate : (100 - winRate).toFixed(1);
  
    return (
      `This movie ${verb} ${stat}% of its ${stats.comparisons} comparisons. ` +
      `When matched against similarly ranked movies (±5 positions), it won ${neighborPerformance}% of the time. ` +
      `Based on these results, we have ${confidenceLevel.label.toLowerCase()} confidence in its current ranking position.`
    );
  };

const StatBox = ({ label, value, icon: Icon, detail = null, valueColor = null }) => (
    <div className="group relative bg-base-300/50 rounded-lg p-4 flex flex-col gap-1">
      <div className="absolute invisible group-hover:visible opacity-0 group-hover:opacity-100 
                bottom-full left-0 mb-2 px-4 py-3 bg-base-300 
                rounded-lg text-sm shadow-lg transition-all duration-200 z-10
                w-[300px] -translate-x-1/4 text-center whitespace-normal leading-relaxed">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 
                        rotate-45 w-2 h-2 bg-base-300" />
        {STAT_TOOLTIPS[label]}
      </div>
      
      <div className="flex items-center gap-2 text-base-content/70">
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      
      <div className="flex flex-col">
        <span className={`text-2xl font-bold ${valueColor || ''}`}>{value}</span>
        {detail && (
          <span className="text-sm text-base-content/60 mt-0.5">{detail}</span>
        )}
      </div>
    </div>
);
  
const MovieStatsPanel = ({ 
  movie, 
  stats: { 
    rating, 
    wins, 
    losses, 
    comparisons, 
    recentResults,
    confidence,
    neighborPerformance
  }
}) => {
  const winRate = ((wins / comparisons) * 100).toFixed(1);
  const confidenceLevel = getConfidenceLevel(confidence);
  const narrative = generateNarrative({ 
    wins, 
    comparisons, 
    confidence, 
    recentResults,
    neighborPerformance 
  });

  return (
    <div className="py-6 px-4 bg-base-200/50 rounded-lg animate-[slideUp_0.3s_ease-out]">
      {/* Narrative Section */}
      <div className="mb-6 text-base-content/80 leading-relaxed">
        {narrative}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatBox 
            label="Win Rate"
            value={`${winRate}%`}
            icon={ArrowUp}
            detail={`${wins} wins, ${losses} losses`}
        />
        <StatBox 
            label="Comparisons" 
            value={comparisons}
            icon={Sigma}
        />
        <StatBox 
            label="Confidence"
            value={confidenceLevel.label}
            icon={AlertCircle}
            detail={`${(confidence * 100).toFixed(1)}%`}
            valueColor={confidenceLevel.color}
        />
        <StatBox 
            label="Relative Strength"     
            value={`${neighborPerformance.percentage}%`}
            icon={BarChart2}
            detail={`vs nearby rankings`}
            valueColor={neighborPerformance.percentage >= 50 ? 'text-success' : 'text-warning'}
        />
        </div>

      {/* Recent Results Timeline */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-base-content/70">Recent Matchups</h4>
        <div className="flex gap-1">
        {recentResults.map((result, i) => (
            <div 
                key={i}
                className={`h-1 flex-1 rounded-full ${
                result.result === 1 ? 'bg-success' : 'bg-error'
                }`}
                title={result.result === 1 ? 'Won' : 'Lost'}
            />
            ))}
        </div>
      </div>
    </div>
  );
};

export default MovieStatsPanel;