console.log('Starting server...');

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

console.log('Modules loaded');

const app = express();
const port = 3001;

console.log('Express app created');

app.use(cors());
app.use(express.json());

app.get('/fetch-movies', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const result = await fetchAllMovies(url);
    res.json(result);
  } catch (error) {
    console.error('Error fetching movies:', error);
    res.status(500).json({ error: 'Failed to fetch movies', debug: error.message });
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
    const posterUrl = posterElement.attr('src');

    console.log("Extracted title:", title);
    console.log("Extracted year:", year);
    console.log("Extracted poster url:", posterUrl);

    // Create a unique identifier using title and year
    const titleSlug = title.toLowerCase().replace(/\s+/g, '-'); // Convert to lowercase and replace spaces with hyphens
    const identifier = `${titleSlug}-${year}`;

    return { title, year, identifier, poster: posterUrl };
  }).get().filter(Boolean);

  console.log(`Found ${movieElements.length} movies on page ${page}`);
  const allMovies = [...accumulatedMovies, ...movieData];
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