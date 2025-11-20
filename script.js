/* script.js — Cleaned & Optimized (Full Replacement)
   Features preserved:
   - ORS (preferred) + OSRM fallback routing
   - Geocoding (Photon -> Nominatim fallback)
   - Save / Load / Share journey (Base64 in URL)
   - Emergency POIs (Overpass)
   - Dijkstra viz, animation, saved places
   - Map theme switcher + UI dark mode
*/

/* ---------------- CONFIG ---------------- */
const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImE0NmY0NGRiMzE1YjRkZTNiN2YyNTc5ZDAzMGE1ODIzIiwiaCI6Im11cm11cjY0In0=";
const ORS_BASE = "https://api.openrouteservice.org";

/* ---------------- MAP INIT ---------------- */
const map = L.map("map", { zoomControl: true }).setView([28.6139, 77.2090], 12);

const tileProviders = {
  osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }),

  carto: L.tileLayer(
    "https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png",
    { attribution: "Carto" }
  ),

  "carto-dark": L.tileLayer(
    "https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png",
    { attribution: "Carto Dark" }
  ),

  satellite: L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles © Esri — Source: Esri, Garmin, NGA, USGS" }
  )
};

tileProviders.osm.addTo(map);

/* ---------------- ICONS ---------------- */
const greenIcon = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-green.png", iconSize: [25,41], iconAnchor:[12,41], shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png", shadowSize:[41,41] });
const redIcon   = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-red.png",   iconSize: [25,41], iconAnchor:[12,41], shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png", shadowSize:[41,41] });
const yellowIcon= L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-yellow.png", iconSize: [25,41], iconAnchor:[12,41], shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png", shadowSize:[41,41] });
const blueIcon  = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-blue.png",  iconSize: [25,41], iconAnchor:[12,41], shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png", shadowSize:[41,41] });

/* ---------------- DOM SELECTORS (safe) ---------------- */
const $ = id => document.getElementById(id);
function safeAdd(id, evt, fn){ const el=$(id); if(el) el.addEventListener(evt, fn); }
function safeText(id, txt){ const el=$(id); if(el) el.innerText = txt; }

const input = $('place-input');
const btnSearch = $('btn-search');
const btnLive = $('btn-live');
const btnSetStart = $('btn-set-start');
const btnSetEnd = $('btn-set-end');
const btnClear = $('btn-clear'); // may be absent
const btnRoute = $('btn-route');
const statusEl = $('status'); // may be absent
const routesList = $('routes-list');
const turnsList = $('turns');
const stats = $('stats');
const emergencyList = $('emergency-list');
const savedSelect = $('saved-places');
const btnSave = $('btn-save'); // may be absent
const btnEmergency = $('btn-emergency');
const mapTheme = $('map-theme');
const toggleTraffic = $('toggle-traffic');
const toggleAnimate = $('toggle-animate');
const toggleDijkstra = $('toggle-dijkstra');
const speedRange = $('speed-range'); // optional
const fabRecenter = $('fab-recenter');
const fabReset = $('fab-reset');
const toggleDark = $('toggle-dark'); // optional checkbox

/* ---------------- APP STATE ---------------- */
let selectedCoords = null; // [lon,lat]
let startCoords = null, endCoords = null;
let selMarker=null, startMarker=null, endMarker=null;
let routeLayers = [], visitedLayer = null;
let routeDataCache = [], savedPlaces = JSON.parse(localStorage.getItem('savedPlaces') || '[]');
let savedJourneys = JSON.parse(localStorage.getItem('savedJourneys') || '[]'); // stores full snapshots
let currentActiveRouteIndex = 0;

/* ---------------- LOGGING ---------------- */
function log(msg){
  console.log('[app]', msg);
  if(statusEl) statusEl.innerText = msg;
}

