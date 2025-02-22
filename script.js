// Initialize the map
const map = L.map('map').setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Variables
let citiesFC = null;         // FeatureCollection for cities
let landMultiPolygon = null; // MultiPolygon for land
let currentShape = null;     // Current drawn shape
let birthMarker = null;      // Marker for birth location
let editableLayers = null;   // Group for editable shapes

// DOM elements
const loadingDiv = document.getElementById('loading');
const infoDiv = document.getElementById('info');
const clearButton = document.getElementById('clear');
const geminiSnippetDiv = document.createElement('div'); // New div for Gemini snippet
geminiSnippetDiv.id = 'gemini-snippet';
infoDiv.parentNode.insertBefore(geminiSnippetDiv, infoDiv.nextSibling);

// Show loading indicator
loadingDiv.style.display = 'block';

// Load data
Promise.all([
    fetch('cities.json').then(response => {
        if (!response.ok) throw new Error('Failed to load cities');
        return response.json();
    }),
    fetch('land-polygons-simplified.geojson').then(response => {
        if (!response.ok) throw new Error('Failed to load land polygons');
        return response.json();
    })
])
.then(([citiesData, landPolygonsData]) => {
    // Create FeatureCollection for cities
    citiesFC = turf.featureCollection(citiesData.map(city =>
        turf.point([city.lng, city.lat], { name: city.name, country: city.country })
    ));

    // Convert GeometryCollection to MultiPolygon
    const polygons = landPolygonsData.geometries
        .filter(geom => geom.type === 'Polygon')
        .map(geom => geom.coordinates);
    landMultiPolygon = turf.multiPolygon(polygons);

    // Hide loading indicator and initialize drawing
    loadingDiv.style.display = 'none';
    initDrawing();
})
.catch(error => {
    console.error('Error loading data:', error);
    loadingDiv.textContent = 'Failed to load data. Please try refreshing.';
});

// Initialize Leaflet Draw control
function initDrawing() {
    editableLayers = new L.FeatureGroup();
    map.addLayer(editableLayers);

    const drawControl = new L.Control.Draw({
        draw: {
            polygon: { shapeOptions: { color: '#3498db' } },
            rectangle: { shapeOptions: { color: '#3498db' } },
            circle: false,
            polyline: false,
            marker: false
        },
        edit: {
            featureGroup: editableLayers,
            remove: false
        }
    });
    map.addControl(drawControl);
    infoDiv.textContent = 'Use the buttons on the left side of the map to draw a shape, then click "Roll" to choose your birth location.';
}

// Handle shape creation
map.on('draw:created', (e) => {
    if (currentShape) {
        editableLayers.removeLayer(currentShape);
        map.removeLayer(currentShape);
    }
    currentShape = e.layer;
    editableLayers.addLayer(currentShape);
    map.addLayer(currentShape);
    infoDiv.textContent = 'Click "Roll" when ready.';
    geminiSnippetDiv.textContent = ''; // Clear previous snippet
});

// Generate random birth location
function generateBirthLocation(shape) {
    const bounds = shape.getBounds();
    const minLat = bounds.getSouth();
    const maxLat = bounds.getNorth();
    const minLng = bounds.getWest();
    const maxLng = bounds.getEast();

    let attempts = 0;
    const maxAttempts = 1000;

    // DEBUG:
    console.log('generateBirthLocation called. Shape bounds:', bounds);

    while (attempts < maxAttempts) {
        const lat = Math.random() * (maxLat - minLat) + minLat;
        const lng = Math.random() * (maxLng - minLng) + minLng;
        const point = turf.point([lng, lat]);

        // DEBUG:
        // Log a few tries to see if it's checking points as expected
        if (attempts < 5) {
            console.log(`Attempt #${attempts}: Checking point`, [lng, lat]);
        }

        if (isPointValid(point, shape)) {
            // DEBUG:
            console.log('Valid birth location found:', [lng, lat]);
            setBirthLocation(point);
            return;
        }
        attempts++;
    }
    infoDiv.textContent = 'Select land instead of water.';
    alert('No land found after ' + maxAttempts + ' attempts. Please adjust your shape.');
}

// Check if point is within shape and on land
function isPointValid(point, shape) {
    // DEBUG:
    const inPolygon = turf.booleanPointInPolygon(point, shape.toGeoJSON());
    const onLand = turf.booleanPointInPolygon(point, landMultiPolygon);
    if (!inPolygon && !onLand) {
        // Only log failures if both are false
        console.log('Point not in user shape or not on land:', point.geometry.coordinates);
    }
    return inPolygon && onLand;
}

