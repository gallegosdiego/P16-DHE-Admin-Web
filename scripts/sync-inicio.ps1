# ==============================================================================
#  SYNC-INICIO.PS1 — Protocolo de Inicio de Jornada
#  Version: 2.0 | 2026-05-19
#  Cambio: Se incluyen TODOS los repos del ecosistema DHE + NODA
#  Uso: .\sync-inicio.ps1
# ==============================================================================

# --- Configuracion de Repositorios (ECOSISTEMA COMPLETO) ---
$repos = @(
    @{
        Name     = "P16-DHE-Admin-Web"
        Path     = "d:\DHE dev\P16-DHE-Admin-Web"
        Branch   = "main"
        Priority = "ALTA"
    },
    @{
        Name     = "P14-DHE-Portal-Cliente"
        Path     = "d:\DHE dev\P14-DHE-app-Cliente-"
        Branch   = "main"
        Priority = "ALTA"
    },
    @{
        Name     = "P15-DHE-App-Repartidor"
        Path     = "d:\DHE dev\P15-DHE-App-Repartidor"
        Branch   = "main"
        Priority = "ALTA"
    },
    @{
        Name     = "P13-DHE-Landing-Page"
        Path     = "d:\DHE dev\P13-DHE-Landing-Page-"
        Branch   = "main"
        Priority = "MEDIA"
    },
    @{
        Name     = "TranscriptorIA (P04)"
        Path     = "d:\Proyectos\TranscriptorIA"
        Branch   = "master"
        Priority = "MEDIA"
    },
    @{
        Name     = "P24-NODA"
        Path     = "d:\Proyectos\P24-NODA"
        Branch   = "master"
        Priority = "MEDIA"
    }
)

# --- Colores y Formato ---
function Write-Header($text) {
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
}

function Write-Status($label, $value, $color) {
    Write-Host "  $label : " -NoNewline -ForegroundColor Gray
    Write-Host $value -ForegroundColor $color
}

function Write-OK($text)      { Write-Host "  [OK]      $text" -ForegroundColor Green }
function Write-Warn($text)    { Write-Host "  [AVISO]   $text" -ForegroundColor Yellow }
function Write-Critical($text){ Write-Host "  [CRITICO] $text" -ForegroundColor Red }

# ==============================================================================
#  INICIO
# ==============================================================================
Clear-Host
Write-Header "PROTOCOLO DE INICIO DE JORNADA — v2.0"
Write-Host ""
Write-Host "  Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor White
Write-Host "  Maquina: $env:COMPUTERNAME" -ForegroundColor White
Write-Host "  Repos: $($repos.Count) configurados" -ForegroundColor White
Write-Host ""

# --- Paso 1: Ubicacion ---
Write-Host "  Donde te encuentras?" -ForegroundColor Yellow
Write-Host "    [1] Oficina" -ForegroundColor White
Write-Host "    [2] Casa" -ForegroundColor White
Write-Host ""
$ubicacion = Read-Host "  Selecciona (1/2)"

switch ($ubicacion) {
    "1" { $ubicacionTexto = "OFICINA"; $emoji = "[OFI]" }
    "2" { $ubicacionTexto = "CASA";    $emoji = "[CASA]" }
    default {
        Write-Host "  Opcion no valida. Asumiendo OFICINA." -ForegroundColor Yellow
        $ubicacionTexto = "OFICINA"; $emoji = "[OFI]"
    }
}

Write-Host ""
Write-Host "  Ubicacion: $ubicacionTexto" -ForegroundColor Green
Write-Host ""

# --- Paso 2: Analizar cada repositorio ---
$logLines = @()
$logLines += "REPORTE DE INICIO — $ubicacionTexto — $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$logLines += "Maquina: $env:COMPUTERNAME"
$logLines += ("-" * 60)

$pullNeeded = @()
$repoOk = 0
$repoWarn = 0