/* ---------------- HELPERS ---------------- */
function clearRouteLayers(){
  for(const l of routeLayers) if(l && map.hasLayer(l)) map.removeLayer(l);
  routeLayers = [];
  if(visitedLayer && map.hasLayer(visitedLayer)){ map.removeLayer(visitedLayer); visitedLayer = null; }
}
function addLayer(layer){ routeLayers.push(layer); }
function toLatLngs(coords){ return coords.map(c => [c[1], c[0]]); } // geojson coords [[lon,lat],...]
function haversine(a,b){
  const R=6371000, toRad=Math.PI/180;
  const lat1=a[1]*toRad, lat2=b[1]*toRad, dLat=(b[1]-a[1])*toRad, dLon=(b[0]-a[0])*toRad;
  const s = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}

/* ---------------- UI: Saved Journeys Injection (keeps original behavior) ---------------- */
(function injectJourneyUI(){
  try{
    const navRight = document.querySelector('.topbar .nav-right') || document.querySelector('.topbar') || document.body;
    const container = document.createElement('div');
    container.style.display = 'flex'; container.style.gap = '8px'; container.style.alignItems = 'center';

    const btnSaveJourney = document.createElement('button');
    btnSaveJourney.id = 'btn-save-journey';
    btnSaveJourney.innerText = 'Save Journey';
    btnSaveJourney.title = 'Save full route snapshot (geometry + summary)';
    btnSaveJourney.onclick = saveJourney;
    container.appendChild(btnSaveJourney);

    const selSavedJourneys = document.createElement('select');
    selSavedJourneys.id = 'saved-journeys';
    selSavedJourneys.innerHTML = '<option value="">Saved journeys...</option>';
    selSavedJourneys.onchange = ()=> {
      const v = selSavedJourneys.value; if(!v) return;
      const idx = parseInt(v,10); if(isNaN(idx)) return;
      loadSavedJourney(idx);
    };
    container.appendChild(selSavedJourneys);

    const btnShareJourney = document.createElement('button');
    btnShareJourney.id = 'btn-share-journey';
    btnShareJourney.innerText = 'Share';
    btnShareJourney.title = 'Generate shareable link for active journey';
    btnShareJourney.onclick = shareCurrentJourney;
    container.appendChild(btnShareJourney);

    navRight.appendChild(container);

    window.__ui = window.__ui || {};
    window.__ui.selSavedJourneys = selSavedJourneys;
    window.__ui.btnSaveJourney = btnSaveJourney;
    window.__ui.btnShareJourney = btnShareJourney;

    renderSavedJourneysUI();
  }catch(e){
    console.warn('injectJourneyUI failed', e);
  }
})();

/* ---------------- SAVED JOURNEYS STORAGE ---------------- */
function renderSavedJourneysUI(){
  const sel = window.__ui?.selSavedJourneys;
  if(!sel) return;
  sel.innerHTML = '<option value="">Saved journeys...</option>';
  savedJourneys.forEach((j,i)=>{
    const opt = document.createElement('option');
    opt.value = i;
    opt.text = `${j.name} — ${j.type || 'Route'} • ${((j.summary && j.summary.distance) || 0)/1000 .toFixed(2)} km`;
    sel.appendChild(opt);
  });
}
function persistSavedJourneys(){ localStorage.setItem('savedJourneys', JSON.stringify(savedJourneys)); renderSavedJourneysUI(); }

/* ---------------- SAVE / LOAD / SHARE JOURNEY ---------------- */
function saveJourney(){
  if(!routeDataCache || !routeDataCache.length) return alert('No route to save. Compute a route first.');
  const idx = currentActiveRouteIndex || 0;
  const r = routeDataCache[idx];
  if(!r || !r.data) return alert('Active route missing');

  const name = prompt('Name this journey (e.g. Home → College):', `Journey ${new Date().toLocaleString()}`);
  if(!name) return;

  const feat = r.data.features[0];
  const snapshot = {
    name,
    type: r.type || 'Route',
    summary: feat.properties.summary || { distance:0, duration:0 },
    geometry: feat.geometry,
    savedAt: new Date().toISOString()
  };
  savedJourneys.push(snapshot);
  persistSavedJourneys();
  alert('Journey saved locally. Use the dropdown to load or press Share to create a link.');
  log('Saved journey: '+name);
}

