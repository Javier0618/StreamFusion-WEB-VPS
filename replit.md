# StreamFusion

## Overview
StreamFusion is a Spanish-language streaming entertainment platform that aggregates content from various streaming services (Netflix, Disney+, HBO Max, Prime Video, Paramount+). It displays movies, series, anime, and K-dramas using The Movie Database (TMDB) API for content data and Firebase for user authentication and settings.

## Project Architecture
This is a **static website** built with vanilla HTML, CSS, and JavaScript:

```
/
├── index.html          # Main HTML page with all views
├── style/
│   └── styles.css      # All styling
├── js/
│   ├── config.js       # Firebase and TMDB API configuration
│   ├── script.js       # Main application logic
│   └── script.block.js # Additional functionality
└── replit.md           # This file
```

## Technologies
- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6 modules)
- **Authentication**: Firebase Auth (Google sign-in supported)
- **Data Source**: The Movie Database (TMDB) API
- **Backend Services**: Firebase Firestore for user data and settings

## Running the Project
The project is served as static files using Python's HTTP server on port 5000.

## Deployment
Configured for static deployment - no build step required.

## Recent Changes (December 2024)

### Sticky Video Player for Desktop Modals (December 19, 2024)
**New Feature:**
- Implemented sticky video player functionality for movie and series detail modals on desktop (min-width: 768px)
- Video player stays fixed at the top of the viewport when users scroll through modal content
- Automatically applies padding to content sections to prevent overlap with the sticky player
- Smooth transition between sticky and relative positioning based on scroll position

**Implementation:**
- Added `setupStickyVideoPlayer()` function that detects scroll in `.modal-container`
- When scroll exceeds 5px threshold, `.desktop-player-section` gets `position: fixed` class
- `.detail-content-new` receives dynamic padding equal to player height + 20px
- Uses passive event listeners for optimal scroll performance
- Works for both movies (full-width player) and series (65% player width) layouts
- Mobile behavior unchanged - video remains responsive at top of modal

**CSS Changes:**
- Added `.sticky-player` class with `position: fixed`, `top: 0`, `left: 0`, `right: 0`, `width: 100%`
- Series layout maintains flex gap and sizing even when fixed
- Z-index: 50 ensures player stays above content

**JavaScript Changes:**
- `renderModalContent()` calls `setupStickyVideoPlayer()` on desktop resize
- Scroll listener on `.modal-container` manages sticky state transitions
- Dynamic padding adjustment prevents content overlap

### Management Section UI & Stability Improvements (December 18, 2024)
**Bug Fixes:**
- Fixed Management section not loading consistently (sporadic failures when navigating from User Profile)
- Improved error handling in `loadAllImportedContent()` function with proper error messages
- Added validation checks for `isAdmin` status and `allContent` data availability
- Function now waits for content to load if `allContent` is empty, preventing silent failures

**UI Improvements:**
- Edit and Delete buttons are now always visible and centered directly on poster images (no hover required)
- Added semi-transparent dark background with blur effect for better button visibility
- Improved button styling with hover effects (color change and scale animation)
- Better visual feedback with darker overlay on hover
- Fixed CSS positioning issues with `.grid-poster-wrapper` overflow property

**Swipe Navigation Improvements:**
- Excluded the entire Home section from horizontal swipe navigation to prevent accidental section changes
- Added exclusions for all sliders and content rows on home page (Top 10, Recently Added, Categories, etc.)
- Users can now swipe horizontally within sliders without triggering section navigation
- Swipe navigation remains active for Movies, Series, Animes, and Doramas sections

**Navigation Active State & Infinite Scroll Fix (December 19, 2024):**
- Fixed bug where Home section remained marked as active when navigating to other sections via swipe
- Added missing `classList.add("active")` to nav links and bottom nav items in home case of `navigateToView()`
- **FINAL FIX - Click and Swipe Navigation Unified:** Completely eliminated race conditions between click and swipe navigation
  - Removed caching of `navLinks` and `bottomNavItems` variables - now using `document.querySelectorAll()` dynamically in each event listener
  - Event listeners now only call `navigateToView()` without manipulating classes - `navigateToView()` is the sole controller
  - Added `isNavigating` flag to prevent multiple simultaneous navigation calls (prevents race conditions in webview)
  - Wrapped entire `navigateToView()` function in try-finally block to guarantee cleanup of the `isNavigating` flag
  - Added missing `.bottom-nav-item[data-section="doramas"]` activation in doramas case
