import { NextResponse } from 'next/server';
import axios from 'axios';
import cheerio from 'cheerio';
import { headers } from 'next/headers';

// Helper function to fetch all movies from a Letterboxd list
async function fetchAllMovies(baseUrl, page = 1, accumulatedMovies = []) {
  try {
    // Append '/detail/' to the URL to fetch detailed view
    const detailedUrl = baseUrl.endsWith('/detail/') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/detail/`;
    const pageUrl = page === 1 ? detailedUrl : `${detailedUrl}page/${page}/`;
    console.log(`Fetching page ${page}: ${pageUrl}`);

    const response = await axios.get(pageUrl);
    const html = response.data;
    const $ = cheerio.load(html);

    const movieElements = $('li.film-detail');
    const movieData = [];
    
    movieElements.each((index, element) => {
      const $element = $(element);
      const posterElement = $element.find('.film-poster img');
      const title = posterElement.attr('alt');
      const yearElement = $element.find('small.metadata a');
      const year = yearElement.text().trim();
      
      if (title && year) {
        const titleSlug = title.toLowerCase().replace(/\s+/g, '-');
        const identifier = `${titleSlug}-${year}`;
        
        movieData.push({
          title,
          year,
          identifier,
          poster: null
        });
      }
    });

    // Fetch poster URLs using the OMDb API
    const OMDb_API_KEY = process.env.OMDB_API_KEY;
    if (!OMDb_API_KEY) {
      console.warn('Warning: OMDB_API_KEY is not set in environment variables');
    }

    const movies = [];
    for (const movie of movieData) {
      try {
        if (OMDb_API_KEY) {
          const response = await axios.get(`https://www.omdbapi.com/?t=${encodeURIComponent(movie.title)}&y=${movie.year}&apikey=${OMDb_API_KEY}`);
          const poster = response.data.Poster !== 'N/A' ? response.data.Poster : null;
          movies.push({ ...movie, poster });
        } else {
          movies.push(movie);
        }
      } catch (error) {
        console.error(`Error fetching poster for "${movie.title}": `, error);
        movies.push(movie);
      }
    }

    console.log(`Found ${movieElements.length} movies on page ${page}`);
    const allMovies = [...accumulatedMovies, ...movies];
    console.log(`After page ${page}, total movies: ${allMovies.length}`);

    if (movieElements.length === 100) {
      return fetchAllMovies(baseUrl, page + 1, allMovies);
    } else {
      console.log(`Finished fetching. Total movies: ${allMovies.length}`);
      return { movies: allMovies };
    }
  } catch (error) {
    console.error('Error fetching movies:', error);
    throw error;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ 
        status: 'error',
        message: 'URL is required'
      }, { status: 400 });
    }

    const result = await fetchAllMovies(url);
    
    return NextResponse.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Error in API handler:', error);
    
    return NextResponse.json({ 
      status: 'error',
      message: 'Failed to fetch movies',
      debug: error.message
    }, { status: 500 });
  }
}