/**
 * Mobile Video Rotation Handler
 * Detecta rotación y entra fullscreen automáticamente
 */

import { ScreenOrientation } from "https://cdn.jsdelivr.net/npm/@capacitor/screen-orientation@8.0.0/+esm";
import { StatusBar } from "https://cdn.jsdelivr.net/npm/@capacitor/status-bar@5.0.0/+esm";

let lastOrientation = window.innerWidth > window.innerHeight ? "landscape" : "portrait";

// Función para encontrar el video que está reproduciéndose
function findPlayingVideo() {
  const videos = document.querySelectorAll("video");
  for (let video of videos) {
    if (!video.paused && video.offsetParent !== null) {
      return video;
    }
  }
  return null;
}

// Función para entrar fullscreen
function enterFullscreen() {
  const video = findPlayingVideo();
  if (!video) return;

  console.log("🎬 Entrando fullscreen automático");
  
  if (video.requestFullscreen) {
    video.requestFullscreen().catch(e => console.log("Error fullscreen:", e));
  } else if (video.webkitEnterFullscreen) {
    video.webkitEnterFullscreen();
  } else if (video.webkitRequestFullScreen) {
    video.webkitRequestFullScreen();
  }
}

// Manejar cambios de fullscreen
document.addEventListener("fullscreenchange", async () => {
  const isFullscreen = !!document.fullscreenElement;
  console.log(`📺 Fullscreen: ${isFullscreen}`);

  try {
    if (isFullscreen) {
      // Entrando en fullscreen
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.hide();
      await ScreenOrientation.lock({ orientation: "landscape" });
      console.log("🔒 Bloqueado en landscape");
    } else {
      // Saliendo de fullscreen
      await ScreenOrientation.lock({ orientation: "portrait" });
      await StatusBar.show();
      await StatusBar.setOverlaysWebView({ overlay: false });
      console.log("🔓 Desbloqueado a portrait");
    }
  } catch (error) {
    console.log("No se pudo cambiar orientación:", error);
  }
});

// Detector de rotación - El principal
window.addEventListener("orientationchange", () => {
  const isLandscape = window.innerWidth > window.innerHeight;
  const orientation = isLandscape ? "landscape" : "portrait";
  
  console.log(`📱 Rotación detectada: ${orientation} (${window.innerWidth}x${window.innerHeight})`);

  // Si rotó a landscape y hay un video reproduciéndose
  if (isLandscape && lastOrientation !== "landscape") {
    const video = findPlayingVideo();
    if (video && !document.fullscreenElement) {
      console.log("▶️ Video encontrado - Fullscreen automático");
      setTimeout(() => enterFullscreen(), 300);
    }
  }

  lastOrientation = orientation;
});

// También escuchar resize para cambios de tamaño
window.addEventListener("resize", () => {
  const isLandscape = window.innerWidth > window.innerHeight;
  const currentOrientation = isLandscape ? "landscape" : "portrait";

  if (currentOrientation !== lastOrientation) {
    const video = findPlayingVideo();
    if (isLandscape && video && !document.fullscreenElement) {
      console.log("📐 Resize a landscape - Fullscreen automático");
      setTimeout(() => enterFullscreen(), 300);
    }
    lastOrientation = currentOrientation;
  }
});

// Setup de videos dinámicamente
function setupVideos() {
  const setupVideo = (video) => {
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("controls", "");
    video.style.width = "100%";
    video.style.height = "auto";

    // Click en video = fullscreen
    video.addEventListener("click", (e) => {
      console.log("📺 Click en video");
      enterFullscreen();
    });

    // Cuando empieza a reproducir en landscape
    video.addEventListener("play", () => {
      console.log("▶️ Play detectado");
      if (window.innerWidth > window.innerHeight && !document.fullscreenElement) {
        setTimeout(() => enterFullscreen(), 500);
      }
    });
  };

  // Videos existentes
  document.querySelectorAll("video:not([data-setup])").forEach((video) => {
    video.setAttribute("data-setup", "true");
    setupVideo(video);
  });

  // Videos que se creen dinámicamente (en modales)
  const observer = new MutationObserver(() => {
    document.querySelectorAll("video:not([data-setup])").forEach((video) => {
      video.setAttribute("data-setup", "true");
      setupVideo(video);
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Inicializar cuando esté listo
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setupVideos();
    console.log("✅ Mobile Video Handler Ready");
  });
} else {
  setupVideos();
  console.log("✅ Mobile Video Handler Ready");
}

// Manejar botón atrás Android
try {
  const { App } = await import("https://cdn.jsdelivr.net/npm/@capacitor/app@8.0.0/+esm");
  App.addListener("backButton", () => {
    console.log("📱 Back button pressed, currentView:", window.currentView);
    
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    
    // PRIMERO: Verificar si hay un modal de detalles abierto
    const modalContainer = document.getElementById("movie-details-modal-container");
    if (modalContainer && modalContainer.innerHTML.trim() !== "") {
      console.log("📱 Modal abierto, cerrando...");
      modalContainer.innerHTML = "";
      document.body.classList.remove("modal-open");
      return;
    }
    
    // SEGUNDO: Verificar otros modales visibles
    const visibleModals = document.querySelectorAll(
      "[id*='modal'][style*='display: block'], [id*='modal'].open, [id*='modal'].visible"
    );
    if (visibleModals.length > 0) {
      console.log("📱 Modal visible encontrado, cerrando...");
      visibleModals.forEach(modal => {
        modal.style.display = "none";
        modal.classList.remove("open", "visible");
      });
      return;
    }
    
    // TERCERO: Navegar entre vistas
    // Si está en una vista que no es home, volver a home o a la vista anterior
    if (window.currentView && window.currentView !== "home") {
      // Intentar usar navigateToView si está disponible
      if (typeof window.navigateToView === "function") {
        window.navigateToView(window.previousView || "home");
        console.log("📱 Navegando a vista anterior:", window.previousView || "home");
      } else {
        console.log("navigateToView no disponible, usando history.back()");
        window.history.back();
      }
    } else {
      // Si está en home, permitir que se cierre la aplicación
      console.log("📱 En home, permitiendo cerrar aplicación");
      App.exitApp();
    }
  });
} catch (e) {
  console.log("App API no disponible:", e);
}
