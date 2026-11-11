# Inventario provisional de dependencias

Este inventario recoge los paquetes directos declarados y los paquetes JavaScript identificados en el mapa de fuentes de una exportación iOS de esta copia. La exportación contiene 825 módulos y 35 paquetes JavaScript identificados; el inventario incluye también paquetes directos que pueden ser solo de web.

No es un inventario exhaustivo de las bibliotecas nativas de iOS o Android, de módulos que el mapa de fuentes no identifique, ni de las dependencias incorporadas a un binario final de tienda.

| Paquete | Versión | Licencia declarada |
| --- | --- | --- |
| @babel/runtime | 7.29.10 | MIT |
| @expo/cli | 57.0.32 | MIT |
| @expo/metro-runtime | 57.0.17 | MIT |
| @react-native-async-storage/async-storage | 2.2.0 | MIT |
| @react-native-community/slider | 5.2.0 | MIT |
| @react-native/assets-registry | 0.86.3 | MIT |
| @react-native/js-polyfills | 0.86.3 | MIT |
| @react-native/normalize-colors | 0.86.3 | MIT |
| @react-native/virtualized-lists | 0.86.3 | MIT |
| @ungap/structured-clone | 1.4.0 | ISC |
| abort-controller | 3.0.0 | MIT |
| base64-js | 1.5.1 | MIT |
| event-target-shim | 5.0.1 | MIT |
| expo | 57.0.31 | MIT |
| expo-asset | 57.0.20 | MIT |
| expo-constants | 57.0.22 | MIT |
| expo-file-system | 57.0.7 | MIT |
| expo-location | 57.0.22 | MIT |
| expo-modules-core | 57.0.24 | MIT |
| expo-splash-screen | 57.0.10 | MIT |
| expo-status-bar | 57.0.1 | MIT |
| expo-system-ui | 57.0.4 | MIT |
| flow-enums-runtime | 0.0.6 | MIT |
| invariant | 2.2.4 | MIT |
| memoize-one | 5.2.1 | MIT |
| nullthrows | 1.1.1 | MIT |
| promise | 8.3.0 | MIT |
| react | 19.2.3 | MIT |
| react-dom | 19.2.3 | MIT |
| react-native | 0.86.3 | MIT |
| react-native-maps | 1.27.2 | MIT |
| react-native-safe-area-context | 5.7.0 | MIT |
| react-native-svg | 15.15.4 | MIT |
| react-native-web | 0.21.4 | MIT |
| regenerator-runtime | 0.13.11 | MIT |
| scheduler | 0.27.0 | MIT |
| stacktrace-parser | 0.1.11 | MIT |
| warn-once | 0.1.1 | MIT |
| whatwg-fetch | 3.6.20 | MIT |
| whatwg-url-minimum | 0.1.2 | MIT |

Además se usa SunCalc 2.0.2 con licencia BSD 2-Clause. Los avisos completos se incluyen en la pantalla de fuentes. La licencia de @react-native-community/slider se obtuvo del repositorio oficial en la etiqueta v5.2.0 (commit a7c1169f292763efb43b3089cd7b513a9db94d8b), ya que no aparecía en el paquete instalado. Cuatro paquetes @react-native/ 0.86.3 sin licencia empaquetada usan el aviso MIT de la raíz de su monorepositorio React Native de la misma versión.

Pendiente: inventariar las bibliotecas nativas de los binarios de tienda, comprobar todos sus avisos y condiciones, verificar Android por separado, y comprobar la pantalla en teléfonos reales.

## Componentes nativos: comprobación parcial

- El APK local **de prueba v18** contiene clases que identifican OkHttp, Okio, Fresco, Kotlin y Apache Commons Codec, además de bibliotecas de Hermes y el aviso Public Suffix List. El IPA local **de prueba v18** contiene Hermes y un recurso del paquete de dependencias Folly. Esto no acredita el contenido ni las versiones de las compilaciones de tienda v22/v23.
- El catálogo instalado de React Native 0.86.3 declara, como referencias de compilación Android, OkHttp 4.9.2, Okio 2.9.0, Fresco 3.6.0, Kotlin 2.1.20 y Folly 2024.11.18.00. Son referencias del catálogo, no una resolución final de Gradle. En iOS, el uso de dependencias precompiladas también impide inferir el grafo definitivo solo de los podspecs.
- La pantalla incluye textos oficiales de licencia para los componentes mencionados y el aviso Public Suffix del APK de prueba, incluido MPL 2.0. Las licencias de OkHttp, Okio, Fresco, Folly y Kotlin se consultaron en sus repositorios oficiales y en las versiones del catálogo; la de Hermes proviene de su repositorio oficial sin versión de binario contrastada. Para Codec se incluye la licencia Apache y el NOTICE íntegro del JAR oficial de referencia 1.10, verificado por SHA-256. El AAB Android v23 contiene las mismas 92 clases, incluidas las 32 de Beider-Morse, pero la coincidencia de nombres no demuestra la versión exacta del binario.
- Fuentes: [catálogo React Native](../mobile/node_modules/react-native/gradle/libs.versions.toml), [OkHttp 4.9.2](https://github.com/lysine-dev/okhttp/blob/parent-4.9.2/LICENSE.txt), [Okio 2.9.0](https://github.com/lysine-dev/okio/blob/parent-2.9.0/LICENSE.txt), [Fresco 3.6.0](https://github.com/meta/fresco/blob/v3.6.0/LICENSE), [Folly](https://github.com/meta/folly/blob/v2024.11.18.00/LICENSE), [Hermes](https://github.com/meta/hermes/blob/main/LICENSE), [Kotlin](https://github.com/JetBrains/kotlin/blob/v2.1.20/license/LICENSE.txt), [Codec](https://github.com/apache/commons-codec) y [Public Suffix List](https://publicsuffix.org/list/).
- La inspección del AAB de tienda v22 verificó clases de OkHttp, Okio, Commons Codec, Fresco, Kotlin y Hermes, pero no sus versiones exactas. La auditoría del AAB v23 confirmó coincidencia de nombres de clases con el JAR de referencia Codec 1.10, sin probar identidad de implementación o versión. Queda pendiente obtener la resolución Gradle de la compilación Android de tienda y `Podfile.lock` o lista equivalente de iOS, cotejarlos con los archivos efectivamente empaquetados y añadir avisos o licencias faltantes. También faltan otros componentes nativos posibles como Boost, fmt, glog y DoubleConversion, además de bibliotecas de Google y AndroidX. Revisar los textos con las versiones reales antes de distribuir esta modificación.
