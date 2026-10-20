$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'person-path.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$personSlug = [string]$config.slug
if ($personSlug -cnotmatch '^[A-Za-z][A-Za-z0-9-]{0,39}$' -or $personSlug -in @('media', 'vendor', 'output')) {
    throw 'Use a name containing letters, digits or hyphens (maximum 40 characters).'
}
$html = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'index.html'))
if ($html.Contains('<base ')) { throw 'Main entry already defines a base URL' }
$html = $html.Replace('<head>', "<head>`n<base href=`"../`">")
$directory = Join-Path $PSScriptRoot $personSlug
New-Item -ItemType Directory -Path $directory -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $directory 'index.html'), $html, [Text.UTF8Encoding]::new($false))
Write-Output "PERSON_PATH=$personSlug/"
