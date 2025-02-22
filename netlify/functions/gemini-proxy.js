// netlify/functions/gemini-proxy.js
import fetch from 'node-fetch';

export async function handler(event) {
  // Log the incoming event so you can see what's passed from the front end.
  // This won't appear in your browser's DevTools—it's in Netlify's function logs.
  console.log('=== Netlify function triggered ===');
  console.log('HTTP Method:', event.httpMethod);
  console.log('Raw event body:', event.body);

  // 1) Check for OPTIONS (CORS preflight)
  const method = (event.httpMethod || '').toUpperCase();
  if (method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight...');
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',        // Let any domain call this function
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: 'OK'
    };
  }

  try {
    // 2) Parse the incoming JSON from the front end
    //    Expecting something like { city, country, distance }
    const body = JSON.parse(event.body || '{}');
    console.log('Parsed body object:', body);

    const city = body.city;
    const country = body.country;
    const distance = body.distance;

    // 3) Use random values
    const randomYear = Math.floor(Math.random() * (2005 - 1960 + 1)) + 1960;
    const randomSentiment = Math.random() < 0.5 ? 'negative' : 'positive';
    const userPrompt = `${city}, ${country}, ${distance}, ${randomSentiment}, ${randomYear}`;

    console.log('Built userPrompt:', userPrompt);

    // 4) System instruction text
    const systemInstructionText = `
You are given a city name, a country name, distance in kilometers from the center of the city, an adjective, and a date. Write 3-5 sentences, in the second person, explaining the life, from birth to (maybe) death, of a person who grew up there in the last 60 years. ...
    `.trim();

    // 5) Build the request body for Gemini
    const requestBody = {
      contents: [
        { role: 'user', parts: [{ text: userPrompt }] },
        { role: 'user', parts: [{ text: 'INSERT_INPUT_HERE' }] }
      ],
      systemInstruction: {
        role: 'user',
        parts: [{ text: systemInstructionText }]
      },
      generationConfig: {
        temperature: 1,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
        responseMimeType: 'text/plain'
      }
    };

    // 6) Grab Gemini key from Netlify environment
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('No GEMINI_API_KEY in Netlify env variables');
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Missing GEMINI_API_KEY in Netlify environment.' })
      };
    }

    // 7) Send request to Gemini
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    console.log('Sending request to Gemini at URL:', url);

    const geminiResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    console.log('Gemini response status:', geminiResponse.status, geminiResponse.statusText);

    // 8) Parse JSON
    const data = await geminiResponse.json();
    console.log('Gemini response JSON:', data);

    // 9) If it’s not 200-299, handle error
    if (!geminiResponse.ok) {
      console.error('Gemini returned an error:', data);
      return {
        statusCode: geminiResponse.status,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(data)
      };
    }

    // 10) Extract the snippet
    try {
      const candidate = data.candidates?.[0];
      const contentObj = candidate.content;
      const partItem = contentObj.parts?.[0];
      const snippetText = partItem.text;
      console.log('Extracted snippet text:', snippetText);

      // 11) Return the snippet in JSON, with CORS header
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',       // This is crucial!
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ snippet: snippetText })
      };
    } catch (parseErr) {
      console.error('Parsing snippet failed:', parseErr);
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Parsing snippet failed.',
          details: parseErr.message
        })
      };
    }

  } catch (err) {
    console.error('Error in Netlify function main catch:', err);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: err.message })
    };
  }
}
