import axios from 'axios';
import cheerio from 'cheerio';
import cors from 'cors';

// Initialize CORS middleware
const corsMiddleware = cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGIN || '*'
    : '*'
});

// Helper function to run middleware
const runMiddleware = (req, res, fn) => {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
};

async function fetchAllMovies(baseUrl, page = 1, accumulatedMovies = []) {
  // Append '/detail/' to the URL to fetch detailed view
  const detailedUrl = baseUrl.endsWith('/detail/') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/detail/`;
  const pageUrl = page === 1 ? detailedUrl : `${detailedUrl}page/${page}/`;
  console.log(`Fetching page ${page}: ${pageUrl}`);

  const response = await axios.get(pageUrl);
  const html = response.data;
  const $ = cheerio.load(html);

  const movieElements = $('li.film-detail');
  const movieData = movieElements.map((index, element) => {
    const $element = $(element);
    const posterElement = $element.find('.film-poster img');
    const title = posterElement.attr('alt');
    const yearElement = $element.find('small.metadata a');
    const year = yearElement.text().trim();
    const titleSlug = title.toLowerCase().replace(/\s+/g, '-');
    const identifier = `${titleSlug}-${year}`;

    return {
      title,
      year,
      identifier,
      poster: null
    };
  }).get().filter(Boolean);

  // Fetch poster URLs using the OMDb API
  const OMDb_API_KEY = process.env.OMDB_API_KEY;
    if (!OMDb_API_KEY) {
    console.warn('Warning: OMDB_API_KEY is not set in environment variables');
    }

    const posterPromises = movieData.map(async (movie) => {
    try {
        const response = await axios.get(`https://www.omdbapi.com/?t=${encodeURIComponent(movie.title)}&y=${movie.year}&apikey=${OMDb_API_KEY}`);
        const poster = response.data.Poster !== 'N/A' ? response.data.Poster : null;
        return { ...movie, poster };
    } catch (error) {
        console.error(`Error fetching poster for "${movie.title}": `, error);
        return movie;
    }
    });

  const movies = await Promise.all(posterPromises);

  console.log(`Found ${movieElements.length} movies on page ${page}`);
  const allMovies = [...accumulatedMovies, ...movies];
  console.log(`After page ${page}, total movies: ${allMovies.length}`);

  if (movieElements.length === 100) {
    return fetchAllMovies(baseUrl, page + 1, allMovies);
  } else {
    console.log(`Finished fetching. Total movies: ${allMovies.length}`);
    return { movies: allMovies };
  }
}

export default async function handler(req, res) {
  // Run the CORS middleware
  await runMiddleware(req, res, corsMiddleware);
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      status: 'error',
      message: 'Method not allowed'
    });
  }

  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ 
      status: 'error',
      message: 'URL is required'
    });
  }

  try {
    const result = await fetchAllMovies(url);
    console.log('Sample movie data:', result.movies.slice(0, 2));
    
    return res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Error fetching movies:', error);
    
    return res.status(500).json({ 
      status: 'error',
      message: 'Failed to fetch movies',
      debug: error.message 
    });
  }
}