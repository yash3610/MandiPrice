# Smart Mandi Finder

Smart Mandi Finder is a full-stack web app that helps farmers discover the best mandi (market) to sell crops based on modal price.

## Features

- Search by crop name and state (default: Maharashtra)
- Fetches mandi prices from data.gov.in Agmarknet dataset
- Smart scoring with `profitScore = modal_price`
- Top 5 mandi suggestions sorted by best selling opportunity
- Top 1 Best Mandi highlight section
- Price comparison list
- Price sort dropdown (High to Low / Low to High)
- Loading spinner, robust error handling, and responsive modern UI

## Project Structure

- client/index.html
- client/style.css
- client/script.js
- server/server.js

## Prerequisites

- Node.js 18+ (recommended)

## Setup

1. Install dependencies:

   npm install

2. Create your environment file:

   - Copy `.env.example` to `.env`
   - Set values:
     - `DATA_GOV_API_KEY`
     - `DATA_GOV_RESOURCE_ID`

3. Run the app:

   npm start

4. Open in browser:

   http://localhost:3000

## API Notes

Backend endpoint:

- `GET /api/mandis?commodity=Tomato&state=Maharashtra`

Server behavior:

- Calls data.gov.in API
- Filters records by `commodity` and exact `state`
- Converts price fields to numbers
- Computes `profitScore = modal_price`
- Sorts by highest score and returns top 5

## Customization

- To expand results, update `limit` and slicing logic in `server/server.js`.
- To change default state, update input value in `client/index.html`.

## Restriction Compliance

- No login/signup
- No maps/location APIs
- No database
- Simple, fast, and end-to-end working architecture
