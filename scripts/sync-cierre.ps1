# ==============================================================================
#  SYNC-CIERRE.PS1 — Protocolo de Cierre de Jornada
#  Version: 2.0 | 2026-05-19
#  Cambio: Se incluyen TODOS los repos del ecosistema DHE + NODA
#  Uso: .\sync-cierre.ps1
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

function Write-OK($text)      { Write-Host "  [OK]      $text" -ForegroundColor Green }
function Write-Warn($text)    { Write-Host "  [AVISO]   $text" -ForegroundColor Yellow }
function Write-Critical($text){ Write-Host "  [CRITICO] $text" -ForegroundColor Red }

# ==============================================================================
#  INICIO DEL CIERRE
# ==============================================================================
Clear-Host
Write-Header "PROTOCOLO DE CIERRE DE JORNADA — v2.0"
Write-Host ""
Write-Host "  Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor White
Write-Host "  Maquina: $env:COMPUTERNAME" -ForegroundColor White
Write-Host "  Repos: $($repos.Count) configurados" -ForegroundColor White

$logLines = @()
$logLines += "REPORTE DE CIERRE — $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$logLines += "Maquina: $env:COMPUTERNAME"
$logLines += ("-" * 60)

$pushNeeded = @()
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

    $currentBranch = git branch --show-current

    # Verificar rama
    if ($currentBranch -ne $repo.Branch) {
        Write-Warn "Esperaba rama '$($repo.Branch)' pero estoy en '$currentBranch'"
        $logLines += "$($repo.Name): RAMA INCORRECTA ($currentBranch vs $($repo.Branch))"
    }

    # Dirty files check
    $dirtyFiles = git status --short
    if ($dirtyFiles) {
        Write-Warn "Archivos sin commit detectados:"
        $dirtyFiles | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
        Write-Host ""

        $action = Read-Host "  Que desea hacer? (C)ommit + Push / (S)tash / (I)gnorar"

        switch ($action.ToUpper()) {
            "C" {
                $commitMsg = Read-Host "  Mensaje de commit"
                if (-not $commitMsg) { $commitMsg = "wip: cierre de jornada $(Get-Date -Format 'yyyy-MM-dd')" }
                git add -A
                git commit -m $commitMsg
                if ($LASTEXITCODE -eq 0) {
                    Write-OK "Commit realizado: $commitMsg"
                    $pushNeeded += $repo
                    $logLines += "$($repo.Name): COMMIT — $commitMsg"
                } else {
                    Write-Critical "Error al hacer commit"
                    $logLines += "$($repo.Name): COMMIT FALLIDO"
                    $repoWarn++
                }
            }
            "S" {
                $stashMsg = "cierre-$(Get-Date -Format 'yyyy-MM-dd-HHmm')"
                git stash push -m $stashMsg
                Write-OK "Stash guardado: $stashMsg"
                $logLines += "$($repo.Name): STASH — $stashMsg"
            }
            default {
                Write-Warn "Archivos sin commit ignorados."
                $logLines += "$($repo.Name): DIRTY FILES IGNORADOS"
                $repoWarn++
            }
        }
    } else {
        Write-OK "Working tree limpio"
    }

    # Check if ahead of origin
    git fetch origin 2>&1 | Out-Null
    $abResult = git rev-list --left-right --count "origin/$($repo.Branch)...$currentBranch" 2>&1
    if ($abResult -match "(\d+)\s+(\d+)") {
        $behind = [int]$Matches[1]
        $ahead  = [int]$Matches[2]
    } else {
        $behind = 0; $ahead = 0
    }

    if ($behind -gt 0) {
        Write-Warn "$behind commit(s) ATRAS de origin — considere PULL antes de push"
        $logLines += "$($repo.Name): $behind commits ATRAS"
    }

    if ($ahead -gt 0) {
        Write-Warn "$ahead commit(s) sin push a origin"
        $pushNeeded += $repo
        $logLines += "$($repo.Name): $ahead commits SIN PUSH"
    } elseif ($ahead -eq 0 -and -not $dirtyFiles) {
        Write-OK "Totalmente sincronizado con origin"
        $logLines += "$($repo.Name): SINCRONIZADO"
        $repoOk++
    }

    Pop-Location
}

# --- Push automatico ---
$uniquePush = $pushNeeded | Sort-Object { $_.Path } -Unique
if ($uniquePush.Count -gt 0) {
    Write-Host ""
    Write-Header "PUSH PENDIENTE"
    foreach ($r in $uniquePush) {
        Write-Host "    - $($r.Name)" -ForegroundColor Yellow
    }
    Write-Host ""
    $doPush = Read-Host "  Ejecutar git push en todos? (S/N)"

    if ($doPush -eq "S" -or $doPush -eq "s") {
        foreach ($r in $uniquePush) {
            Write-Host ""
            Write-Host "  Pushing $($r.Name)..." -ForegroundColor Cyan
            Push-Location $r.Path
            $branch = git branch --show-current
            $pushResult = git push origin $branch 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-OK "Push exitoso"
                $logLines += "$($r.Name): PUSH EXITOSO"
            } else {
                Write-Critical "Error en push: $pushResult"
                $logLines += "$($r.Name): PUSH FALLIDO — $pushResult"
                $repoWarn++
            }
            Pop-Location
        }
    } else {
        Write-Critical "PUSH OMITIDO. Recuerde hacerlo antes de apagar."
        $logLines += "PUSH OMITIDO POR USUARIO"
        $repoWarn++
    }
}

# --- Guardar log ---
$logDir = "d:\DHE dev\.sync-logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir "cierre_$(Get-Date -Format 'yyyy-MM-dd_HHmmss').txt"
$logLines | Out-File -FilePath $logFile -Encoding UTF8
Write-OK "Log guardado en: $logFile"

# --- Resumen Final ---
Write-Host ""
Write-Header "CIERRE COMPLETADO"

$allClean = $true
foreach ($repo in $repos) {
    if (-not (Test-Path $repo.Path)) { continue }
    Push-Location $repo.Path
    $dirty = git status --short
    $branch = git branch --show-current
    $ab = git rev-list --left-right --count "origin/$($repo.Branch)...$branch" 2>&1
    if ($dirty -or ($ab -match "(\d+)\s+(\d+)" -and [int]$Matches[2] -gt 0)) {
        Write-Critical "$($repo.Name) — AUN TIENE CAMBIOS SIN SINCRONIZAR"
        $allClean = $false
    } else {
        Write-OK "$($repo.Name) — sincronizado"
    }
    Pop-Location
}

Write-Host ""
Write-Host "  Repos OK:   $repoOk / $($repos.Count)" -ForegroundColor $(if ($repoOk -eq $repos.Count) { "Green" } else { "Yellow" })
Write-Host "  Alertas:    $repoWarn" -ForegroundColor $(if ($repoWarn -eq 0) { "Green" } else { "Yellow" })

if ($allClean) {
    Write-Host ""
    Write-Host "  TODO SINCRONIZADO. SEGURO PARA APAGAR." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Critical "HAY REPOS SIN SINCRONIZAR. NO APAGUE SIN RESOLVER."
}

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""
