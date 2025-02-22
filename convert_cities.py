import json
import csv

# Input and output files
cities_file = 'cities1000.txt'  # From cities1000.zip
country_file = 'countryInfo.txt'  # From GeoNames
output_file = 'cities.json'

# Step 1: Load country names from countryInfo.txt into a dictionary
country_map = {}
with open(country_file, 'r', encoding='utf-8') as f:
    for line in f:
        # Skip comment lines starting with '#'
        if line.startswith('#'):
            continue
        columns = line.strip().split('\t')
        if len(columns) < 5:  # Ensure there are enough columns
            continue
        iso_code = columns[0]  # Column 0: ISO country code
        country_name = columns[4]  # Column 4: English country name
        country_map[iso_code] = country_name

# Step 2: Process cities from cities1000.txt
cities = []
with open(cities_file, 'r', encoding='utf-8') as f:
    reader = csv.reader(f, delimiter='\t')
    for columns in reader:
        # Ensure the line has enough columns
        if int(columns[14]) < 5000:
            continue
        if len(columns) < 15:
            continue

        # Extract relevant fields
        name = columns[1]  # City name
        try:
            lat = float(columns[4])  # Latitude
            lng = float(columns[5])  # Longitude
            population = int(columns[14]) if columns[14] else 0  # Population (0 if empty)
            iso_code = columns[8]  # ISO country code
        except (ValueError, IndexError):
            continue  # Skip if conversion fails or data is missing

        # Get English country name from the map
        print(iso_code, int(columns[14]))
        country = country_map.get(iso_code, "Unknown")  # Default to "Unknown" if not found

        # Add city data to the list
        cities.append({
            "name": name,
            "lat": lat,
            "lng": lng,
            "population": population,
            "country": country
        })

# Step 3: Write to JSON file
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(cities, f, indent=2, ensure_ascii=False)

print(f"Converted {len(cities)} cities to {output_file}")