function loadSavedJourney(idx){
  const j = savedJourneys[idx];
  if(!j) return alert('Saved journey not found');
  try{
    clearRouteLayers();
    const coords = j.geometry.coordinates;
    const latlngs = toLatLngs(coords);
    const poly = L.polyline(latlngs, { color:'#6b21a8', weight:6 }).addTo(map);
    addLayer(poly);
    map.fitBounds(poly.getBounds(), { padding:[60,60] });

    if(startMarker) startMarker.remove();
    if(endMarker) endMarker.remove();
    startMarker = L.marker([coords[0][1], coords[0][0]], { icon: greenIcon }).addTo(map).bindPopup('Start');
    const last = coords[coords.length-1];
    endMarker = L.marker([last[1], last[0]], { icon: redIcon }).addTo(map).bindPopup('End');

    if(routesList) { routesList.innerHTML = `<div class="route-card active"><strong>${j.name}</strong><br>${j.type} • ${(j.summary.distance/1000).toFixed(2)} km</div>`; }
    if(turnsList) { turnsList.innerHTML = '<li>Loaded from saved snapshot</li>'; }
    if(stats) stats.innerText = `Loaded saved journey • ${j.name}`;
    log('Loaded saved journey: '+j.name);

    routeDataCache = [{ type:j.type, data: { features: [ { properties: { summary: j.summary, segments: [ { steps: [] } ] }, geometry: j.geometry } ] }, color:'#6b21a8' }];
    currentActiveRouteIndex = 0;
  }catch(e){
    alert('Failed to load saved journey: '+(e.message||''));
    console.error(e);
  }
}

function shareCurrentJourney(){
  // prefer selected saved journey
  const sel = window.__ui?.selSavedJourneys;
  if(sel && sel.value){
    const idx = parseInt(sel.value,10);
    if(!isNaN(idx) && savedJourneys[idx]) return generateShareLinkFromSnapshot(savedJourneys[idx]);
  }
  if(!routeDataCache || !routeDataCache.length) return alert('No route to share. Save route first OR compute a route.');
  const r = routeDataCache[currentActiveRouteIndex || 0];
  if(!r || !r.data) return alert('Active route invalid');

  const feat = r.data.features[0];
  const snapshot = {
    name: `Shared ${(new Date()).toLocaleString()}`,
    type: r.type || 'Route',
    summary: feat.properties.summary || { distance:0, duration:0 },
    geometry: feat.geometry,
    sharedAt: (new Date()).toISOString()
  };
  generateShareLinkFromSnapshot(snapshot);
}

function generateShareLinkFromSnapshot(snapshot){
  try{
    const s = JSON.stringify(snapshot);
    const b64 = btoa(unescape(encodeURIComponent(s)));
    const url = new URL(window.location.href.split('?')[0]);
    url.searchParams.set('j', b64);
    navigator.clipboard?.writeText(url.toString()).then(()=> {
      alert('Shareable link copied to clipboard. Paste to share.');
    }).catch(()=> {
      prompt('Shareable link (copy):', url.toString());
    });
    log('Share link generated (length ' + b64.length + ')');
  }catch(e){
    alert('Unable to generate share link: '+(e.message||''));
    console.error(e);
  }
}