- **Result:** Click and swipe now function as ONE unified system - whichever action occurs last completely overrides previous active states
- Swipe navigation now works identically to click navigation with proper progressive loading
- Both click and swipe methods maintain consistent section indices for seamless transitions
- Swipe navigation now increments correctly by one section at a time (no skipped sections)

**Implementation Details:**
- `loadAllImportedContent()` now calls `loadAllContent()` async if data isn't available yet
- Added fallback messages for admin-only access and error states
- Improved spinner management with proper finally blocks
- Enhanced error logging for debugging management section issues
- Swipe navigation now checks if home-view is active before allowing swipe detection
- Added exclusions for `.content-slider`, `.slider-container`, and `.content-row` elements
- Home case in `navigateToView()` now properly activates nav links and bottom nav items

### Horizontal Swipe Navigation (December 18, 2024)
Implemented full horizontal swipe navigation system for mobile/touch devices:

**Features:**
- Users can now swipe left/right to navigate between main sections (Inicio → Películas → Series → Animes → Doramas)
- Swipe left to go to the next section
- Swipe right to go to the previous section
- Smart edge constraints:
  - Swiping LEFT when at the beginning (Inicio) has no effect
  - Swiping RIGHT when at the end (Doramas) has no effect
- Smooth fade transitions between sections (0.3s)
- Touch detection with 50px minimum swipe threshold
- Prevents accidental swipes during text input
- Single-touch gesture detection to avoid multi-touch conflicts
- Auto-scroll to top when switching sections
- System tracks current section to maintain state correctly

**Implementation Details:**
- Swipe detection uses touchstart/touchend events
- Uses CSS `display: none/block` control via `.active` class (respeta la estructura CSS existente)
- Integración perfecta con la animación `fadeIn` del CSS (0.5s)
- Animation lock previene múltiples swipes simultáneos
- Sincronización automática con navegación por clics mediante MutationObserver
- Scroll suave al top de la página en cada transición
- **Exclusiones del swipe**: bottom-nav y categorías-section
- **Umbral aumentado a 100px**: Menos sensible a toques accidentales
- **Filtrado de categorías**: Funciona correctamente en Películas, Series, Animes, Doramas

### Quick Action Cards and Stats Improvements (December 18, 2024)
Added visual improvements across User Profile, Admin Panel, and Management Panel:

**User Profile:**
- Quick Action Cards for: Mi Lista, Mensajes, Configuración, Información
- Gradient icons with hover effects and active state

**Admin Panel:**
- Quick Action Cards for: Usuarios, Mensajes
- Improved Stats Cards with gradient icons (registered users, active users)
- Grid layout for stats with responsive design

**Management Panel:**
- Quick Action Cards for: Agregar, Gestionar, Inicio, Modal
- Gradient icons with different colors per section

**Responsive Design:**
- Mobile (max-width: 768px): Compact cards, smaller icons, single column stats
- Desktop (min-width: 768px): Larger cards, bigger icons, two column stats

**Synchronization:**
- Quick Action Cards sync with hidden tabs
- Active state highlighted on both card and corresponding tab
- Event listeners handle bidirectional sync

### Desktop Modal Redesign (min-width: 768px)
The movie and series detail modals now have a responsive desktop layout:

**Movies (Desktop):**
- Video player centered at the top (full width)
- Below: Two-column layout with poster on left, info on right
- Info section includes: title with save button, rating with vote count, year, runtime, genre tags, synopsis, director, and cast with circular profile images
- Related content grid at the bottom (6 columns)

**Series (Desktop):**
- Top section: Video player on left (65%), seasons/episodes panel on right (35%)
- Seasons panel shows: season tabs (T1, T2, etc.), episode count, scrollable episode list with thumbnails
- Below: Two-column layout with poster on left, info on right
- Info includes: title, rating, year, seasons count, status badge, genre tags, synopsis, creators, cast
- Related content grid at the bottom

**Mobile (max-width: 768px):**
- Keeps original mobile-first layout unchanged
- Video player fixed at top
- Title, rating, genres inline
- Season tabs and episode buttons in horizontal carousel
- Cast in horizontal scrollable list

### Key Functions
- `renderModalContent()` - Main function that renders movie/series detail modals with responsive layouts
- `setupStickyVideoPlayer()` - NEW: Sets up scroll listener for sticky player behavior on desktop
- `renderEpisodesCarousel()` - Renders episode buttons for mobile
- `renderEpisodesDesktop()` - Renders episode items with thumbnails for desktop
- `attachEpisodeClickListeners()` - Handles mobile episode selection
- `attachDesktopEpisodeListeners()` - Handles desktop season/episode selection
- `attachDesktopEpisodeItemListeners()` - Handles desktop episode item clicks
