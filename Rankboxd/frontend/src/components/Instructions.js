import React from 'react';
import { Zap, ArrowLeft, ArrowRight, RotateCcw, Star } from 'lucide-react';
import { motion } from 'framer-motion';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.3,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

const Instructions = ({ onContinue }) => {
  return (
    <div className="container mx-auto py-4 px-6 max-w-4xl">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="space-y-6"
      >
        {/* Header */}
        <motion.div variants={item} className="text-center">
          <h2 className="text-2xl font-bold mb-1">How to Play</h2>
          <p className="text-sm text-base-content/70">Choose your preferred movie in each pair to create your perfect ranking</p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Demo Section */}
          <motion.div variants={item} className="relative">
            <div className="bg-base-200 rounded-xl p-6 overflow-hidden h-full">
              <div className="relative">
                {/* Comparison Preview */}
                    <div className="grid grid-cols-2 gap-6 mb-6">
                    <div className="relative group">
                        <div className="aspect-[2/3] rounded-md bg-base-300/30 overflow-hidden max-w-[140px] mx-auto">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-2.5">
                            <div className="h-3 w-16 bg-white/10 rounded-sm animate-pulse" />
                            <div className="h-2 w-10 bg-white/10 rounded-sm mt-1.5" />
                        </div>
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowLeft className="w-5 h-5 text-primary" />
                        </div>
                    </div>
                    <div className="relative group">
                        <div className="aspect-[2/3] rounded-md bg-base-300/30 overflow-hidden max-w-[140px] mx-auto">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-2.5">
                            <div className="h-3 w-16 bg-white/10 rounded-sm animate-pulse" />
                            <div className="h-2 w-10 bg-white/10 rounded-sm mt-1.5" />
                        </div>
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowRight className="w-5 h-5 text-primary" />
                        </div>
                    </div>
                    </div>

                {/* Controls */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="card bg-base-300/50 p-3">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <kbd className="kbd kbd-xs">←</kbd>
                      <span className="text-xs text-base-content/70">or</span>
                      <kbd className="kbd kbd-xs">1</kbd>
                    </div>
                    <p className="text-center text-xs">Left Movie</p>
                  </div>
                  <div className="card bg-base-300/50 p-3">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <kbd className="kbd kbd-xs">→</kbd>
                      <span className="text-xs text-base-content/70">or</span>
                      <kbd className="kbd kbd-xs">2</kbd>
                    </div>
                    <p className="text-center text-xs">Right Movie</p>
                  </div>
                  <div className="card bg-base-300/50 p-3">
                    <div className="flex items-center justify-center mb-1">
                      <kbd className="kbd kbd-xs">U</kbd>
                    </div>
                    <p className="text-center text-xs">Undo</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Important Matches Section */}
          <motion.div variants={item}>
            <div className="bg-base-200 rounded-xl p-6 h-full">
              <div className="flex items-center gap-3 mb-4">
                <div className="relative">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20" />
                  <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                  <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                  <div className="absolute inset-0 w-8 h-8 -m-3 bg-amber-500/20 blur-lg rounded-full" />
                </div>
                <h3 className="text-base font-semibold">High Impact Matches</h3>
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500" />
                    <h4 className="font-medium text-sm">Close Rankings</h4>
                  </div>
                  <p className="text-xs text-base-content/70">Matches between similarly ranked movies help fine-tune their positions</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <h4 className="font-medium text-sm">New Movies</h4>
                  </div>
                  <p className="text-xs text-base-content/70">Early comparisons for movies with few matches are especially important</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-amber-500" />
                    <h4 className="font-medium text-sm">Verification</h4>
                  </div>
                  <p className="text-xs text-base-content/70">Some matches help confirm or challenge existing rankings</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Start Button */}
        <motion.div variants={item} className="text-center">
        <button 
            onClick={onContinue}
            className="btn btn-primary btn-wide gap-2 relative group"
            >
            <div className="absolute inset-0 -z-10 bg-primary/20 blur-md rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
            Start Comparing
            <Zap className="w-4 h-4" />
            </button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Instructions;