// index.js
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'strings_db.json');

function loadDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {}; // id -> record
  }
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

const app = express();
app.use(express.json());

const db = loadDB(); // in-memory reference; save on change

// helpers
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function computeProperties(value) {
  const length = [...value].length; // correct for unicode
  const lower = value.toLowerCase().replace(/\s+/g, '');
  const is_palindrome = lower === [...lower].reverse().join('');
  const chars = [...value];
  const freq = {};
  chars.forEach((c) => { freq[c] = (freq[c] || 0) + 1; });
  const unique_characters = Object.keys(freq).length;
  const word_count = value.trim().length === 0 ? 0 : value.trim().split(/\s+/).length;
  const hash = sha256(value);
  return {
    length,
    is_palindrome,
    unique_characters,
    word_count,
    sha256_hash: hash,
    character_frequency_map: freq
  };
}

// POST /strings
app.post('/strings', (req, res) => {
  if (!req.body || !Object.prototype.hasOwnProperty.call(req.body, 'value')) {
    return res.status(400).json({ error: 'Missing "value" field' });
  }
  if (typeof req.body.value !== 'string') {
    return res.status(422).json({ error: '"value" must be a string' });
  }
  const value = req.body.value;
  const id = sha256(value);
  if (db[id]) return res.status(409).json({ error: 'String already exists' });

  const props = computeProperties(value);
  const record = {
    id,
    value,
    properties: props,
    created_at: new Date().toISOString()
  };
  db[id] = record;
  saveDB(db);
  return res.status(201).json(record);
});

// GET /strings/:string_value
app.get('/strings/:string_value', (req, res) => {
  const provided = req.params.string_value;
  // We expect string_value to be the raw string. It might be URL encoded.
  const decoded = decodeURIComponent(provided);
  const id = sha256(decoded);
  if (!db[id]) return res.status(404).json({ error: 'Not found' });
  return res.json(db[id]);
});

// GET /strings (filtering)
app.get('/strings', (req, res) => {
  const {
    is_palindrome,
    min_length,
    max_length,
    word_count,
    contains_character,
    limit = 100,
    offset = 0
  } = req.query;

  let items = Object.values(db);

  if (is_palindrome !== undefined) {
    const bool = is_palindrome === 'true';
    items = items.filter(it => it.properties.is_palindrome === bool);
  }
  if (min_length !== undefined) {
    const min = parseInt(min_length, 10);
    if (Number.isNaN(min)) return res.status(400).json({ error: 'min_length must be integer' });
    items = items.filter(it => it.properties.length >= min);
  }
  if (max_length !== undefined) {
    const max = parseInt(max_length, 10);
    if (Number.isNaN(max)) return res.status(400).json({ error: 'max_length must be integer' });
    items = items.filter(it => it.properties.length <= max);
  }
  if (word_count !== undefined) {
    const wc = parseInt(word_count, 10);
    if (Number.isNaN(wc)) return res.status(400).json({ error: 'word_count must be integer' });
    items = items.filter(it => it.properties.word_count === wc);
  }
  if (contains_character !== undefined) {
    if (contains_character.length !== 1) return res.status(400).json({ error: 'contains_character must be a single character' });
    items = items.filter(it => Object.prototype.hasOwnProperty.call(it.properties.character_frequency_map, contains_character));
  }

  const total = items.length;
  const data = items.slice(Number(offset), Number(offset) + Number(limit));
  return res.json({
    data, count: total,
    filters_applied: {
      is_palindrome, min_length, max_length, word_count, contains_character
    }
  });
});

// Simple natural language parsing heuristics
function parseNLQuery(query) {
  // returns either {error: msg} or {parsed:{...}}
  if (!query || query.trim().length === 0) return { error: 'Empty query' };
  const q = query.toLowerCase();
  const parsed = {};
  if (q.includes('palindrom') || q.includes('palindromic')) parsed.is_palindrome = true;
  if (q.match(/single word|one word/)) parsed.word_count = 1;
  const mLongerThan = q.match(/longer than (\d+)/);
  if (mLongerThan) parsed.min_length = parseInt(mLongerThan[1], 10) + 0;
  const mLonger = q.match(/strings longer than (\d+)/);
  if (mLonger) parsed.min_length = parseInt(mLonger[1], 10);
  const mContainsChar = q.match(/containing the letter (\w)/) || q.match(/contain the letter (\w)/) || q.match(/contains the letter (\w)/);
  if (mContainsChar) parsed.contains_character = mContainsChar[1];
  // simple vowel heuristic
  if (q.includes('first vowel')) parsed.contains_character = 'a';
  return { parsed };
}

// GET /strings/filter-by-natural-language?query=...
app.get('/strings/filter-by-natural-language', (req, res) => {
  const q = req.query.query;
  const parsed = parseNLQuery(q);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  // re-use /strings filtering logic by building a fake req.query
  const fakeReq = { query: parsed.parsed };
  // apply filtering inline:
  let items = Object.values(db);
  if (parsed.parsed.is_palindrome !== undefined) items = items.filter(it => it.properties.is_palindrome === parsed.parsed.is_palindrome);
  if (parsed.parsed.word_count !== undefined) items = items.filter(it => it.properties.word_count === parsed.parsed.word_count);
  if (parsed.parsed.min_length !== undefined) items = items.filter(it => it.properties.length >= parsed.parsed.min_length);
  if (parsed.parsed.contains_character !== undefined) items = items.filter(it => it.properties.character_frequency_map[parsed.parsed.contains_character] !== undefined);
  return res.json({
    data: items,
    count: items.length,
    interpreted_query: {
      original: q,
      parsed_filters: parsed.parsed
    }
  });
});

// DELETE /strings/:string_value
app.delete('/strings/:string_value', (req, res) => {
  const decoded = decodeURIComponent(req.params.string_value);
  const id = sha256(decoded);
  if (!db[id]) return res.status(404).json({ error: 'Not found' });
  delete db[id];
  saveDB(db);
  return res.status(204).send();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`String Analyzer running on port ${PORT}`);
});
