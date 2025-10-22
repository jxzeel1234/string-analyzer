# String Analyzer Service (Backend Wizards — Stage 1)

Simple Node.js + Express REST API that analyzes strings and stores computed properties.

## Endpoints
- POST /strings
- GET /strings/:string_value
- GET /strings (with filtering query params: is_palindrome, min_length, max_length, word_count, contains_character)
- GET /strings/filter-by-natural-language?query=...
- DELETE /strings/:string_value

## Run locally
1. node >= 18 recommended
2. npm install
3. npm start
4. Server starts on http://localhost:3000

## Deploy (Railway)
- Add repo to Railway, ensure `Procfile` exists with `web: npm start`.
- Or deploy via Railway CLI.

## Tests (curl examples)
See below.

## Notes
- Uses `strings_db.json` for simple persistence.
- Natural language parsing is heuristic-based for common sample phrases.
