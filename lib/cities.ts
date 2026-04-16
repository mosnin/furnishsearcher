export type City = {
  name: string;
  state: string;
  stateCode: string;
  lat: number;
  lng: number;
  popular?: boolean;
};

export const TOP_CITIES: City[] = [
  { name: "San Diego", state: "California", stateCode: "CA", lat: 32.7157, lng: -117.1611, popular: true },
  { name: "Seattle", state: "Washington", stateCode: "WA", lat: 47.6062, lng: -122.3321, popular: true },
  { name: "Los Angeles", state: "California", stateCode: "CA", lat: 34.0522, lng: -118.2437, popular: true },
  { name: "Boston", state: "Massachusetts", stateCode: "MA", lat: 42.3601, lng: -71.0589, popular: true },
  { name: "San Francisco", state: "California", stateCode: "CA", lat: 37.7749, lng: -122.4194, popular: true },
  { name: "Denver", state: "Colorado", stateCode: "CO", lat: 39.7392, lng: -104.9903, popular: true },
  { name: "Reno", state: "Nevada", stateCode: "NV", lat: 39.5296, lng: -119.8138 },
  { name: "Phoenix", state: "Arizona", stateCode: "AZ", lat: 33.4484, lng: -112.0740, popular: true },
  { name: "Oakland", state: "California", stateCode: "CA", lat: 37.8044, lng: -122.2712 },
  { name: "Atlanta", state: "Georgia", stateCode: "GA", lat: 33.7490, lng: -84.3880, popular: true },
  { name: "San Jose", state: "California", stateCode: "CA", lat: 37.3382, lng: -121.8863 },
  { name: "Portland", state: "Oregon", stateCode: "OR", lat: 45.5051, lng: -122.6750 },
  { name: "New York", state: "New York", stateCode: "NY", lat: 40.7128, lng: -74.0060, popular: true },
  { name: "Washington", state: "District of Columbia", stateCode: "DC", lat: 38.9072, lng: -77.0369, popular: true },
  { name: "Palo Alto", state: "California", stateCode: "CA", lat: 37.4419, lng: -122.1430 },
  { name: "Saint Louis", state: "Missouri", stateCode: "MO", lat: 38.6270, lng: -90.1994 },
  { name: "Tacoma", state: "Washington", stateCode: "WA", lat: 47.2529, lng: -122.4443 },
  { name: "Baltimore", state: "Maryland", stateCode: "MD", lat: 39.2904, lng: -76.6122 },
  { name: "Nashville", state: "Tennessee", stateCode: "TN", lat: 36.1627, lng: -86.7816, popular: true },
  { name: "Sacramento", state: "California", stateCode: "CA", lat: 38.5816, lng: -121.4944 },
  { name: "Boise", state: "Idaho", stateCode: "ID", lat: 43.6150, lng: -116.2023 },
  { name: "Austin", state: "Texas", stateCode: "TX", lat: 30.2672, lng: -97.7431, popular: true },
  { name: "New Orleans", state: "Louisiana", stateCode: "LA", lat: 29.9511, lng: -90.0715 },
  { name: "Arlington", state: "Texas", stateCode: "TX", lat: 32.7357, lng: -97.1081 },
  { name: "Columbia", state: "South Carolina", stateCode: "SC", lat: 34.0007, lng: -81.0348 },
  { name: "Richmond", state: "Virginia", stateCode: "VA", lat: 37.5407, lng: -77.4360 },
  { name: "Tucson", state: "Arizona", stateCode: "AZ", lat: 32.2226, lng: -110.9747 },
  { name: "Honolulu", state: "Hawaii", stateCode: "HI", lat: 21.3069, lng: -157.8583 },
  { name: "Houston", state: "Texas", stateCode: "TX", lat: 29.7604, lng: -95.3698, popular: true },
  { name: "Minneapolis", state: "Minnesota", stateCode: "MN", lat: 44.9778, lng: -93.2650 },
  { name: "Greenville", state: "South Carolina", stateCode: "SC", lat: 34.8526, lng: -82.3940 },
  { name: "Dallas", state: "Texas", stateCode: "TX", lat: 32.7767, lng: -96.7970, popular: true },
  { name: "San Antonio", state: "Texas", stateCode: "TX", lat: 29.4241, lng: -98.4936 },
  { name: "Milwaukee", state: "Wisconsin", stateCode: "WI", lat: 43.0389, lng: -87.9065 },
  { name: "Las Vegas", state: "Nevada", stateCode: "NV", lat: 36.1699, lng: -115.1398, popular: true },
  { name: "Oahu", state: "Hawaii", stateCode: "HI", lat: 21.4389, lng: -158.0001 },
  { name: "Charlottesville", state: "Virginia", stateCode: "VA", lat: 38.0293, lng: -78.4767 },
  { name: "Santa Monica", state: "California", stateCode: "CA", lat: 34.0195, lng: -118.4912 },
  { name: "Charleston", state: "South Carolina", stateCode: "SC", lat: 32.7765, lng: -79.9311 },
  { name: "Asheville", state: "North Carolina", stateCode: "NC", lat: 35.5951, lng: -82.5515 },
  { name: "Chicago", state: "Illinois", stateCode: "IL", lat: 41.8781, lng: -87.6298, popular: true },
  { name: "Chattanooga", state: "Tennessee", stateCode: "TN", lat: 35.0456, lng: -85.3097 },
  { name: "Charlotte", state: "North Carolina", stateCode: "NC", lat: 35.2271, lng: -80.8431 },
  { name: "Albuquerque", state: "New Mexico", stateCode: "NM", lat: 35.0844, lng: -106.6504 },
  { name: "Jacksonville", state: "Florida", stateCode: "FL", lat: 30.3322, lng: -81.6557 },
  { name: "St Petersburg", state: "Florida", stateCode: "FL", lat: 27.7731, lng: -82.6400 },
  { name: "Anchorage", state: "Alaska", stateCode: "AK", lat: 61.2181, lng: -149.9003 },
  { name: "Brooklyn", state: "New York", stateCode: "NY", lat: 40.6782, lng: -73.9442 },
  { name: "Clearwater", state: "Florida", stateCode: "FL", lat: 27.9659, lng: -82.8001 },
  { name: "Columbus", state: "Ohio", stateCode: "OH", lat: 39.9612, lng: -82.9988 },
  { name: "Long Beach", state: "California", stateCode: "CA", lat: 33.7701, lng: -118.1937 },
  { name: "Orlando", state: "Florida", stateCode: "FL", lat: 28.5383, lng: -81.3792 },
  { name: "Miami", state: "Florida", stateCode: "FL", lat: 25.7617, lng: -80.1918, popular: true },
  { name: "Pensacola", state: "Florida", stateCode: "FL", lat: 30.4213, lng: -87.2169 },
  { name: "Sarasota", state: "Florida", stateCode: "FL", lat: 27.3364, lng: -82.5307 },
  { name: "Manhattan", state: "New York", stateCode: "NY", lat: 40.7831, lng: -73.9712 },
  { name: "Hilo", state: "Hawaii", stateCode: "HI", lat: 19.7074, lng: -155.0885 },
  { name: "Fort Lauderdale", state: "Florida", stateCode: "FL", lat: 26.1224, lng: -80.1373 },
  { name: "Scottsdale", state: "Arizona", stateCode: "AZ", lat: 33.4942, lng: -111.9261 },
  { name: "Raleigh", state: "North Carolina", stateCode: "NC", lat: 35.7796, lng: -78.6382 },
  { name: "Indianapolis", state: "Indiana", stateCode: "IN", lat: 39.7684, lng: -86.1581 },
  { name: "Tampa", state: "Florida", stateCode: "FL", lat: 27.9506, lng: -82.4572 },
  { name: "Colorado Springs", state: "Colorado", stateCode: "CO", lat: 38.8339, lng: -104.8214 },
  { name: "Santa Cruz", state: "California", stateCode: "CA", lat: 36.9741, lng: -122.0308 },
  { name: "Salt Lake City", state: "Utah", stateCode: "UT", lat: 40.7608, lng: -111.8910 },
  { name: "Kansas City", state: "Missouri", stateCode: "MO", lat: 39.0997, lng: -94.5786 },
  { name: "Savannah", state: "Georgia", stateCode: "GA", lat: 32.0809, lng: -81.0912 },
  { name: "Bend", state: "Oregon", stateCode: "OR", lat: 44.0582, lng: -121.3153 },
  { name: "Virginia Beach", state: "Virginia", stateCode: "VA", lat: 36.8529, lng: -75.9780 },
  { name: "Santa Clara", state: "California", stateCode: "CA", lat: 37.3541, lng: -121.9552 },
  { name: "Pittsburgh", state: "Pennsylvania", stateCode: "PA", lat: 40.4406, lng: -79.9959 },
  { name: "Bellingham", state: "Washington", stateCode: "WA", lat: 48.7519, lng: -122.4787 },
  { name: "Palm Springs", state: "California", stateCode: "CA", lat: 33.8303, lng: -116.5453 },
  { name: "Madison", state: "Wisconsin", stateCode: "WI", lat: 43.0731, lng: -89.4012 },
  { name: "Jersey City", state: "New Jersey", stateCode: "NJ", lat: 40.7178, lng: -74.0431 },
  { name: "Cleveland", state: "Ohio", stateCode: "OH", lat: 41.4993, lng: -81.6944 },
  { name: "Fort Worth", state: "Texas", stateCode: "TX", lat: 32.7555, lng: -97.3308 },
  { name: "Wilmington", state: "North Carolina", stateCode: "NC", lat: 34.2257, lng: -77.9447 },
  { name: "Philadelphia", state: "Pennsylvania", stateCode: "PA", lat: 39.9526, lng: -75.1652 },
  { name: "Saint Petersburg", state: "Florida", stateCode: "FL", lat: 27.7731, lng: -82.6400 },
  { name: "Encinitas", state: "California", stateCode: "CA", lat: 33.0369, lng: -117.2920 },
  { name: "Cincinnati", state: "Ohio", stateCode: "OH", lat: 39.1031, lng: -84.5120 },
  { name: "Mesa", state: "Arizona", stateCode: "AZ", lat: 33.4152, lng: -111.8315 },
  { name: "Oklahoma City", state: "Oklahoma", stateCode: "OK", lat: 35.4676, lng: -97.5164 },
  { name: "Fort Myers", state: "Florida", stateCode: "FL", lat: 26.6406, lng: -81.8723 },
  { name: "Louisville", state: "Kentucky", stateCode: "KY", lat: 38.2527, lng: -85.7585 },
  { name: "Knoxville", state: "Tennessee", stateCode: "TN", lat: 35.9606, lng: -83.9207 },
  { name: "Santa Fe", state: "New Mexico", stateCode: "NM", lat: 35.6870, lng: -105.9378 },
  { name: "Boulder", state: "Colorado", stateCode: "CO", lat: 40.0150, lng: -105.2705 },
  { name: "Carlsbad", state: "California", stateCode: "CA", lat: 33.1581, lng: -117.3506 },
  { name: "Maui", state: "Hawaii", stateCode: "HI", lat: 20.7984, lng: -156.3319 },
  { name: "Omaha", state: "Nebraska", stateCode: "NE", lat: 41.2565, lng: -95.9345 },
  { name: "Burlington", state: "Vermont", stateCode: "VT", lat: 44.4759, lng: -73.2121 },
  { name: "Rochester", state: "New York", stateCode: "NY", lat: 43.1566, lng: -77.6088 },
  { name: "Santa Barbara", state: "California", stateCode: "CA", lat: 34.4208, lng: -119.6982 },
  { name: "Lexington", state: "Kentucky", stateCode: "KY", lat: 38.0406, lng: -84.5037 },
  { name: "Miami Beach", state: "Florida", stateCode: "FL", lat: 25.7907, lng: -80.1300 },
  { name: "West Palm Beach", state: "Florida", stateCode: "FL", lat: 26.7153, lng: -80.0534 },
  { name: "Flagstaff", state: "Arizona", stateCode: "AZ", lat: 35.1983, lng: -111.6513 },
  { name: "Naples", state: "Florida", stateCode: "FL", lat: 26.1420, lng: -81.7948 },
];

export const STATES = [...new Set(TOP_CITIES.map((c) => c.stateCode))].sort();

export function getCitiesByState(stateCode: string): City[] {
  return TOP_CITIES.filter((c) => c.stateCode === stateCode);
}

export function searchCities(query: string): City[] {
  const q = query.toLowerCase();
  return TOP_CITIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q) ||
      c.stateCode.toLowerCase().includes(q)
  );
}
