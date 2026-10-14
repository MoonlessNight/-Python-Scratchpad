# Lumen | Calculadora web con Python y JSON

## Requisitos
- Python 3.10 o posterior.
- No requiere Flask, paquetes externos, Docker ni base de datos.

## Iniciar
1. Descomprime el proyecto.
2. Abre una terminal dentro de la carpeta `calculadora_json`.
3. Ejecuta:
   - Windows: `py server.py`
   - macOS/Linux: `python3 server.py`
4. Abre `http://127.0.0.1:8765` en el navegador.

El servidor escucha únicamente en `127.0.0.1` por seguridad. No lo expongas directamente a Internet ni cambies el enlace por una dirección pública.

## Expresiones admitidas
Operadores: `+`, `-`, `*`, `/`, `//`, `%`, `**`, paréntesis y signos unarios.
Funciones: `sqrt`, `abs`, `round`, `floor`, `ceil`, `sin`, `cos`, `tan`, `log`, `log10`, `exp`, `min`, `max`.
Constantes: `pi`, `e`, `tau`. Las funciones trigonométricas usan radianes.
Ejemplo: `round(sqrt(81) + 2**3, 2)`.

La evaluación usa el árbol sintáctico de Python con una lista permitida de nodos y funciones. No usa `eval()` y no ejecuta comandos de sistema ni código arbitrario.

## Variables
En la sección Variables escribe nombre y expresión:
- Nombre: `subtotal`
- Expresión: `120 * 4`
Luego podrás calcular `subtotal * 1.19`.

Los nombres deben ser identificadores válidos, sin espacios y sin comenzar por guion bajo.

## Historial
Cada operación se registra en `data/history.json` si el historial está habilitado. Desde la interfaz puedes recuperar la expresión, editar el texto guardado, borrar una entrada o limpiar todo el historial. Editar una entrada del historial modifica la expresión guardada, no recalcula retroactivamente su resultado.

## Archivos JSON
- `data/history.json`: operaciones.
- `data/variables.json`: variables numéricas.
- `data/settings.json`: preferencias y funciones habilitadas.

Estos archivos se crean automáticamente. Haz una copia de `data/` si quieres respaldar tus datos.

## Desactivar funciones
En Personalización puedes desactivar Historial y Variables. La calculadora básica seguirá funcionando. Al desactivar Variables, las expresiones no pueden consultar variables guardadas. Al desactivar Historial, las operaciones nuevas no se guardan y el historial queda oculto.

## Personalización
- Tema claro, oscuro o el del sistema.
- Fuente de sistema, serif o monoespaciada.
- URL de imagen para el fondo.
- URL de audio personalizada; si no se especifica, usa un tono corto generado por el navegador.
Usa URLs de recursos de confianza. El navegador puede bloquear audio hasta que interactúes con la página.

## Seguridad y límites
- Por defecto solo es accesible desde el propio equipo.
- No es un servicio preparado para Internet multiusuario: no tiene autenticación, TLS ni protección CSRF completa. No lo publiques en una red abierta.
- La interfaz admite URL externas para fondo, audio y fuentes de imagen; usa recursos de confianza.
- El historial se limita a las 500 operaciones más recientes.
