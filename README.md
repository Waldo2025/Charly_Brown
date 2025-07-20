
# 📱 Proyecto Capacitor con Android y Kotlin

Este proyecto utiliza Capacitor para desarrollar aplicaciones móviles híbridas con frontend web (HTML/JS/CSS) y un contenedor nativo Android con soporte para Kotlin.

---

## 🚀 Requisitos

- Node.js (v18+)
- npm
- Capacitor (`@capacitor/cli`, `@capacitor/core`)
- Android Studio (con Java 17)
- Kotlin SDK (`ext.kotlin_version = '1.9.22'`)
- Gradle 8.7+
- Android Gradle Plugin 8.5.1

---

## 🔁 Flujo de trabajo recomendado

### 1. 🔧 Desarrollo web (VS Code)

Toda la lógica de la app (HTML, CSS, JS) se desarrolla en **Visual Studio Code** dentro del directorio `/src` (si usas algún framework como Ionic o Vanilla JS):

```bash
# Instalar dependencias (si no están)
npm install

# Desarrollar en tiempo real
npm run dev
```

Una vez que hagas cambios:

```bash
# Compilar la app web
npm run build
```

USAR**
```bash
npx cap copy android
```


> Esto generará los archivos en `/dist` o `/www` (según tu configuración).

---

### 2. ⚙️ Sincronizar con Android (Capacitor)

Después de compilar tu app web, sincroniza los cambios con el contenedor nativo Android:

```bash
npx cap sync android
```

> Esto copia los archivos web al proyecto Android (`android/app/src/main/assets/public`), y actualiza plugins o configuración.

---

### 3. 🛠️ Abrir y correr en Android Studio

Ahora abre Android Studio y abre el directorio `android/`:

```bash
npx cap open android
```

O abre manualmente el proyecto Android con Android Studio.

Una vez dentro:

- Espera a que sincronice Gradle.
- Asegúrate de tener configurado Java 17 y Gradle 8.7.
- Verifica que el emulador o dispositivo esté activo.
- Da clic en ▶️ “Run”.

---

## ⚠️ Notas importantes

### ✅ Siempre usa el JDK 17

Asegúrate de que tu `gradle.properties` incluya:

```
org.gradle.java.home=/Users/<tu-usuario>/Library/Java/JavaVirtualMachines/jdk-17.0.2+8/Contents/Home
```

### ✅ Usa Kotlin 1.9.22

En tu `build.gradle` (nivel raíz):

```groovy
ext.kotlin_version = '1.9.22'
```

### ✅ Evita conflictos de dependencias

Asegúrate de no mezclar versiones viejas de Kotlin:

```groovy
implementation "org.jetbrains.kotlin:kotlin-stdlib:$kotlin_version"
// Elimina versiones como kotlin-stdlib-jdk7 o jdk8 si no son necesarias
```

---

## 🧼 Limpieza y reconstrucción

Si ves errores extraños en Android Studio:

```bash
./gradlew clean
./gradlew build --refresh-dependencies
```

---

## 📦 Exportar APK o AAB

Una vez todo esté funcionando:

```bash
./gradlew assembleRelease
```

Para generar `.aab`:

```bash
./gradlew bundleRelease
```

---

## 🤝 Créditos y soporte

Este proyecto usa Capacitor, Android Studio y Kotlin. Para ayuda o dudas, puedes buscar en:

- https://capacitorjs.com/docs
- https://developer.android.com
- https://kotlinlang.org





Actulizar Android:

🧩 Resumen:

¿Qué comando quieres correr?	            ¿En qué carpeta debes estar?

1. firebase deploy	                            |  En la raíz del proyecto web (con firebase.json)
2. cd charly-app                                |  ir a la carpera para android 
2. npx cap copy android	                        |  En la raíz del proyecto Capacitor (dentro de charly-app)
3. npx cap open android (abre Android Studio)   |  También dentro de charly-app
