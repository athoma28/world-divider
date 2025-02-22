// netlify/functions/gemini-proxy.js
import fetch from 'node-fetch';

export async function handler(event) {
  // 1) Handle OPTIONS (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: 'OK'
    };
  }

  try {
    // 2) Parse the incoming JSON from the front end
    //    Expecting something like { city, country, distance }
    const body = JSON.parse(event.body);

    const city = body.city;
    const country = body.country;
    const distance = body.distance;

    // 3) Use random values for a negative/positive year
    const randomYear = Math.floor(Math.random() * (2005 - 1960 + 1)) + 1960;
    const randomSentiment = Math.random() < 0.5 ? 'negative' : 'positive';

    // 4) Build the user prompt
    const userPrompt = `${city}, ${country}, ${distance}, ${randomSentiment}, ${randomYear}`;

    // 5) System instruction text
    const systemInstructionText = `
You are given a city name, a country name, distance in kilometers from the center of the city, an adjective, and a date. Write 3-5 sentences, in the second person, explaining the life, from birth to (maybe) death, of a person who grew up there in the last 60 years. Include specific memories and highs and lows of the life, regardless of whether the person overall had a positive or negative life. Make the overall theme wistful. Write creatively and uniquely, and make the details direct, ordinary and realistic, not literary. It should not read like a storybook with a neat ending, nor should it sound like an advertisement. If there are lots of cities with that name in the given country, be generic.

Do not restate the input number of kilometers exactly. Say things like pretty close to, or a long drive from, or not too far from, whatever - just make it sound natural.

Example input: Shanghai, China, 3, positive, 1988

Example output: You were born near the center of Shanghai in 1988. Your mother worked in a radio factory and your father owned a small shop selling and repairing watches. At the age of 14, you finally beat your older cousin in ping-pong while your crush was watching. You got married in 2010 and moved across the river to a fourth-floor apartment in an older building. You work for Huawei now and pick your daughter up from school on the way back from your office.
    `.trim();

    // 6) Build the request body for Gemini
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

    // 7) Read your Gemini API key from Netlify environment
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Missing GEMINI_API_KEY in Netlify environment.' })
      };
    }

    // 8) Send request to Gemini
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    const geminiResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    // 9) Parse JSON from Gemini
    const data = await geminiResponse.json();

    // 10) If Gemini returned an error, handle it
    if (!geminiResponse.ok) {
      console.error('Gemini error:', data);
      return {
        statusCode: geminiResponse.status,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(data)
      };
    }

    // 11) Extract text snippet
    try {
      const candidate = data.candidates?.[0];
      const contentObj = candidate.content;
      const partItem = contentObj.parts?.[0];
      const snippetText = partItem.text;

      // 12) Return snippet in JSON, with CORS header
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
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
    // Catch any other error in the function
    console.error('Error in Netlify function:', err);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: err.message })
    };
  }
}
