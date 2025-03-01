# RankBoxd Development Guide

## Build and Test Commands
```
# Frontend
cd Rankboxd/frontend
npm start              # Start frontend dev server
npm run build          # Build frontend for production
npm test               # Run all tests
npm test src/App.test.js  # Run specific test file

# Backend
cd Rankboxd/backend
npm run dev            # Start backend with nodemon
npm start              # Start backend server
```

## Code Style Guidelines
- **Formatting**: Use consistent 2-space indentation
- **Naming**: camelCase for variables/functions, PascalCase for components
- **React Components**: Prefer functional components with hooks
- **Imports**: Group imports (React, third-party, local)
- **Error Handling**: Use try/catch with descriptive error messages in backend
- **Styling**: Use Tailwind CSS with DaisyUI components
- **State Management**: Use React hooks (useState, useCallback, useMemo)
- **API Calls**: Use axios for HTTP requests
- **Performance**: Memoize expensive calculations and component renders