/* ---------------- LOAD journey from ?j= param on startup ---------------- */
(function tryLoadSharedJourneyFromURL(){
  try{
    const params = new URLSearchParams(window.location.search);
    const j = params.get('j');
    if(!j) return;
    const json = decodeURIComponent(escape(atob(j)));
    const snapshot = JSON.parse(json);
    setTimeout(()=> {
      if(confirm('A shared journey was detected in the URL. Load it now?')) {
        clearRouteLayers();
        const coords = snapshot.geometry.coordinates;
        const latlngs = toLatLngs(coords);
        const poly = L.polyline(latlngs, { color:'#8b5cf6', weight:6 }).addTo(map);
        addLayer(poly);
        map.fitBounds(poly.getBounds(), { padding:[60,60] });
        if(startMarker) startMarker.remove();
        if(endMarker) endMarker.remove();
        startMarker = L.marker([coords[0][1], coords[0][0]], { icon: greenIcon }).addTo(map).bindPopup('Start');
        const last = coords[coords.length-1];
        endMarker = L.marker([last[1], last[0]], { icon: redIcon }).addTo(map).bindPopup('End');
        if(routesList) routesList.innerHTML = `<div class="route-card active"><strong>${snapshot.name || 'Shared Journey'}</strong><br>${snapshot.type || ''} • ${(snapshot.summary.distance/1000).toFixed(2)} km</div>`;
        if(stats) stats.innerText = `Loaded shared: ${snapshot.name || 'Shared Journey'}`;
        log('Loaded shared journey from URL');
      }
    }, 500);
  }catch(e){
    console.warn('Failed to decode shared journey', e);
  }
})();

