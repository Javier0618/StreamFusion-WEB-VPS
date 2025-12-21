# StreamFusion - Guía de Desarrollo Móvil con Capacitor

## 📱 Estructura de Proyecto
Tu proyecto ahora está configurado para Capacitor. Los archivos de tu app web están en la carpeta `www/`:
```
/www
├── index.html       # Tu HTML principal
├── js/             # Tus scripts JavaScript
├── style/          # Tus estilos CSS
```

## 🚀 Pasos para Usar en VS Code

### 1. **Abre el Proyecto en VS Code**
```bash
# En tu terminal en el directorio del proyecto:
code .
```

### 2. **Instala las Dependencias** (si no están instaladas)
```bash
npm install
```

### 3. **Desarrollo y Pruebas**

#### Opción A: Servidor Web Local
```bash
npm run dev
```
Accede a `http://localhost:8000` en tu navegador para ver la app.

#### Opción B: Emulador/Dispositivo
```bash
# Copiar cambios a la app nativa
npm run cap:sync

# Abrir proyecto iOS (solo macOS)
npm run cap:open:ios

# Abrir proyecto Android (Windows/Mac/Linux)
npm run cap:open:android
```

### 4. **Agregar Plataformas** (Primera vez solamente)

#### Para iOS (requiere macOS):
```bash
npm run cap:add:ios
npm run cap:open:ios
```
Esto abre Xcode. Puedes compilar y ejecutar en el simulador o dispositivo.

#### Para Android:
```bash
npm run cap:add:android
npm run cap:open:android
```
Esto abre Android Studio. Puedes compilar y ejecutar en el emulador o dispositivo.

### 5. **Flujo de Desarrollo Típico**

1. **Edita archivos** en VS Code (en la carpeta `www/`)
2. **Guarda los cambios**
3. **Sincroniza con Capacitor**:
   ```bash
   npm run cap:sync
   ```
4. **Compila y ejecuta** en Xcode o Android Studio
5. **Prueba** en el simulador/emulador o dispositivo real

## 📋 Comandos Útiles

| Comando | Descripción |
|---------|-----------|
| `npm run dev` | Inicia servidor web local (puerto 8000) |
| `npm run cap:sync` | Copia cambios web a la app nativa |
| `npm run cap:copy` | Copia solo los archivos web |
| `npm run cap:build` | Compila la app |
| `npm run cap:open:ios` | Abre Xcode (iOS) |
| `npm run cap:open:android` | Abre Android Studio |

## ⚙️ Requisitos

- **Node.js** (v14 o superior) - ✅ Ya instalado
- **npm** (incluido con Node.js) - ✅ Ya instalado

### Para iOS:
- **macOS** con Xcode instalado
- Puedes descargarlo desde el App Store

### Para Android:
- **Android Studio** (Windows, Mac, o Linux)
- JDK 8 o superior
- Descargalo desde: https://developer.android.com/studio

## 🔧 Configuración de Firebase y TMDB

Tu configuración de Firebase y TMDB está en `www/js/config.js`. Asegúrate de:
1. Mantener tus API keys seguras (no hacer commit de config.js)
2. El archivo ya está en `.gitignore`
3. En producción, considera usar variables de entorno

## 📱 Pruebas en Dispositivo Real

1. **Conecta tu dispositivo móvil** por USB
2. En Xcode (iOS): Selecciona tu dispositivo en el selector
3. En Android Studio: Tu dispositivo debe aparecer automáticamente
4. Presiona "Run" para compilar e instalar la app

## 🌐 Acceso a APIs (Firebase, TMDB)

Tu app web accede a:
- **Firebase** (autenticación y base de datos)
- **TMDB API** (datos de películas y series)

Capacitor permite que tu app acceda a estas APIs igual que en web. No necesitas cambios especiales.

## 📝 Próximos Pasos

1. Instala los requisitos para tu plataforma (Xcode o Android Studio)
2. Abre el proyecto en VS Code
3. Ejecuta `npm run dev` para ver cambios en vivo
4. Cuando esté listo, agrega iOS o Android
5. ¡Compila y distribuye tu app!

## ❓ Ayuda

Si tienes problemas:
1. Asegúrate de que Node.js está instalado (`node --version`)
2. Instala dependencias nuevamente: `npm install`
3. Sincroniza todo: `npm run cap:sync`
4. Consulta la documentación: https://capacitorjs.com/docs

---
**StreamFusion Mobile** - Aplicación de streaming en tu bolsillo 🎬
