# Bondímetro v2 (GitHub Pages)

Build estático de `/workspace/bondimetro-v2.3/public` (v2.3.1: el bondi punteado ya no se queda quieto entre lecturas SUBE —velocidad por mediana, espera en paradas, «sin señal» tras 5 min—; 2.3.0: mapa rotable con brújula, modelo del servidor `model.json` opcional del entrenamiento automático; incluye lo de 2.2.0).

URL: https://10-9MC.github.io/bondimetro-v2/

Sin el proxy de Daqui; la app intenta fetch directo y después JSONP. También está publicada en Daqui con proxy: https://daqui.tailc448e0.ts.net/bondimetro-v2/

En Pages no hay `model.json` (lo genera bondimetro-autotrain en Daqui/Nucbox); la app tolera el 404 y sigue sin él.

Uso personal. La clave de la API está en el HTML (igual que en la app).
