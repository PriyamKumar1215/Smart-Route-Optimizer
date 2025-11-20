# 🚀 Smart Route Optimizer  
A powerful and interactive web-based mapping application that helps users find optimized routes, analyze paths, explore nearby emergency services, visualize algorithms, and switch between multiple map modes including Satellite view.

Built using Leaflet.js, OpenRouteService, OSRM, Overpass API, and modern front-end components.

---

## 🌟 Features

### 🗺️ Multi-Map Themes
- OSM (default)
- Carto Light
- Carto Dark (auto UI dark mode)
- Satellite View (ESRI Imagery)

### 📍 Geolocation & Search
- Search any place by name
- Automatic placement of markers
- Live GPS tracking

### 🚦 Advanced Routing
- Fastest, Shortest, and Eco-friendly routes
- Distance & duration comparison
- Select and highlight preferred route
- OSRM fallback routing

### 💾 Journey Management
- Save a full journey snapshot
- Load saved journeys anytime
- Share journey via encoded URL

### 🚨 Emergency Services Radar
Fetch nearby POIs:
- Hospitals
- Police Stations
- Fire Stations
- Pharmacies

### 🧠 Algorithm Visualization
- Dijkstra Visualization
- Animated path exploration
- Speed control slider

### ▶️ Route Animation
- Animate marker movement on route
- Adjustable speed

---

## 🧩 Tech Stack

### Frontend
- HTML5, CSS3, JavaScript
- Leaflet.js

### APIs / Data Providers
- OpenRouteService API
- OSRM
- Overpass API
- ESRI Imagery (Satellite)
- OpenStreetMap Tiles

---

## 📂 Project Structure

Smart-Route-Optimizer/
│
├── index.html
├── style.css
├── script.js
├── README.md
└── assets/ (optional)

---

## 🚀 How to Run Locally

1. Open the folder:
   cd Smart-Route-Optimizer

2. Open index.html in any browser:
   - Double click it
   - OR start a server using:
     npx serve .

---

## 🔧 Environment Notes

To use OpenRouteService, replace the placeholder API key in script.js:

const ORS_API_KEY = "YOUR_KEY_HERE";

Get a free key here:  
https://openrouteservice.org/

---

## 🌍 Deployment (GitHub Pages)

1. Go to **Settings → Pages**
2. Select **Deploy from Branch**
3. Choose:
   - Branch: main
   - Folder: /root
4. Save

Your live site will appear at:

https://PriyamKumar1215.github.io/Smart-Route-Optimizer/

---

## 🖼️ Preview Screenshot

(Add your own screenshot)

![App Preview](assets/preview.png)

---

## 📜 License
This project is licensed under the MIT License, allowing anyone to use, modify, and distribute your code with attribution.

---

## 🤝 Contributing
Feel free to open issues or submit pull requests to improve the project.

---

## ⭐ Show Your Support
If you like this project, give it a star ⭐ on GitHub — it helps support and grow the project.

