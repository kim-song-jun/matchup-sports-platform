param(
  [int]$Port = 8765
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path "$PSScriptRoot\..\..\docs\reference\handoff-sm-new-direction\sports-platform\project"
$Prefix = "http://127.0.0.1:$Port/"
$Url = "${Prefix}Teameet%20Design.html?v=sm-new"

$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".htm"  = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".jsx"  = "text/plain; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".webp" = "image/webp"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".ico"  = "image/x-icon"
}

$Listener = [System.Net.HttpListener]::new()
$Listener.Prefixes.Add($Prefix)

try {
  $Listener.Start()
} catch {
  Write-Host "Failed to start server on $Prefix" -ForegroundColor Red
  Write-Host "Try a different port, for example:" -ForegroundColor Yellow
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\docs\serve-handoff-sm-new.ps1 -Port 8777"
  throw
}

Write-Host "Serving handoff-sm-new from:" -ForegroundColor Green
Write-Host "  $Root"
Write-Host "Open this URL:" -ForegroundColor Green
Write-Host "  $Url"
Write-Host ""
Write-Host "Press Ctrl+C to stop."

try {
  while ($Listener.IsListening) {
    $Context = $Listener.GetContext()
    $RequestPath = [System.Uri]::UnescapeDataString($Context.Request.Url.AbsolutePath.TrimStart("/"))
    if ([string]::IsNullOrWhiteSpace($RequestPath)) {
      $RequestPath = "Teameet Design.html"
    }

    $FullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $RequestPath))
    if (-not $FullPath.StartsWith($Root.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
      $Context.Response.StatusCode = 403
      $Context.Response.Close()
      continue
    }

    if (-not [System.IO.File]::Exists($FullPath)) {
      $Context.Response.StatusCode = 404
      $Bytes = [System.Text.Encoding]::UTF8.GetBytes("Not found: $RequestPath")
      $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
      $Context.Response.Close()
      continue
    }

    $Ext = [System.IO.Path]::GetExtension($FullPath).ToLowerInvariant()
    $ContentType = $MimeTypes[$Ext]
    if (-not $ContentType) {
      $ContentType = "application/octet-stream"
    }

    $Bytes = [System.IO.File]::ReadAllBytes($FullPath)
    $Context.Response.StatusCode = 200
    $Context.Response.ContentType = $ContentType
    $Context.Response.ContentLength64 = $Bytes.Length
    $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    $Context.Response.Close()
  }
} finally {
  $Listener.Stop()
  $Listener.Close()
}
