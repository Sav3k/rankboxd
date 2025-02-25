console.log('Starting server...');

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

console.log('Modules loaded');

const app = express();
const port = 3001;
const OMDb_API_KEY = '9b95cc86';

console.log('Express app created');

app.use(cors());
app.use(express.json());

app.get('/fetch-movies', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ 
      status: 'error',
      message: 'URL is required'
    });
  }

  try {
    const result = await fetchAllMovies(url);
    console.log('Sample movie data:', result.movies.slice(0, 2)); // Remove .data here
    res.json({
      status: 'success',
      data: result  // The result already contains the movies array
    });
  } catch (error) {
    console.error('Error fetching movies:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to fetch movies',
      debug: error.message 
    });
  }
});

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
      poster: null //'https://images.desenio.com/zoom/17469_1.jpg'  // Initialize the poster property
    };
  }).get().filter(Boolean);

// Fetch poster URLs using the OMDb API
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
  const allMovies = [...accumulatedMovies, ...movies];  // Use 'movies' from posterPromises
  console.log(`After page ${page}, total movies: ${allMovies.length}`);

  if (movieElements.length === 100) {
    return fetchAllMovies(baseUrl, page + 1, allMovies);
  } else {
    console.log(`Finished fetching. Total movies: ${allMovies.length}`);
    return { movies: allMovies };
  }
}

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});

console.log('Server setup complete');