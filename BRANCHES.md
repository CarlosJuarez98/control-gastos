# Ramas

| Rama | Uso |
|------|-----|
| `local` | Desarrollo diario (PC, Oracle Docker, Angular :420x) |
| `nube` | Listo para Oracle Cloud (ATP + compose cloud) |

## Flujo
1. Trabajas en **`local`**.
2. Cuando digas **"sube a la nube"**:
   - merge `local` → `nube` (integrar lo que falte)
   - deploy/sync desde el estado `nube`
3. No hagas cambios solo-nube en `local` salvo configs compartidas (proxy + `/api` relativo).
