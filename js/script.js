/* =========================================================================
   GUION SINCRONIZADO (teleprónter)
   t = segundo de inicio de cada bloque en la línea de tiempo (0 – 270 s)
   ========================================================================= */
window.SCRIPT = [
  /* ---------- ESCENA 1 · INTRODUCCIÓN (0:00 – 0:50) ---------- */
  { t: 0,   s: 1, text: "Bienvenidos. Hoy hablaremos del renderizado háptico en cirugía robótica y de una frontera técnica fascinante: la barrera de un kilohercio." },
  { t: 8,   s: 1, text: "Empecemos con una comparación. A la izquierda, la vista humana: una pantalla a sesenta cuadros por segundo, es decir, una imagen cada 16.7 milisegundos, ya se percibe completamente fluida." },
  { t: 20,  s: 1, text: "A la derecha, el tacto humano. Nuestra piel y nuestros músculos detectan cambios de fuerza muchísimo más rápidos. Para que una superficie virtual se sienta sólida, el robot debe actualizar la fuerza mil veces por segundo: un milisegundo por ciclo." },
  { t: 31,  s: 1, text: "¿Qué pasa si bajamos esa frecuencia a solo cincuenta hercios? El bisturí robótico recibe una corrección cada veinte milisegundos. Entre una actualización y otra, la mano ya penetró demasiado, y la fuerza llega tarde y de golpe." },
  { t: 41,  s: 1, text: "El resultado es vibración, inestabilidad y una alerta roja: en un quirófano real eso significa perder precisión justo cuando más se necesita. Para el tacto, mil hercios no es un lujo: es el mínimo." },

  /* ---------- ESCENA 2 · FUNDAMENTACIÓN TEÓRICA (0:50 – 2:05) ---------- */
  { t: 50,  s: 2, text: "Pasemos a la fundamentación teórica. ¿Cómo calcula una computadora la fuerza que debe sentir el cirujano?" },
  { t: 57,  s: 2, text: "Observen el bisturí entrando al tejido virtual. El punto naranja es la posición real de la mano del cirujano: P mano. Como el tejido es virtual, nada físico la detiene, así que la mano puede atravesar la superficie." },
  { t: 68,  s: 2, text: "Por eso creamos un avatar, el punto azul, llamado P virtual o god-object. Este avatar nunca atraviesa el tejido: se queda sobre la superficie, en el punto de contacto más cercano." },
  { t: 79,  s: 2, text: "Entre ambos puntos colocamos un resorte virtual. Su fuerza sigue la Ley de Hooke: F elástica es igual a menos k t por la diferencia entre P mano y P virtual. Mientras más profundo entra la mano, más fuerte empuja el resorte hacia afuera." },
  { t: 94,  s: 2, text: "Pero un resorte solo oscilaría sin control. Por eso agregamos un amortiguador viscoso: F de amortiguamiento es igual a menos b t por la diferencia de velocidades. Esta fuerza frena el movimiento relativo y disipa energía, evitando rebotes." },
  { t: 108, s: 2, text: "Al combinar ambos términos obtenemos la ecuación maestra: F háptica igual a menos k t delta x, menos b t delta v. En robots quirúrgicos se aplica en seis grados de libertad: tres traslaciones y tres rotaciones." },
  { t: 121, s: 2, text: "Es, en esencia, un sistema resorte-amortiguador resuelto mil veces por segundo." },

  /* ---------- ESCENA 3 · SIMULACIÓN Y CÁLCULO (2:05 – 3:35) ---------- */
  { t: 125, s: 3, text: "Ahora simulemos un caso concreto: el bisturí entra en contacto con un hueso." },
  { t: 131, s: 3, text: "Los parámetros son: rigidez k t de mil doscientos newtons por metro, amortiguamiento b t de quince newton segundo por metro, una penetración delta x de cuatro milímetros y una velocidad relativa delta v de diez centímetros por segundo." },
  { t: 144, s: 3, text: "Primera tarjeta, la fuerza elástica: menos mil doscientos por cero punto cero cero cuatro nos da menos cuatro punto ocho newtons." },
  { t: 152, s: 3, text: "Segunda tarjeta, la fuerza de amortiguamiento: menos quince por cero punto diez da menos uno punto cinco newtons." },
  { t: 159, s: 3, text: "Y sumando ambas, la fuerza háptica total es de menos seis punto tres newtons. El signo negativo indica que el robot empuja la mano del cirujano hacia afuera del hueso." },
  { t: 168, s: 3, text: "Veamos esa fuerza en el tiempo. La curva azul se actualiza a mil hercios: es suave, continua y se siente como un material real." },
  { t: 177, s: 3, text: "La línea roja se actualiza a cincuenta hercios: escalones de veinte milisegundos. Cada salto es un pequeño golpe en la mano; el sistema inyecta energía y el contacto se vuelve inestable." },
  { t: 188, s: 3, text: "¿Cómo se resuelve si detectar colisiones es costoso? Con una arquitectura de tres hilos. El hilo uno calcula las colisiones a cincuenta hercios, el ritmo que permite la geometría compleja." },
  { t: 198, s: 3, text: "El hilo dos predice la siguiente fuerza con una serie de tiempo autorregresiva AR dos: F t más uno es igual a uno punto seis por seis, menos cero punto seis por cinco punto cinco: seis punto tres newtons." },
  { t: 208, s: 3, text: "Y el hilo tres interpola con curvas cúbicas entre esas predicciones, entregando al motor una fuerza nueva cada milisegundo: mil hercios." },

  /* ---------- ESCENA 4 · CONCLUSIONES (3:35 – 4:30) ---------- */
  { t: 215, s: 4, text: "Llegamos a las conclusiones." },
  { t: 219, s: 4, text: "Primero, la protección biológica. Un simulador háptico fiel permite entrenar cirugías una y otra vez, sin poner en riesgo a pacientes y sin utilizar animales de experimentación." },
  { t: 230, s: 4, text: "El residente puede equivocarse, sentir la resistencia real del hueso o del tejido, y repetir hasta dominar la técnica antes de su primer paciente." },
  { t: 240, s: 4, text: "Segundo, desde la Ingeniería de Sistemas: aquí el código no solo mueve píxeles. Cada línea calcula una fuerza que un motor convierte en energía mecánica real, aplicada sobre la mano de una persona." },
  { t: 252, s: 4, text: "Un error de programación o un retraso de unos milisegundos se traduce en una vibración, un golpe o un corte impreciso. Por eso el software háptico debe ser determinista, rápido y seguro." },
  { t: 262, s: 4, text: "Un milisegundo. Esa es la barrera. Muchas gracias." }
];
