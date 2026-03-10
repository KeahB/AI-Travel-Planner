export async function searchLocation(query: string) {
  const response = await fetch(`/api/location/search?query=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error('Failed to fetch location from OSM');
  }
  return response.json();
}

export async function searchWiki(query: string) {
  const response = await fetch(`/api/wiki/search?query=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error('Failed to fetch info from Wikipedia');
  }
  return response.json();
}
