# Renderizado Háptico en Cirugía Robótica · La Barrera de 1 kHz

Animación continua e interactiva de **Motion Graphics** (`4:30`) desarrollada con **HTML5, CSS3, Canvas, SVG, KaTeX y GSAP** para el proyecto universitario de **Física Mecánica × Ingeniería de Sistemas**.

**Autores:** Kevin Oliveros & Daniela Cubides

---

## Estructura de la línea de tiempo (4 min 30 s)

| Escena | Tiempo | Contenido |
| :--- | :---: | :--- |
| **01 · Introducción** | `0:00 – 0:50` | Portada cinética y comparación dividida entre **Vista Humana a 60 Hz** (`16.7 ms`, fluida) vs **Tacto Humano a 1,000 Hz** (`1 ms`, estable), mostrando la vibración e inestabilidad con **Alerta Roja** al caer a **50 Hz** (`20 ms`). |
| **02 · Fundamentación Teórica** | `0:50 – 2:05` | Corte transversal de tejido virtual con penetración de $P_{\text{mano}}$ y restricción superficial del avatar $P_{\text{virtual}}$ (*god-object*) unidos por resorte y amortiguador animados, superponiendo la **Ley de Hooke**, el **Amortiguamiento viscoso** y la **Ecuación Maestra (6-DoF)**. |
| **03 · Simulación y Cálculo** | `2:05 – 3:35` | Cálculo en vivo del contacto con hueso ($k_t = 1200\text{ N/m}$, $b_t = 15\text{ N}\cdot\text{s/m}$, $\Delta x = 0.004\text{ m}$, $\Delta v = 0.10\text{ m/s} \Rightarrow F_{\text{total}} = -6.3\text{ N}$), gráfica comparativa `1,000 Hz` vs `50 Hz` y arquitectura multihilo (**Hilo 1** Colisiones `50 Hz` → **Hilo 2** Predicción $\text{AR}(2)$ → **Hilo 3** Interpolación cúbica `1,000 Hz`). |
| **04 · Conclusiones** | `3:35 – 4:30` | Tipografía cinética sobre **Protección Biológica** (entrenamiento quirúrgico sin riesgo en pacientes ni animales) e **Ingeniería de Sistemas** (cómo el código en tiempo real controla energía mecánica real sobre un actuador). |

---

## Uso y controles

Abre `index.html` directamente en cualquier navegador moderno (todas las dependencias y tipografías están incluidas localmente en `vendor/`, por lo que funciona **100 % sin conexión a internet**).

- **`Espacio` / `K` o clic en el escenario:** Reproducir / Pausar
- **Barra de progreso o teclas `1`, `2`, `3`, `4`:** Saltar a cualquier instante o escena
- **`←` / `→` (`Shift` para `±15 s`):** Retroceder / avanzar `5 s`
- **`T` o botón `TELEPRÓNTER` (`+` / `-`):** Mostrar / ocultar guion sincronizado y ajustar tamaño de letra
- **`V` o botón `1×`:** Cambiar velocidad de reproducción (`1×`, `1.5×`, `2×`, `0.5×`)
- **`F`:** Pantalla completa · **`R`:** Reiniciar
