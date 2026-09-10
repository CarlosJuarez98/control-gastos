# Ramas

| Rama | Uso |
|------|-----|
| `local` | Desarrollo diario (PC, Oracle Docker, Angular :420x) |
| `nube` | Listo para Oracle Cloud (ATP + compose cloud) |

## Flujo
1. Trabajas en **`local`**.
2. Cuando digas **"sube a la nube"**:
   - merge `local` → `nube` (integrar lo que falte)
   - deploy de **código** desde el estado `nube`
   - **sin** sync de datos (local = pruebas; nube = datos reales)
3. Datos solo con **"sube datos"** / **"baja datos"** → ver `SYNC-DATOS.md` y `A:\Programas-java\SYNC-BIDIRECCIONAL.md`.
4. No hagas cambios solo-nube en `local` salvo configs compartidas (proxy + `/api` relativo).
