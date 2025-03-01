import React, { useState, useEffect, useCallback } from 'react';

function GroupSelection({ 
  movies,
  groupSize = 5,
  onSelect,
  isHighImpact
}) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (isAnimating) return;
      
      let index = null;
      // Handle numeric keys 1-5 for selection
      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        index = parseInt(e.key) - 1;
        if (index >= groupSize) return; // Ignore if key is beyond group size
      }
    
      if (index !== null) {
        handleSelect(index);
      }
    };
  
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [groupSize, isAnimating]);

  const handleSelect = (index) => {
    if (isAnimating || index >= movies.length) return;
    
    setIsAnimating(true);
    setSelectedIndex(index);
    
    setTimeout(() => {
      onSelect(index, movies);
      setSelectedIndex(null);
      setIsAnimating(false);
    }, 150);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="text-center mb-8 flex justify-center">
        <h2 className="text-2xl font-bold relative inline-flex items-center gap-2">
          {isHighImpact && (
            <div className="relative w-2 h-2 absolute -left-6">
              <div className="w-2 h-2 rounded-full bg-amber-500/20" />
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <div className="absolute inset-0 w-8 h-8 -m-3 bg-amber-500/20 blur-lg rounded-full" />
            </div>
          )}
          Select your favorite movie from this group
        </h2>
      </div>

      <div className={`grid grid-cols-${Math.min(groupSize, 5)} gap-4 [&:hover_button]:opacity-30`}>
        {movies.length > 0 ? movies.map((movie, index) => (
          <div className="relative" key={movie.identifier}>
            <button
              onClick={() => handleSelect(index)}
              className={[
                'group relative overflow-hidden rounded-lg w-full',
                'transition-all ease-in-out duration-300',
                selectedIndex === index ? 'scale-[0.98]' : 'hover:scale-[1.02]',
                'animate-[fadeIn_0.5s_ease-in-out_forwards]'
              ].join(' ')}
              disabled={isAnimating}
            >
              <div className="relative aspect-[2/3] w-full">
                {/* Poster Container with fixed aspect ratio */}
                <div className="absolute inset-0">
                  <img
                    src={movie.poster || '/api/placeholder/400/600'}
                    alt={movie.title}
                    className="w-full h-full object-cover rounded-lg"
                    style={{
                      objectPosition: 'center center'
                    }}
                  />
                </div>
                
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent rounded-lg opacity-90" />
                
                {/* Text Container */}
                <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
                  <h3 className="text-lg font-bold mb-1 text-white truncate" title={movie.title}>
                    {movie.title}
                  </h3>
                  <p className="text-white/90 text-sm">{movie.year}</p>
                </div>
                
                {/* Number indicator */}
                <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary/80 flex items-center justify-center text-white font-bold">
                  {index + 1}
                </div>
              </div>
            </button>
          </div>
        )) : (
          <div className="col-span-5 flex justify-center items-center h-[60vh]">
            <div className="loading loading-spinner loading-lg text-primary"></div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GroupSelection;