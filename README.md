# StreamFusion - Versión PHP/MySQL

Este es el proyecto StreamFusion adaptado para funcionar con un backend de PHP y una base de datos MySQL, en lugar de Firebase.

## Instrucciones de Despliegue

Sigue estos pasos para instalar y configurar el proyecto en tu servidor (por ejemplo, usando aapanel con Nginx).

### 1. Subir los Archivos

Sube todos los archivos de este proyecto al directorio raíz de tu sitio web en tu servidor. La estructura de archivos debería verse así:

```
/
├── api/
├── js/
├── style/
├── .gitignore
├── index.html
├── README.md
├── schema.sql
```

### 2. Crear la Base de Datos

1.  Ve a tu panel de phpMyAdmin.
2.  Crea una nueva base de datos. Puedes llamarla `streamfusion_db` o como prefieras.
3.  Selecciona la base de datos que acabas de crear.
4.  Haz clic en la pestaña "Importar".
5.  Haz clic en "Seleccionar archivo" y elige el archivo `schema.sql` que se encuentra en la raíz de este proyecto.
6.  Haz clic en "Continuar" en la parte inferior de la página.

Esto creará todas las tablas necesarias para que la aplicación funcione.

### 3. Configurar la Conexión a la Base de Datos

1.  En el directorio `api/`, encontrarás un archivo llamado `config.php.example`. Renómbralo a `config.php`.
2.  Abre el archivo `config.php` y edita las siguientes líneas con la información de tu base de datos:

```php
define('DB_HOST', 'localhost'); // Generalmente 'localhost'
define('DB_USER', 'tu_usuario_de_bd'); // El usuario de tu base de datos
define('DB_PASS', 'tu_contraseña_de_bd'); // La contraseña del usuario
define('DB_NAME', 'el_nombre_de_tu_bd'); // El nombre de la base de datos que creaste
```

3.  **Importante:** Cambia también la clave secreta para los tokens de sesión. Debe ser una cadena de texto larga y segura. Puedes generar una en un sitio web como [RandomKeygen](https://randomkeygen.com/).

```php
define('JWT_SECRET', 'una_cadena_muy_larga_y_segura_aqui');
```

### 4. Configuración de Nginx

**No se necesita ninguna configuración especial para la carpeta `/api/`**. El frontend está diseñado para llamar directamente a los archivos PHP (ej. `api/auth.php`, `api/content.php`). La configuración por defecto de aapanel para un sitio PHP debería ser suficiente.

**Elimina cualquier regla `location /api/ { ... }` que hayas añadido a tu configuración de Nginx**, ya que era incorrecta y es la causa probable del error 403.

### 5. Solución de Problemas (Error 403 Forbidden)

Si después de eliminar la regla de Nginx sigues viendo un error "403 Forbidden" en tu dominio principal, lo más probable es que sea un problema de **permisos de archivo**.

1.  **Ve al gestor de archivos de aapanel.**
2.  Navega a la carpeta raíz de tu sitio web.
3.  **Asegúrate de que los permisos estén configurados correctamente:**
    *   **Carpetas** (como `api`, `js`, `style`): Deben tener permisos `755`.
    *   **Archivos** (como `index.html`, `schema.sql`, y todos los archivos dentro de las carpetas): Deben tener permisos `644`.
4.  aapanel tiene una herramienta para arreglar los permisos fácilmente. Búscala en las opciones de tu sitio web.

### 6. ¡Listo!

Una vez completados estos pasos, tu sitio web debería estar completamente funcional. Puedes visitar tu dominio y probar el registro de usuarios, el inicio de sesión y el resto de las funcionalidades.