foreach ($repo in $repos) {
    Write-Header "$($repo.Priority) | $($repo.Name)"

    if (-not (Test-Path $repo.Path)) {
        Write-Critical "Directorio no encontrado: $($repo.Path)"
        $logLines += "$($repo.Name): DIRECTORIO NO ENCONTRADO"
        $repoWarn++
        continue
    }

    Push-Location $repo.Path

    # Fetch
    Write-Host "  Fetching origin..." -ForegroundColor Gray
    $fetchOutput = git fetch origin 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Error al hacer fetch: $fetchOutput"
        Write-Warn "Puede que no haya conexion a internet."
        $logLines += "$($repo.Name): FETCH FALLIDO"
        $repoWarn++
        Pop-Location
        continue
    }
    Write-OK "Fetch completado"

    # Branch actual
    $currentBranch = git branch --show-current
    Write-Status "Rama activa" $currentBranch White

    # Verificar que estamos en la rama correcta
    if ($currentBranch -ne $repo.Branch) {
        Write-Warn "Esperaba rama '$($repo.Branch)' pero estoy en '$currentBranch'"
        $logLines += "$($repo.Name): RAMA INCORRECTA ($currentBranch vs $($repo.Branch))"
    }

    # Ahead/Behind
    $abResult = git rev-list --left-right --count "origin/$($repo.Branch)...$currentBranch" 2>&1
    if ($abResult -match "(\d+)\s+(\d+)") {
        $behind = [int]$Matches[1]
        $ahead  = [int]$Matches[2]
    } else {
        $behind = 0; $ahead = 0
    }

    if ($behind -gt 0) {
        Write-Critical "$behind commit(s) ATRAS de origin — necesita PULL"
        Write-Host ""
        Write-Host "  Commits pendientes:" -ForegroundColor Yellow
        $pendingCommits = git log --oneline --format="    %h %ai %s" "$currentBranch..origin/$($repo.Branch)"
        $pendingCommits | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
        $pullNeeded += $repo
        $logLines += "$($repo.Name): $behind commits ATRAS — PULL NECESARIO"
        $repoWarn++
    } else {
        Write-OK "Sincronizado con origin"
        $logLines += "$($repo.Name): SINCRONIZADO"
        $repoOk++
    }

    if ($ahead -gt 0) {
        Write-Warn "$ahead commit(s) ADELANTE de origin — considere PUSH"
        $logLines += "$($repo.Name): $ahead commits sin push"
    }

    # Dirty files
    $dirtyFiles = git status --short
    if ($dirtyFiles) {
        Write-Warn "Hay archivos modificados sin commit:"
        $dirtyFiles | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
        $logLines += "$($repo.Name): DIRTY FILES detectados"
    } else {
        Write-OK "Working tree limpio"
    }

    # Stash
    $stashList = git stash list
    if ($stashList) {
        Write-Warn "Hay stash pendientes:"
        $stashList | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
        $logLines += "$($repo.Name): STASH pendiente"
    }

    Pop-Location
}

# --- Paso 3: Ofrecer Pull automatico ---
if ($pullNeeded.Count -gt 0) {
    Write-Host ""
    Write-Header "ACCION REQUERIDA"
    Write-Host "  Los siguientes repos necesitan pull:" -ForegroundColor Yellow
    foreach ($r in $pullNeeded) {
        Write-Host "    - $($r.Name) ($($r.Branch))" -ForegroundColor Yellow
    }
    Write-Host ""
    $doPull = Read-Host "  Ejecutar git pull en todos? (S/N)"

    if ($doPull -eq "S" -or $doPull -eq "s") {
        foreach ($r in $pullNeeded) {
            Write-Host ""
            Write-Host "  Pulling $($r.Name)..." -ForegroundColor Cyan
            Push-Location $r.Path
            $pullResult = git pull origin $r.Branch 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-OK "Pull exitoso"
                $logLines += "$($r.Name): PULL EXITOSO"
            } else {
                Write-Critical "Error en pull: $pullResult"
                $logLines += "$($r.Name): PULL FALLIDO — $pullResult"
            }
            Pop-Location
        }
    } else {
        Write-Warn "Pull omitido por usuario. Recuerde hacerlo manualmente."
        $logLines += "PULL OMITIDO POR USUARIO"
    }
}

# --- Paso 4: Guardar log ---
$logDir = "d:\DHE dev\.sync-logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir "inicio_$(Get-Date -Format 'yyyy-MM-dd_HHmmss').txt"
$logLines | Out-File -FilePath $logFile -Encoding UTF8
Write-Host ""
Write-OK "Log guardado en: $logFile"

# --- Resumen Final ---
Write-Host ""
Write-Header "RESUMEN"
Write-Host "  Ubicacion:  $ubicacionTexto" -ForegroundColor White
Write-Host "  Fecha:      $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor White
Write-Host "  Repos OK:   $repoOk / $($repos.Count)" -ForegroundColor $(if ($repoOk -eq $repos.Count) { "Green" } else { "Yellow" })
Write-Host "  Alertas:    $repoWarn" -ForegroundColor $(if ($repoWarn -eq 0) { "Green" } else { "Yellow" })

if ($pullNeeded.Count -eq 0) {
    Write-Host ""
    Write-OK "TODOS LOS REPOS SINCRONIZADOS. PUEDES TRABAJAR."
} else {
    Write-Host ""
    Write-Warn "Revisa los repos marcados como CRITICO antes de empezar."
}

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""
