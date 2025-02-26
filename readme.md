# RankBoxd

A personal web application for ranking movies through pairwise comparisons, inspired by Letterboxd.

![RankBoxd Screenshot](https://via.placeholder.com/800x450?text=RankBoxd+Screenshot)

## What is RankBoxd?

RankBoxd helps you create your perfect movie ranking list by comparing films in pairs. Instead of manually sorting a list, you simply choose which movie you prefer in each pair, and the app uses a sophisticated algorithm to determine your complete ranking.

## How to Use

### 1. Import Your Movie List

1. Go to [Letterboxd](https://letterboxd.com/) and find a list of movies you want to rank
2. Copy the URL of the list (e.g., `https://letterboxd.com/username/list/list-name/`)
3. Paste the URL into RankBoxd's import field
4. Click "Start Ranking"

### 2. Choose Your Ranking Mode

Select one of three ranking modes:
- **Quick Mode**: Fewer comparisons, faster results, less precision
- **Balanced Mode**: Good balance between speed and accuracy
- **Thorough Mode**: Most accurate rankings, but requires more comparisons

### 3. Compare Movies

- You'll be presented with pairs of movies
- For each pair, select the movie you prefer
- Use keyboard shortcuts for faster comparison:
  - Left arrow or 1: Choose left movie
  - Right arrow or 2: Choose right movie
  - U key: Undo last choice
- Pay attention to "High Impact" comparisons (marked with an amber indicator)

### 4. View Your Results

- Once you've completed enough comparisons, you'll see your final ranked list
- Click "Show Stats" on any movie to see detailed information:
  - Win rate
  - Number of comparisons
  - Confidence score
  - Performance against similarly ranked movies
- Use the "Export" button to download your rankings as a CSV file

## Features

- Import movies from any Letterboxd list
- Sophisticated ranking algorithm based on ELO ratings
- Adaptive comparison selection that minimizes the number of needed comparisons
- Detailed statistics about each movie's performance
- Clean, responsive UI with smooth animations
- Early termination when consistent rankings are achieved

## Technology

Built with React, Node.js, Express, Tailwind CSS, and DaisyUI.

---

*Note: This is a personal project and is not affiliated with Letterboxd. Generative AI was used in the creation of this project.*