/* ---------------- GEOCODING (Photon -> Nominatim) ---------------- */
async function geocode(query){
  if(!query) throw new Error('empty query');
  const ll = query.trim().match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if(ll) return [parseFloat(ll[2]), parseFloat(ll[1])]; // [lon,lat]

  try{
    const purl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`;
    const r = await fetch(purl);
    if(r.ok){ const j = await r.json(); if(j.features && j.features.length) return j.features[0].geometry.coordinates; }
  }catch(e){
    console.warn('photon failed', e);
  }

  const nom = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
  const rn = await fetch(nom);
  if(!rn.ok) throw new Error('Nominatim failed');
  const jn = await rn.json();
  if(jn && jn.length) return [parseFloat(jn[0].lon), parseFloat(jn[0].lat)];
  throw new Error('Place not found');
}

/* ---------------- BIND SEARCH / MAP CLICK / LIVE ---------------- */
if(btnSearch) btnSearch.addEventListener('click', async () => {
  try{
    const q = input?.value?.trim();
    if(!q) return alert('Enter a place');
    log('Searching...');
    const coords = await geocode(q);
    selectedCoords = coords;
    if(selMarker) selMarker.remove();
    selMarker = L.marker([coords[1], coords[0]], {icon: yellowIcon}).addTo(map).bindPopup(q).openPopup();
    map.setView([coords[1], coords[0]], 14);
    log('Found: '+coords[1].toFixed(6)+', '+coords[0].toFixed(6));
  }catch(err){ alert(err.message||'Search failed'); log('Search failed'); }
});

map.on('click', e=>{
  selectedCoords = [e.latlng.lng, e.latlng.lat];
  if(selMarker) selMarker.remove();
  selMarker = L.marker([selectedCoords[1], selectedCoords[0]], {icon: yellowIcon}).addTo(map).bindPopup('Selected').openPopup();
  if(input) input.value = `${selectedCoords[1].toFixed(6)}, ${selectedCoords[0].toFixed(6)}`;
  log('Selected: '+(input?.value || `${selectedCoords[1]},${selectedCoords[0]}`));
});

if(btnLive) btnLive.addEventListener('click', ()=>{
  if(!navigator.geolocation) return alert('Geolocation unsupported');
  navigator.geolocation.getCurrentPosition(pos=>{
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    selectedCoords = [lon, lat];
    map.setView([lat, lon], 14);
    if(selMarker) selMarker.remove();
    selMarker = L.marker([lat, lon], {icon: blueIcon}).addTo(map).bindPopup('📍 Live Location').openPopup();
    if(input) input.value = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    log('Live location selected');
  }, err => alert('Unable to fetch location: '+err.message));
});

/* ---------------- Set Start / End / Clear ---------------- */
if(btnSetStart) btnSetStart.addEventListener('click', ()=>{
  if(!selectedCoords) return alert('Select a location first');
  startCoords = selectedCoords.slice();
  if(startMarker) startMarker.remove();
  startMarker = L.marker([startCoords[1], startCoords[0]], {icon: greenIcon}).addTo(map).bindPopup('Start').openPopup();
  log('Start set');
});
if(btnSetEnd) btnSetEnd.addEventListener('click', ()=>{
  if(!selectedCoords) return alert('Select a location first');
  endCoords = selectedCoords.slice();
  if(endMarker) endMarker.remove();
  endMarker = L.marker([endCoords[1], endCoords[0]], {icon: redIcon}).addTo(map).bindPopup('End').openPopup();
  log('End set');
});
if(btnClear) btnClear.addEventListener('click', ()=>{
  selectedCoords = startCoords = endCoords = null;
  [selMarker, startMarker, endMarker].forEach(m=>m && m.remove());
  clearRouteLayers();
  if(routesList) routesList.innerHTML = ''; if(turnsList) turnsList.innerHTML = ''; if(stats) stats.innerText = 'No route yet';
  log('Cleared');
});

/* ---------------- Saved Places UI ---------------- */
function refreshSavedSelectUI(){
  if(!savedSelect) return;
  savedSelect.innerHTML = '';
  const opt = document.createElement('option'); opt.text = 'Saved...'; opt.value = ''; savedSelect.appendChild(opt);
  savedPlaces.forEach((s,i)=>{ const o = document.createElement('option'); o.text = s.name; o.value = i; savedSelect.appendChild(o); });
}
if(btnSave) btnSave.addEventListener('click', ()=>{
  if(!selectedCoords) return alert('Select a location first to save');
  const name = prompt('Place name (Home/Work):', 'Saved Place'); if(!name) return;
  savedPlaces.push({name, coords:selectedCoords});
  localStorage.setItem('savedPlaces', JSON.stringify(savedPlaces));
  refreshSavedSelectUI(); log('Saved place');
});
if(savedSelect) savedSelect.addEventListener('change', ()=>{
  const idx = savedSelect.value; if(idx==='') return;
  const s = savedPlaces[idx];
  if(!s) return;
  selectedCoords = s.coords.slice();
  if(selMarker) selMarker.remove();
  selMarker = L.marker([selectedCoords[1], selectedCoords[0]], {icon: yellowIcon}).addTo(map).bindPopup(s.name).openPopup();
  map.setView([selectedCoords[1], selectedCoords[0]], 14);
});

/* ---------------- Emergency POIs (Overpass) ---------------- */
if(btnEmergency) btnEmergency.addEventListener('click', async ()=>{
  try{
    const center = selectedCoords || startCoords;
    if(!center) return alert('Select area or set start');
    const [lng, lat] = center; log('Fetching emergency POIs...');
    const radius = 5000;
    const query = `[out:json][timeout:25];(node["amenity"="hospital"](around:${radius},${lat},${lng});node["amenity"="police"](around:${radius},${lat},${lng});node["emergency"="fire_station"](around:${radius},${lat},${lng}););out body;`;
    const res = await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body: query });
    if(!res.ok) throw new Error('Overpass failed: '+res.status);
    const j = await res.json();
    if(!j.elements||!j.elements.length){ if(emergencyList) emergencyList.innerText='No emergency POIs'; log('No emergency POIs'); return; }
    if(emergencyList) emergencyList.innerHTML = '';
    j.elements.forEach(e=>{
      const name = e.tags && (e.tags.name||e.tags.operator) || 'Unknown';
      const type = e.tags && (e.tags.amenity||e.tags.emergency) || '';
      const div = document.createElement('div'); div.className='poi'; div.innerHTML=`<strong>${name}</strong><br/><small>${type}</small>`;
      div.onclick = ()=>{ selectedCoords=[e.lon,e.lat]; if(selMarker) selMarker.remove(); selMarker = L.marker([e.lat,e.lon],{icon:yellowIcon}).addTo(map).bindPopup(name).openPopup(); if(input) input.value = `${e.lat.toFixed(6)}, ${e.lon.toFixed(6)}`; };
      emergencyList.appendChild(div);
      L.circleMarker([e.lat,e.lon], {radius:6, color:'#e63946'}).addTo(map).bindPopup(name);
    });
    log('Emergency POIs loaded');
  }catch(err){ alert('Overpass error: '+(err.message||'')); log('Emergency failed'); }
});

/* ---------------- ROUTING (ORS preferred, OSRM fallback) ---------------- */
async function fetchORSRoute(startLngLat, endLngLat, preference='fastest'){
  if(!ORS_API_KEY) throw new Error('Missing ORS API key');
  const url = `${ORS_BASE}/v2/directions/driving-car/geojson`;
  const body = { coordinates: [startLngLat, endLngLat], instructions: true, preference };
  const res = await fetch(url, { method:'POST', headers:{ 'Authorization': ORS_API_KEY, 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  if(!res.ok) throw new Error('ORS route failed: '+res.status);
  return await res.json();
}
async function fetchOSRMRoute(startLngLat, endLngLat){
  const url = `https://router.project-osrm.org/route/v1/driving/${startLngLat[0]},${startLngLat[1]};${endLngLat[0]},${endLngLat[1]}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('OSRM failed: '+res.status);
  const j = await res.json();
  if(!j.routes || !j.routes.length) throw new Error('No OSRM route');
  const route = j.routes[0];
  return {
    type:'FeatureCollection',
    features:[{
      type:'Feature',
      properties: { summary: { distance: route.distance, duration: route.duration }, segments: [{ steps: route.legs.flatMap(leg=>leg.steps) }] },
      geometry: { type:'LineString', coordinates: route.geometry.coordinates }
    }]
  };
}

async function computeRoutes(){
  if(!startCoords || !endCoords) return alert('Set start and end');
  log('Requesting routes...');
  if(routesList) routesList.innerHTML = ''; if(turnsList) turnsList.innerHTML = ''; if(stats) stats.innerText = 'Calculating...';
  routeDataCache = [];
  const s = startCoords, e = endCoords;
  try{
    let fastest, shortest;
    try{
      fastest = await fetchORSRoute(s,e,'fastest');
      shortest = await fetchORSRoute(s,e,'shortest');
    }catch(orsErr){
      log('ORS failed - OSRM fallback: ' + (orsErr.message||orsErr));
      const osr = await fetchOSRMRoute(s,e);
      fastest = shortest = osr;
    }
    const distFast = fastest.features[0].properties.summary.distance;
    const distShort = shortest.features[0].properties.summary.distance;
    const eco = (distFast <= distShort) ? fastest : shortest;
    routeDataCache = [
      { type:'Fastest', data: fastest, color:'#2b6ef6' },
      { type:'Shortest', data: shortest, color:'#06d6a0' },
      { type:'Eco', data: eco, color:'#ffb703' }
    ];
    renderRoutes(routeDataCache);
    log('Routes loaded');
  }catch(err){ alert('Routing error: ' + (err.message||'')); log('Routing failed'); }
}

/* ---------------- RENDER ROUTES ---------------- */
function renderRoutes(routes){
  clearRouteLayers();
  if(routesList) routesList.innerHTML = '';

  routes.forEach((r, idx)=>{
    try{
      const coords = r.data.features[0].geometry.coordinates;
      const latlngs = toLatLngs(coords);
      const poly = L.polyline(latlngs, { color:r.color, weight:(r.type==='Eco'?6:4), opacity:0.95 }).addTo(map);
      addLayer(poly);

      if(routesList){
        const sum = r.data.features[0].properties.summary;
        const card = document.createElement('div'); card.className='route-card';
        card.innerHTML = `<strong>${r.type}</strong><br>Distance: ${(sum.distance/1000).toFixed(2)} km • Time: ${(sum.duration/60).toFixed(1)} min`;
        card.onclick = async ()=>{
          document.querySelectorAll('#routes-list .route-card').forEach(c=>c.classList.remove('active'));
          card.classList.add('active');
          currentActiveRouteIndex = idx;
          displayTurns(r.data.features[0]);
          map.fitBounds(poly.getBounds(), { padding:[60,60] });
          // Emphasize active polyline
          poly.setStyle({ weight: 8, opacity: 1 });
          // Reduce other polylines
          routeLayers.forEach(layer => { if(layer!==poly && layer.setStyle) layer.setStyle({ opacity:0.5, weight:4 }); });
          if(toggleAnimate && toggleAnimate.checked) await animatePolyline(poly);
        };
        routesList.appendChild(card);
        if(idx===0){ card.click(); }
      }
    }catch(e){
      console.warn('renderRoutes: error on route', e);
    }
  });

  const main = routes[0].data.features[0].properties.summary;
  if(stats) stats.innerText = `Routes: ${routes.length} • Primary Distance ${(main.distance/1000).toFixed(2)} km • Time ${(main.duration/60).toFixed(1)} min`;
}

/* ---------------- DISPLAY TURNS ---------------- */
function displayTurns(feature){
  if(!turnsList) return;
  turnsList.innerHTML = '';
  const segments = feature.properties.segments || [];
  segments.forEach(seg=>{
    (seg.steps||[]).forEach(step=>{
      const li = document.createElement('li');
      const instr = step.instruction || step.name || (step.maneuver && step.maneuver.type) || 'Proceed';
      li.innerHTML = `${instr} <small> • ${(step.distance/1000).toFixed(2)} km</small>`;
      turnsList.appendChild(li);
    });
  });
}

/* ---------------- ANIMATE POLYLINE ---------------- */
function animatePolyline(poly){
  return new Promise(resolve=>{
    const latlngs = poly.getLatLngs();
    const anim = L.polyline([], { color: poly.options.color, weight: poly.options.weight+1 }).addTo(map);
    let i=0;
    const speed = speedRange ? parseInt(speedRange.value||60,10) : 60;
    const stepMs = Math.max(5, 200 - speed);
    const id = setInterval(()=>{
      if(i>=latlngs.length){ clearInterval(id); // replace original poly with final anim
        try{ map.removeLayer(poly); addLayer(anim); }catch(e){}
        resolve(); return;
      }
      anim.addLatLng(latlngs[i]); i++;
    }, stepMs);
  });
}

/* ---------------- DIJKSTRA VISUALIZATION ---------------- */
function showDijkstra(feature){
  if(toggleDijkstra && !toggleDijkstra.checked) return;
  try{
    const coords = feature.geometry.coordinates;
    const n = coords.length;
    if(n < 2) return;
    const adj = Array.from({length:n}, ()=>[]);
    for(let i=0;i<n-1;i++){ const d=haversine(coords[i],coords[i+1]); adj[i].push({to:i+1,w:d}); adj[i+1].push({to:i,w:d}); }

    const dist = Array(n).fill(Infinity), parent = Array(n).fill(-1); dist[0]=0;
    const pq = new TinyPQ(); pq.push(0,0);
    const visited = [];
    while(!pq.empty()){
      const u = pq.pop();
      visited.push(u);
      if(u===n-1) break;
      for(const e of adj[u]){
        const v = e.to, w = e.w;
        if(dist[u] + w < dist[v]){ dist[v] = dist[u] + w; parent[v] = u; pq.push(v, dist[v]); }
      }
    }

    const pathIdx=[]; let cur=n-1; while(cur!==-1){ pathIdx.push(cur); cur=parent[cur]; } pathIdx.reverse();

    const visitedPts = visited.map(i=>[coords[i][1], coords[i][0]]);
    if(visitedLayer && map.hasLayer(visitedLayer)) map.removeLayer(visitedLayer);
    visitedLayer = L.featureGroup(visitedPts.map(p=>L.circleMarker(p,{radius:3,color:'#ffd166'}))).addTo(map);

    const bestCoords = pathIdx.map(i=>[coords[i][1], coords[i][0]]);
    const best = L.polyline(bestCoords, { color:'#ff3b3b', weight:5 }).addTo(map);
    addLayer(best);
  }catch(e){
    console.warn('showDijkstra failed', e);
  }
}

/* Tiny priority queue for Dijkstra */
class TinyPQ{ constructor(){ this.arr=[]; } push(i,pr){ this.arr.push({i,pr}); this.arr.sort((a,b)=>a.pr-b.pr);} pop(){ return this.arr.shift().i; } empty(){ return this.arr.length===0; } }

/* ---------------- MAIN BUTTONS ---------------- */
if(btnRoute) btnRoute.addEventListener('click', async ()=>{
  if(!startCoords || !endCoords) return alert('Set both start and end');
  log('Computing routes...');
  try{ await computeRoutes(); if(routeDataCache[0]) showDijkstra(routeDataCache[0].data.features[0]); }catch(e){ alert('Routing error: '+(e.message||'')); log('Routing failed'); }
});
if(fabRecenter) fabRecenter.addEventListener('click', ()=>{ if(selMarker) map.setView(selMarker.getLatLng(),14); else map.setView([28.6139,77.2090],12); });
if(fabReset) fabReset.addEventListener('click', ()=>{ if(btnClear) btnClear.click(); });

/* ---------------- INIT saved UI & persisted data ---------------- */
function refreshSavedUI(){ if(!savedSelect) return; savedSelect.innerHTML=''; const opt=document.createElement('option'); opt.text='Saved...'; opt.value=''; savedSelect.appendChild(opt); savedPlaces.forEach((s,i)=>{ const o=document.createElement('option'); o.text=s.name; o.value=i; savedSelect.appendChild(o); }); }
refreshSavedUI(); renderSavedJourneysUI();
log('App ready — Save Journey and Share features available');

/* ---------------- MAP THEME SWITCHER + UI DARK MODE ---------------- */
if (mapTheme) {
  mapTheme.addEventListener("change", () => {
    const theme = mapTheme.value;

    // Remove all active layers
    Object.values(tileProviders).forEach(layer => {
      try { if (map.hasLayer(layer)) map.removeLayer(layer); } catch {}
    });

    // Add selected tile layer
    if (tileProviders[theme]) {
      tileProviders[theme].addTo(map);
    } else {
      tileProviders["osm"].addTo(map);
    }

    // UI dark mode sync
    if (theme === "carto-dark") {
      document.body.classList.add("dark-mode");
      if (toggleDark) toggleDark.checked = true;
    } else {
      document.body.classList.remove("dark-mode");
      if (toggleDark) toggleDark.checked = false;
    }
  });
}


/* ---------------- TOGGLE-DARK manual checkbox hookup (keeps UI consistent) ---------------- */
if(toggleDark){
  toggleDark.addEventListener('change', () => {
    if(toggleDark.checked) {
      document.body.classList.add('dark-mode');
      // Also set map-theme select if present
      if(mapTheme) { mapTheme.value = 'carto-dark'; mapTheme.dispatchEvent(new Event('change')); }
    } else {
      document.body.classList.remove('dark-mode');
      if(mapTheme) { if(mapTheme.value === 'carto-dark') { mapTheme.value = 'osm'; mapTheme.dispatchEvent(new Event('change')); } }
    }
  });
}

/* ---------------- SAFETY: missing UI elements handling ---------------- */
/* speedRange or other elements might be absent on your HTML; the code above checks existence before using them */

/* ---------------- END OF FILE ---------------- */
