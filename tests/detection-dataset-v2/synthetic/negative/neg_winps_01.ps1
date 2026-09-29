# Plain build script -- readable commands, nothing encoded.
Param([string]$Configuration = "Release")

Write-Host "Building $Configuration"
dotnet restore
dotnet build --configuration $Configuration --no-restore
