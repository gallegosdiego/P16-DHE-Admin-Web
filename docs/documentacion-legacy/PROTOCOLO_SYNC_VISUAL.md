# 🔄 Protocolo de Sincronización Casa ↔ Oficina

![Diagrama del Protocolo de Sincronización](C:\Users\HP Z480\.gemini\antigravity\brain\f351cebb-ed40-4726-93e9-97f761061144\artifacts\protocolo_sync_diagrama.png)

---

## Flujo Operativo

```mermaid
flowchart TD
    START["🟢 INICIO DE JORNADA"] --> ASK{"¿Dónde estás?"}
    ASK -->|"🏢 Oficina"| OFI["Entorno: OFICINA\nPC: HP Z480\nDisco: D:\\"]
    ASK -->|"🏠 Casa"| CASA["Entorno: CASA\nLaptop personal\nDisco: local"]

    OFI --> FETCH["git fetch origin\n(todos los repos)"]
    CASA --> FETCH

    FETCH --> CHECK{"¿Hay commits\npendientes?"}
    CHECK -->|"✅ Sincronizado"| WORK["💻 Trabajar"]
    CHECK -->|"⚠️ Atrasado"| PULL["git pull origin main/master"]
    PULL --> VERIFY["Verificar build\nnpm run build / php artisan test"]
    VERIFY --> WORK

    WORK --> COMMIT["git add + commit\nMensaje descriptivo"]
    COMMIT --> CIERRE["🔴 CIERRE DE JORNADA"]
    CIERRE --> PUSH["git push origin\n(todos los repos)"]
    PUSH --> VALIDATE{"¿Push exitoso?"}
    VALIDATE -->|"✅ OK"| SAFE["🟢 SEGURO PARA APAGAR"]
    VALIDATE -->|"❌ Error"| FIX["Resolver conflicto\ny reintentar"]
    FIX --> PUSH

    style START fill:#10B981,color:#fff,stroke:#059669
    style SAFE fill:#10B981,color:#fff,stroke:#059669
    style CIERRE fill:#EF4444,color:#fff,stroke:#DC2626
    style WORK fill:#3B82F6,color:#fff,stroke:#2563EB
    style PULL fill:#F59E0B,color:#000,stroke:#D97706
    style PUSH fill:#8B5CF6,color:#fff,stroke:#7C3AED
    style CHECK fill:#6366F1,color:#fff,stroke:#4F46E5
    style ASK fill:#6366F1,color:#fff,stroke:#4F46E5
    style VALIDATE fill:#6366F1,color:#fff,stroke:#4F46E5
```

---

## Repositorios Gestionados

| Prioridad | Proyecto | Ruta | Rama | Remote |
|-----------|----------|------|------|--------|
| 🔴 ALTA | **P16-DHE-Admin-Web** | `d:\DHE dev\P16-DHE-Admin-Web` | `main` | github/gallegosdiego |
| 🟡 MEDIA | TranscriptorIA / NODA | `d:\Proyectos\TranscriptorIA` | `master` | github/gallegosdiego |

---

## Scripts Automatizados

````carousel
### 🟢 sync-inicio.ps1 — Inicio de Jornada
```
Ubicación: d:\DHE dev\sync-inicio.ps1
```

**Ejecutar al llegar a trabajar (casa u oficina):**

```powershell
cd "d:\DHE dev"
.\sync-inicio.ps1
```

**Lo que hace automáticamente:**
1. Pregunta: *¿Dónde estás? (Oficina / Casa)*
2. Ejecuta `git fetch` en todos los repos
3. Detecta commits pendientes (ahead/behind)
4. Muestra archivos dirty y stash pendientes
5. Ofrece hacer `git pull` automático
6. Genera log en `d:\DHE dev\.sync-logs\`

<!-- slide -->

### 🔴 sync-cierre.ps1 — Cierre de Jornada
```
Ubicación: d:\DHE dev\sync-cierre.ps1
```

**Ejecutar antes de apagar/irse:**

```powershell
cd "d:\DHE dev"
.\sync-cierre.ps1
```

**Lo que hace automáticamente:**
1. Detecta archivos sin commit en cada repo
2. Ofrece: Commit+Push / Stash / Ignorar
3. Verifica commits sin push
4. Ejecuta `git push` automático
5. Validación final: TODO PUSHED
6. Genera log en `d:\DHE dev\.sync-logs\`
````

---

## Reglas Fundamentales

> [!IMPORTANT]
> **GitHub es la ÚNICA fuente de verdad.** Nunca depender de USB para sincronizar código.

> [!WARNING]
> **PUSH antes de salir.** Nunca cerrar la laptop/PC sin hacer push. Es la causa #1 de desincronización.

> [!TIP]
> **PULL al llegar.** Siempre ejecutar `sync-inicio.ps1` antes de escribir la primera línea de código del día.

> [!NOTE]
> **USB es complementario.** Solo usar para assets pesados (videos, modelos ML, datasets) o documentación PDF. El código SIEMPRE va por Git.

---

## Checklist Rápido

### Inicio de Jornada ☀️
- [ ] Ejecutar `sync-inicio.ps1`
- [ ] Revisar reporte de estado
- [ ] Pull si hay commits pendientes
- [ ] Verificar que el proyecto compila
- [ ] Comenzar a trabajar

### Cierre de Jornada 🌙
- [ ] Guardar todo el trabajo
- [ ] Commit con mensaje descriptivo
- [ ] Ejecutar `sync-cierre.ps1`
- [ ] Verificar que todo está pushed
- [ ] Cerrar sesión

---

## Manejo de Conflictos

```mermaid
flowchart LR
    CONFLICT["⚡ Conflicto\nen Pull"] --> REVIEW["Revisar archivos\nen conflicto"]
    REVIEW --> DECIDE{"¿Tipo de\ncambio?"}
    DECIDE -->|"Aditivo\n(nuevo código)"| LATEST["Preferir versión\nmás reciente"]
    DECIDE -->|"Destructivo\n(refactoring)"| MANUAL["Merge manual\ncuidadoso"]
    LATEST --> MERGE["git add + commit merge"]
    MANUAL --> MERGE
    MERGE --> PUSH2["git push"]

    style CONFLICT fill:#EF4444,color:#fff
    style MERGE fill:#10B981,color:#fff
    style PUSH2 fill:#8B5CF6,color:#fff
```

> [!CAUTION]
> **NUNCA resolver conflictos con `--force` o `reset` sin entender el cambio.** Si se olvidó push la noche anterior, conectarse remotamente a la otra máquina y hacer push desde ahí primero.
