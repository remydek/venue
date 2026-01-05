# 3D Real Estate Viewer

A full-screen, interactive 3D web viewer for real estate models built with Unity WebGL.

## Project Structure

```
3d-real-estate-viewer/
├── index.html      # Main HTML with UI overlay
├── styles.css      # Responsive CSS (desktop, tablet, mobile)
├── logo.svg        # Augmento logo
├── WebGL/          # Unity WebGL build
│   ├── Build/      # Compiled Unity files
│   │   ├── WebGL.loader.js
│   │   ├── WebGL.framework.js
│   │   ├── WebGL.wasm
│   │   └── WebGL.data
│   └── StreamingAssets/
└── CLAUDE.md       # This file
```

## Tech Stack

- **Unity WebGL** - 3D rendering engine
- **HTML5 Canvas** - WebGL rendering target
- **JavaScript** - UI interaction and Unity initialization
- **Custom UI Overlay** - Responsive controls and branding

## Features

### 3D Viewer
- Full-screen Unity WebGL viewer
- Interactive 3D real estate model
- Real-time rendering with Unity engine
- Touch and mouse controls
- Mobile-optimized performance

### UI Overlay
- Header with Augmento logo and menu
- Bottom-left project title and "Register Interest" CTA
- Settings panel (gear icon)
- Dev camera controls panel (wrench icon)
- Light controls panel (sun icon)
- Responsive for mobile portrait/landscape
- Frosted glass info popup

### Interactive Elements
- Mobile menu toggle
- Registration form modal
- Settings controls (auto-rotate, bloom, time of day)
- Real-time lighting adjustments
- Developer camera tools

## Usage

1. Ensure your Unity WebGL build is in the `WebGL/` directory
2. Start a local server: `python3 -m http.server 8080`
3. Open `http://localhost:8080`

## Keyboard Shortcuts

- `Esc` - Close modals/panels

## Configuration

### Unity Build
The Unity WebGL build is loaded from the `WebGL/Build/` directory. To update:
1. Build your Unity project for WebGL
2. Replace the contents of the `WebGL/` directory with your new build
3. Ensure the build files maintain the same naming convention:
   - `WebGL.loader.js`
   - `WebGL.framework.js`
   - `WebGL.wasm`
   - `WebGL.data`

### Customizing UI
Modify `index.html` to change:
- Project title in the bottom panel
- Company name and branding
- UI panel controls and settings

### Styling
Edit `styles.css` to adjust:
- Color scheme (primary color: `--primary-color`)
- UI panel positioning
- Responsive breakpoints
- Frosted glass effects

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

WebGL 2.0 required for Unity WebGL runtime.

## Technical Notes

### Unity Integration
- Unity instance is initialized on page load
- Loading progress is tracked and displayed
- UI overlay is positioned above Unity canvas using CSS layers (z-index)
- Unity canvas is full-screen with pointer events enabled
- UI overlay has `pointer-events: none` with selective enabling for interactive elements

### Performance
- Unity WASM provides native-like performance
- Mobile devices automatically adjust canvas size
- UI overlay is GPU-accelerated with backdrop-filter
- Loading screen shows real-time progress

### Development
- Dev panel provides camera controls for fine-tuning
- Light panel allows real-time lighting adjustments
- Settings panel controls auto-rotation and visual effects
- Console error tracking enabled for debugging