// Set birth location and fetch Gemini snippet
async function setBirthLocation(point) {
    const [lng, lat] = point.geometry.coordinates;
    if (birthMarker) map.removeLayer(birthMarker);
    birthMarker = L.marker([lat, lng]).addTo(map);

    const nearest = turf.nearestPoint(point, citiesFC);
    const cityName = nearest.properties.name;
    const countryName = nearest.properties.country; // Retrieve country
    const distance = turf.distance(point, nearest); // Convert km to meters
    infoDiv.textContent = `Born about ${distance.toFixed(0)} kilometers from ${cityName} (${lat.toFixed(3)}, ${lng.toFixed(3)}).`;

    // Zoom to the birth location with a reduced zoom level
    map.setView([lat, lng], 5);

    // Show loading animation for Gemini fetch
    geminiSnippetDiv.textContent = 'Loading life story...';
    geminiSnippetDiv.classList.add('loading');

    // Fetch Gemini snippet
    try {
        // DEBUG:
        console.log('Fetching Gemini snippet for city, country:', cityName, countryName);
        const snippet = await fetchGeminiSnippet(cityName, countryName, distance);

        // DEBUG:
        console.log('Gemini snippet successfully fetched:', snippet);

        // Delay to show the "loading" effect
        setTimeout(() => {
            geminiSnippetDiv.classList.remove('loading');
            geminiSnippetDiv.textContent = snippet;
        }, 3000);

    } catch (error) {
        geminiSnippetDiv.textContent = 'Failed to load snippet.';
        console.error('Gemini API error:', error);
    }
}
// Fetch snippet from Gemini API
async function fetchGeminiSnippet(city, country, distance) {
  const apiKey = 'AIzaSyD0WCfC9Ktlr4tKmuAwM4YyCLjkqe8F09A'; // Replace with your own valid API key

  // The system instruction to guide the model’s behavior
  const systemInstructionText = `
You are given a city name, a country name, distance in kilometers from the center of the city, an adjective, and a date. Write 3-5 sentences, in the second person, explaining the life, from birth to (maybe) death, of a person who grew up there in the last 60 years. Include specific memories and highs and lows of the life, regardless of whether the person overall had a positive or negative life. Make the overall theme wistful. Write creatively and uniquely, and make the details direct, ordinary and realistic, not literary. It should not read like a storybook with a neat ending, nor should it sound like an advertisement. If there are lots of cities with that name in the given country, be generic.

Do not restate the input number of kilometers exactly. Say things like pretty close to, or a long drive from, or not too far from, whatever - just make it sound natural.

Example input: Shanghai, China, 3, positive, 1988

Example output: You were born near the center of Shanghai in 1988. Your mother worked in a radio factory and your father owned a small shop selling and repairing watches. At the age of 14, you finally beat your older cousin in ping-pong while your crush was watching. You got married in 2010 and moved across the river to a fourth-floor apartment in an older building. You work for Huawei now and pick your daughter up from school on the way back from your office.
`;

  // Generate a random year between 1960 and 2005
  const randomYear = Math.floor(Math.random() * (2005 - 1960 + 1)) + 1960;
  const randomSentiment = Math.random() < 0.5 ? 'negative' : 'positive';

  const userPrompt = `${city}, ${country}, ${distance}, ${randomSentiment}, ${randomYear}`;

  console.log('fetchGeminiSnippet called with:', {
    city,
    country,
    randomSentiment,
    randomYear
  });

  // Construct the request body
  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: userPrompt }
        ]
      },
      {
        role: 'user',
        parts: [
          { text: 'INSERT_INPUT_HERE' }
        ]
      }
    ],
    systemInstruction: {
      role: 'user',
      parts: [
        {
          text: systemInstructionText.trim()
        }
      ]
    },
    generationConfig: {
      temperature: 1,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
      responseMimeType: 'text/plain'
    }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

  console.log('Sending POST request to Gemini API:', url);
  console.log('Request body:', requestBody);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  console.log('Gemini API response status:', response.status, response.statusText);

  // Parse the response as JSON
  const data = await response.json();

  // Debug: Print the entire raw JSON to the console
  console.log('Raw response JSON from Gemini:', data);

// Step-by-step parse of the JSON:
const candidate = data.candidates?.[0];
if (!candidate) {
  throw new Error('No "candidates[0]" in Gemini response.');
}

// Note: content is NOT an array—it's an object.
const contentObj = candidate.content;
if (!contentObj) {
  throw new Error('No "candidate.content" object in Gemini response.');
}

// Now "parts" should be an array inside that object.
const partItem = contentObj.parts?.[0];
if (!partItem) {
  throw new Error('No "parts[0]" inside "candidate.content" in Gemini response.');
}

// Finally get text
if (!partItem.text) {
  throw new Error('No "text" property found in the first part.');
}

// Return the text
return partItem.text;
}



// Clear map
clearButton.addEventListener('click', () => {
    if (currentShape) {
        editableLayers.removeLayer(currentShape);
        map.removeLayer(currentShape);
        currentShape = null;
    }
    if (birthMarker) {
        map.removeLayer(birthMarker);
        birthMarker = null;
    }
    infoDiv.textContent = 'Use the buttons on the left side of the map to draw a shape, then click "Roll" to choose your birth location.';
    geminiSnippetDiv.textContent = '';
    map.setView([0, 0], 2);
});

// Add event listeners for submitShape button

document.getElementById('submitShape').addEventListener('click', () => {
    if (currentShape) {
        generateBirthLocation(currentShape);
    } else {
        infoDiv.textContent = 'Please draw a shape first.';
    }
});
