# METAR Lens

METAR Lens is a web aviation weather dashboard (METAR + TAF + runway tools) with a backend-powered 10-character short-link sharing system.

## Features
- Airport search by name, IATA, ICAO
- Live METAR + TAF parsing and charts
- Runway wind components and best-runway analysis
- Smart warnings, turbulence/icing estimates
- ATIS-style weather output
- Favorites in local storage
- Sharing:
  - Copy as text
  - Share as link

## Data Sources
- NOAA Aviation Weather API
- OurAirports data

## Android
The Android WebView wrapper is in `android-app/` and can use the same web assets.

## TODO
- Add working short link system with expiry and backend storage
- Add other features
- Optimize