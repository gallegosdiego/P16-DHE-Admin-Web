param(
    [string[]] $Targets = @(
        "https://api.danheiexpress.com/api/health",
        "https://api.danheiexpress.com/api/deploy-check",
        "https://admin.danheiexpress.com",
        "https://portal.danheiexpress.com",
        "https://www.danheiexpress.com"
    ),
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
