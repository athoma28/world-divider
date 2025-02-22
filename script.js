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
// This is your new function that calls the Netlify proxy
async function fetchGeminiSnippet(city, country, distance) {
  // The Netlify function endpoint:
  // Replace <YOUR_NETLIFY_SUBDOMAIN> with your actual netlify subdomain
  // or your custom domain if you set one up.
  const NETLIFY_FUNCTION_URL = 'https://<YOUR_NETLIFY_SUBDOMAIN>.netlify.app/.netlify/functions/gemini-proxy';

  const requestBody = {
    city: city,
    country: country,
    distance: distance
  };

  try {
    // POST to your Netlify function
    const response = await fetch(NETLIFY_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
      // If there's a server-side error or Gemini error, log or handle it
      console.error('Netlify function error:', data);
      throw new Error(data.error || 'Failed to fetch snippet.');
    }

    // data.snippet is what we returned from the function
    return data.snippet;

  } catch (err) {
    console.error('Error fetching snippet from Netlify function:', err);
    throw err;
  }
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
