param(
    [string[]] $Targets = @(
        "https://api.danheiexpress.com/api/health",
        "https://admin.danheiexpress.com",
        "https://portal.danheiexpress.com",
        "https://www.danheiexpress.com"
    ),
    [string] $RuntimeCheckToken = "",
    [int] $TimeoutSeconds = 20
)

$ErrorActionPreference = "Continue"

foreach ($url in $Targets) {
    try {
        $timer = [Diagnostics.Stopwatch]::StartNew()
        $response = Invoke-WebRequest `
            -Uri $url `
            -Headers @{
                "User-Agent" = "Mozilla/5.0 Danhei QA Smoke"
                "Accept" = "application/json,text/html,*/*"
            } `
            -UseBasicParsing `
            -TimeoutSec $TimeoutSeconds
        $timer.Stop()

        $contentType = $response.Headers["Content-Type"]
        Write-Output "OK`t$($response.StatusCode)`t$($timer.ElapsedMilliseconds)ms`t$contentType`t$url"
    } catch {
        $status = if ($_.Exception.Response) {
            $_.Exception.Response.StatusCode.value__
        } else {
            "NO_RESPONSE"
        }

        Write-Output "FAIL`t$status`t$url`t$($_.Exception.Message)"
    }
}

if ($RuntimeCheckToken) {
    try {
        $timer = [Diagnostics.Stopwatch]::StartNew()
        $response = Invoke-WebRequest `
            -Uri "https://api.danheiexpress.com/api/runtime-check" `
            -Headers @{
                "User-Agent" = "Mozilla/5.0 Danhei QA Smoke"
                "Accept" = "application/json"
                "Authorization" = "Bearer $RuntimeCheckToken"
            } `
            -UseBasicParsing `
            -TimeoutSec $TimeoutSeconds
        $timer.Stop()

        $contentType = $response.Headers["Content-Type"]
        Write-Output "OK`t$($response.StatusCode)`t$($timer.ElapsedMilliseconds)ms`t$contentType`thttps://api.danheiexpress.com/api/runtime-check"
    } catch {
        $status = if ($_.Exception.Response) {
            $_.Exception.Response.StatusCode.value__
        } else {
            "NO_RESPONSE"
        }

        Write-Output "FAIL`t$status`thttps://api.danheiexpress.com/api/runtime-check`t$($_.Exception.Message)"
    }
}
