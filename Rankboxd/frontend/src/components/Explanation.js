import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, Trophy, BarChart2, Calculator, ChevronDown, ChevronUp } from 'lucide-react';

const ExplanationContent = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <Trophy className="w-5 h-5" />
          <h3 className="font-semibold">Ranking Method</h3>
        </div>
        <p className="text-sm text-base-content/70 leading-relaxed">
          Movies are ranked using a sophisticated rating system that updates after each comparison. 
          Wins against highly-rated movies have more impact than wins against lower-rated ones.
        </p>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <BarChart2 className="w-5 h-5" />
          <h3 className="font-semibold">Confidence Score</h3>
        </div>
        <p className="text-sm text-base-content/70 leading-relaxed">
          Each movie's position has a confidence score based on consistency in comparisons and number 
          of matchups. Higher scores mean more reliable rankings.
        </p>
      </div>
    </div>
    
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <Calculator className="w-5 h-5" />
          <h3 className="font-semibold">Statistical Measures</h3>
        </div>
        <ul className="text-sm text-base-content/70 space-y-2 list-disc pl-4">
          <li>Win rate against similarly ranked movies</li>
          <li>Performance consistency over time</li>
          <li>Number and quality of comparisons</li>
          <li>Position stability in rankings</li>
        </ul>
      </div>
      
      <div className="p-3 bg-primary/10 rounded-lg">
        <p className="text-sm text-primary/90">
          Pro tip: More comparisons and consistent choices lead to higher confidence in the final rankings.
        </p>
      </div>
    </div>
  </div>
);

const EnhancedExplanation = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="relative flex">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="btn btn-ghost btn-sm gap-2 text-base-content/70 hover:text-primary transition-colors"
      >
        <Info className="w-4 h-4" />
        How Rankings Work
        {isExpanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute left-1/2 -translate-x-1/2 top-full mt-2 min-w-[600px] max-w-3xl bg-base-200 rounded-lg shadow-lg border border-base-content/5 z-20"
          >
            <ExplanationContent />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EnhancedExplanation;