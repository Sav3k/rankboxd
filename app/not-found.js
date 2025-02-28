export default function NotFound() {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <h1 className="text-4xl font-crimson font-bold mb-4">404 - Page Not Found</h1>
        <p className="text-base-content/70 mb-8">The page you're looking for doesn't exist or has been moved.</p>
        <a href="/" className="btn btn-primary">Return Home</a>
      </div>
    );
  }