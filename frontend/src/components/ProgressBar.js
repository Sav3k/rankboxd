import React from 'react';

const ProgressBar = ({ currentStep }) => {
  const steps = [
    { key: 'input', label: 'Import List' },
    { key: 'mode-selection', label: 'Select Mode' },
    { key: 'instructions', label: 'Instructions' },
    { key: 'ranking', label: 'Compare Movies' },
    { key: 'results', label: 'Final Ranking' }
  ];

  const currentIndex = steps.findIndex(s => s.key === currentStep);

  return (
    <div className="mt-8 mb-8 flex justify-center">
      <div className="relative px-6 py-2 bg-base-200 rounded-full">
        <div className="flex items-center gap-3">
          {steps.map((step, idx) => (
            <React.Fragment key={step.key}>
              <div
                className={`w-2 h-2 rounded-full transition-all duration-300 shrink-0
                  ${idx === currentIndex 
                    ? 'bg-primary scale-125' 
                    : idx < currentIndex 
                      ? 'bg-primary/50' 
                      : 'bg-base-300'}
                  cursor-help`}
                title={step.label}
              />
              {idx === currentIndex && (
                <span 
                  className="text-sm font-medium px-1 opacity-0 animate-[fadeIn_0.3s_ease-out_forwards]"
                >
                  {step.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
      
      {/* Animation is defined in TailwindCSS or globals.css */}
    </div>
  );
};

export default ProgressBar;