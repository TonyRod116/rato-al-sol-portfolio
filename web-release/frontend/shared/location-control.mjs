// Request location only after an explicit tap. A later city selection cancels
// any pending result so an old permission prompt cannot move the map back.
export function createLocationControl({ button, status, geolocation, onFound, showMessage }) {
  let request = 0;

  const show = (es, en) => {
    status.hidden = false;
    showMessage(status, es, en);
  };

  function cancel() {
    request++;
    button.disabled = false;
    status.hidden = true;
  }

  function start() {
    let service;
    try { service = geolocation(); } catch { service = null; }
    if (!service?.getCurrentPosition) {
      show('Tu navegador no ofrece ubicación. Elige Madrid o Barcelona en el selector.', 'Your browser does not provide location. Choose Madrid or Barcelona in the selector.');
      return;
    }
    const current = ++request;
    button.disabled = true;
    show('Buscando tu ubicación…', 'Finding your location…');
    const fail = (error) => {
      if (current !== request) return;
      button.disabled = false;
      if (error?.code === 1) show('Permite la ubicación en tu navegador o elige Madrid o Barcelona.', 'Allow location in your browser or choose Madrid or Barcelona.');
      else show('No hemos podido obtener tu ubicación. Elige Madrid o Barcelona o inténtalo de nuevo.', 'Could not find your location. Choose Madrid or Barcelona, or try again.');
    };
    try {
      service.getCurrentPosition(({ coords }) => {
        if (current !== request) return;
        const { latitude, longitude } = coords || {};
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) return fail();
        button.disabled = false;
        const withinMainCoverage = onFound({ lat: latitude, lng: longitude });
        if (withinMainCoverage === false) show('Mapa centrado en tu ubicación. Fuera de Madrid y Barcelona, la cobertura de datos puede variar.', 'Map centred on your location. Data coverage may vary outside Madrid and Barcelona.');
        else show('Mapa centrado en tu ubicación. Puedes buscar lugares cercanos.', 'Map centred on your location. You can search for nearby places.');
      }, fail, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    } catch { fail(); }
  }

  return { start, cancel };
}
