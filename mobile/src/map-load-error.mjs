// Explain what is known without exposing locations or guessing that a failed
// request means the device is offline. Unknown provider errors stay generic.
export function mapLoadError(error) {
  switch (error?.code) {
    case 'timeout': return { es: 'La descarga de edificios tardó demasiado. Toca para reintentar.', en: 'Building download took too long. Tap to retry.' };
    case 'network': return { es: 'No se ha podido conectar para cargar edificios. Toca para reintentar.', en: 'Could not connect to load buildings. Tap to retry.' };
    case 'service': return { es: 'La fuente de edificios no está disponible ahora. Toca para reintentar.', en: 'The building data source is unavailable. Tap to retry.' };
    case 'incomplete': return { es: 'Los datos de edificios han llegado incompletos. Toca para reintentar.', en: 'The building data is incomplete. Tap to retry.' };
    default: return { es: 'No se han podido cargar los edificios. Toca para reintentar.', en: 'Could not load buildings. Tap to retry.' };
  }
}
