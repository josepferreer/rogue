// Simulador de GPS para probar el seguimiento de rutas sin salir a la calle.
//
// NO es un script de node: se pega en la consola del navegador con la app
// abierta. Sustituye `navigator.geolocation` por uno falso que camina sobre la
// ruta que tengas en pantalla.
//
// USO
//   1. Abre una ruta guardada (/app/cardio/ruta/<id>) y espera a que cargue el mapa.
//   2. Pega este fichero entero en la consola.
//   3. simRuta()                      -> pasea la ruta entera a 5 km/h
//      simRuta({ kmh: 11 })           -> corriendo
//      simRuta({ desvio: [2500, 3200, 90] })  -> obra: se aparta 90 m entre el
//                                                metro 2500 y el 3200
//      simRuta({ pausa: [1000, 1600] })       -> tunel/pausa: sin señal entre
//                                                esos dos metros
//   4. Dale a "Repetir esta ruta". El paseo arranca solo.
//   5. simParar() para restaurar el GPS y el reloj de verdad.
//
// POR QUÉ FALSEA TAMBIÉN EL RELOJ
// La app mide la duración con Date.now(), no con los timestamps del GPS. Si
// solo se acelerase el GPS, recorrer 7 km en 90 segundos daría un ritmo
// absurdo. Acelerando los dos sobre el MISMO eje, la app calcula un ritmo
// realista (5 km/h -> 12'00"/km) aunque tú lo veas 60 veces más rápido.
//
// OJO: al terminar, la ruta se guarda en tu historial de verdad (y se va
// volcando a Supabase MIENTRAS grabas, no solo al final). Usa el botón de
// descartar de la pantalla de seguimiento.

(() => {
  const R = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dist = (a, b) => {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  /** Saca la ruta pintada leyendo las props del componente del mapa. */
  function leerRuta() {
    const fiberDe = (el) => {
      for (const k in el) if (k.startsWith("__reactFiber$")) return el[k];
      return null;
    };
    const esCoords = (v) =>
      Array.isArray(v) && v.length > 20 && v[0] && typeof v[0].lat === "number";
    // El ÚLTIMO mapa del DOM: con el seguimiento abierto hay dos, y el de la
    // ficha se queda debajo.
    const mapas = [...document.querySelectorAll(".maplibregl-map")];
    for (const cont of mapas.reverse()) {
      let f = fiberDe(cont), s = 0;
      while (f && s < 40) {
        const p = f.memoizedProps;
        if (p) for (const v of Object.values(p)) if (esCoords(v)) return v;
        f = f.return; s++;
      }
    }
    return null;
  }

  window.simRuta = function simRuta(opts = {}) {
    const { kmh = 5, x = 60, tick = 150, desvio = null, pausa = null } = opts;
    if (window.__simParar) window.__simParar();

    const cruda = leerRuta();
    if (!cruda) return "No encuentro la ruta. ¿Está cargado el mapa?";
    const ruta = cruda.map((c) => ({ lat: c.lat, lng: c.lng }));

    const acum = [0];
    for (let i = 1; i < ruta.length; i++) acum.push(acum[i - 1] + dist(ruta[i - 1], ruta[i]));
    const total = acum[acum.length - 1];

    const mLat = 110540, mLng = 111320 * Math.cos(rad(ruta[0].lat));

    // Reloj acelerado, compartido con los timestamps del GPS.
    const real0 = performance.now(), fake0 = Date.now(), NowOrig = Date.now;
    Date.now = () => fake0 + (performance.now() - real0) * x;

    function puntoA(m) {
      if (m >= total) return { ...ruta[ruta.length - 1], fin: true };
      let i = 1; while (acum[i] < m) i++;
      const t = (m - acum[i - 1]) / (acum[i] - acum[i - 1] || 1);
      const a = ruta[i - 1], b = ruta[i];
      let lat = a.lat + (b.lat - a.lat) * t, lng = a.lng + (b.lng - a.lng) * t;
      if (desvio && m > desvio[0] && m < desvio[1]) {
        // Perpendicular al rumbo local: parece la calle de al lado.
        const dx = (b.lng - a.lng) * mLng, dy = (b.lat - a.lat) * mLat;
        const n = Math.hypot(dx, dy) || 1;
        lat += (dx / n) * desvio[2] / mLat;
        lng += (-dy / n) * desvio[2] / mLng;
      }
      return { lat, lng, fin: false };
    }

    const geoOrig = navigator.geolocation;
    let sig = 1; const timers = {};
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition(ok) {
          const id = sig++, t0 = Date.now();
          timers[id] = setInterval(() => {
            const m = Math.min(total, (kmh / 3.6) * ((Date.now() - t0) / 1000));
            const p = puntoA(m);
            window.simEstado = { metros: Math.round(m), pct: +(100 * m / total).toFixed(1), fin: p.fin };
            // En el tramo de "pausa" simplemente no se emite nada: es lo que
            // hace un tunel o la app suspendida.
            const mudo = pausa && m > pausa[0] && m < pausa[1];
            if (!mudo) {
              ok({
                coords: { latitude: p.lat, longitude: p.lng, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: kmh / 3.6 },
                timestamp: Date.now(),
              });
            }
            if (p.fin) { clearInterval(timers[id]); delete timers[id]; }
          }, tick);
          return id;
        },
        clearWatch(id) { clearInterval(timers[id]); delete timers[id]; },
        getCurrentPosition(ok) {
          const p = puntoA(window.simEstado?.metros ?? 0);
          ok({ coords: { latitude: p.lat, longitude: p.lng, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: 0 }, timestamp: Date.now() });
        },
      },
    });

    window.__simParar = () => {
      Object.values(timers).forEach(clearInterval);
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: geoOrig });
      Date.now = NowOrig;
      delete window.__simParar;
      return "GPS y reloj restaurados.";
    };
    window.simParar = () => (window.__simParar ? window.__simParar() : "No había simulación.");

    return `Listo: ${(total / 1000).toFixed(2)} km a ${kmh} km/h, ${x}x (~${Math.round(total / (kmh / 3.6) / x)} s reales).` +
      (desvio ? ` Desvío de ${desvio[2]} m entre ${desvio[0]} y ${desvio[1]}.` : "") +
      (pausa ? ` Sin señal entre ${pausa[0]} y ${pausa[1]}.` : "") +
      ` Ahora dale a "Repetir esta ruta".`;
  };

  console.log('Simulador cargado. Usa simRuta() y simParar(). Progreso en window.simEstado');
})();
