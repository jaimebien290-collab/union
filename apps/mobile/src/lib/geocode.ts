// Adresses françaises via le géocodage de la Géoplateforme (successeur de l'API Adresse / BAN, §9.1).
// Gratuit, sans clé. Seul le texte tapé (ou le point touché sur la carte) est envoyé.

const BASE = 'https://data.geopf.fr/geocodage';

export type Place = {
  /** Nom court du lieu, modifiable par l'organisateur (« Stade Serzian »). */
  name: string;
  address: string;
  lat: number;
  lng: number;
};

type Feature = { geometry: { coordinates: [number, number] }; properties: { label: string; name: string } };

const toPlace = (feature: Feature): Place => ({
  name: feature.properties.name,
  address: feature.properties.label,
  lng: feature.geometry.coordinates[0],
  lat: feature.geometry.coordinates[1],
});

async function get(path: string, params: Record<string, string | number>): Promise<Place[]> {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const response = await fetch(`${BASE}/${path}?${query}`);
  if (!response.ok) return [];
  const json = (await response.json()) as { features?: Feature[] };
  return (json.features ?? []).map(toPlace);
}

/** Autocomplétion ; `near` favorise les résultats proches du campus. */
export function searchPlaces(text: string, near?: { lat: number; lng: number }) {
  if (text.trim().length < 3) return Promise.resolve([]);
  return get('search', { q: text.trim(), limit: 5, autocomplete: 1, ...(near ? { lat: near.lat, lon: near.lng } : {}) });
}

/** Adresse la plus proche d'un point posé sur la carte. Sans résultat, on garde le point seul. */
export async function reversePlace(lat: number, lng: number): Promise<Place> {
  const [place] = await get('reverse', { lat, lon: lng, limit: 1 }).catch(() => []);
  return place ? { ...place, lat, lng } : { name: 'Point sur la carte', address: '', lat, lng };
}

// Passage du lieu choisi de l'écran « Choisir un lieu » vers le formulaire qui l'a ouvert.
let listener: ((place: Place) => void) | null = null;

export function onPlacePicked(callback: (place: Place) => void) {
  listener = callback;
  return () => {
    if (listener === callback) listener = null;
  };
}

export const emitPlacePicked = (place: Place) => listener?.(place);
