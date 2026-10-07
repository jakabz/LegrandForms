<#
.SYNOPSIS
  Assigns (or removes) the Nintex form customizer on list content types, as described in deploy/forms.json.

.DESCRIPTION
  For every entry in forms.json the script sets New/Edit/DisplayFormClientSideComponentId to the customizer id and
  the matching ...ClientSideComponentProperties to the JSON configuration (formDefinitionUrl, urlRewrites, ...).
  Look settings (styleMode, hideImages, customCss) come from "defaults" and can be overridden per form entry.
  Optionally uploads the XML definitions (and the custom CSS files) to the definition library first.
  See docs/Fejlesztoi-leiras.md, chapter 8.

.EXAMPLE
  ./deploy/Set-NintexForms.ps1 -Environment DEV -ClientId <entra-app-id> -UploadDefinitions -DefinitionsPath ./samples

.EXAMPLE
  ./deploy/Set-NintexForms.ps1 -Environment PROD -ClientId <entra-app-id> -Remove
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)][ValidateSet('DEV', 'TEST', 'PROD')][string]$Environment,
  [Parameter(Mandatory = $true)][string]$ClientId,
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'forms.json'),
  [switch]$UploadDefinitions,
  [string]$DefinitionsPath = (Join-Path $PSScriptRoot '..' 'samples'),
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
Import-Module PnP.PowerShell

$config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
$envConfig = $config.environments.$Environment
if (-not $envConfig) { throw "Environment '$Environment' is not defined in $ConfigPath" }

Connect-PnPOnline -Url $envConfig.siteUrl -Interactive -ClientId $ClientId
$web = Get-PnPWeb -Includes ServerRelativeUrl
$library = $config.defaults.definitionLibrary
$libraryUrl = ($web.ServerRelativeUrl.TrimEnd('/') + '/' + $library)

if ($UploadDefinitions -and -not $Remove) {
  if (-not (Get-PnPList -Identity $library -ErrorAction SilentlyContinue)) {
    if ($PSCmdlet.ShouldProcess($library, 'Create definition library')) {
      New-PnPList -Title $library -Template DocumentLibrary -Url $library | Out-Null
    }
  }
  foreach ($form in $config.forms) {
    $file = Join-Path $DefinitionsPath $form.definition
    if ($PSCmdlet.ShouldProcess($file, "Upload to $library")) {
      Add-PnPFile -Path $file -Folder $library | Out-Null
      Write-Host "Uploaded $($form.definition)"
    }
    # Custom CSS given by file name lives next to the definition; server-relative URLs are not uploaded.
    $css = if ($form.customCss) { $form.customCss } else { $config.defaults.customCss }
    if ($css -and -not $css.StartsWith('/')) {
      $cssFile = Join-Path $DefinitionsPath $css
      if (-not (Test-Path $cssFile)) { Write-Warning "Custom CSS not found: $cssFile"; continue }
      if ($PSCmdlet.ShouldProcess($cssFile, "Upload to $library")) {
        Add-PnPFile -Path $cssFile -Folder $library | Out-Null
        Write-Host "Uploaded $css"
      }
    }
  }
}

# Per-form value if present, otherwise the default.
function Get-Setting($form, [string]$name) {
  if ($null -ne $form.$name) { return $form.$name }
  return $config.defaults.$name
}

function Get-FormProperties($form) {
  $props = [ordered]@{
    formDefinitionUrl    = "$libraryUrl/$($form.definition)"
    layoutName           = $config.defaults.layoutName
    responsiveBreakpoint = $config.defaults.responsiveBreakpoint
    collapseHiddenRows   = $config.defaults.collapseHiddenRows
    emptyRuleBehavior    = $config.defaults.emptyRuleBehavior
    debug                = if ($null -ne $envConfig.debug) { [bool]$envConfig.debug } else { [bool]$config.defaults.debug }
    urlRewrites          = $envConfig.urlRewrites
    styleMode            = if (Get-Setting $form 'styleMode') { Get-Setting $form 'styleMode' } else { 'fluent' }
  }
  # Without an explicit value hideImages follows styleMode (fluent: hidden, nintex: shown).
  $hideImages = Get-Setting $form 'hideImages'
  if ($null -ne $hideImages) { $props.hideImages = [bool]$hideImages }
  $css = Get-Setting $form 'customCss'
  if ($css) { $props.customCssUrl = if ($css.StartsWith('/')) { $css } else { "$libraryUrl/$css" } }
  return ($props | ConvertTo-Json -Compress -Depth 5)
}

foreach ($form in $config.forms) {
  $ct = Get-PnPContentType -List $form.list -Identity $form.contentType
  if (-not $ct) { Write-Warning "Content type '$($form.contentType)' not found on list '$($form.list)'"; continue }

  $componentId = if ($Remove) { '' } else { $config.componentId }
  $properties = if ($Remove) { '' } else { Get-FormProperties $form }

  if ($PSCmdlet.ShouldProcess("$($form.list) / $($form.contentType)", $(if ($Remove) { 'Remove form customizer' } else { 'Assign form customizer' }))) {
    $ct.NewFormClientSideComponentId = $componentId
    $ct.EditFormClientSideComponentId = $componentId
    $ct.DisplayFormClientSideComponentId = $componentId
    $ct.NewFormClientSideComponentProperties = $properties
    $ct.EditFormClientSideComponentProperties = $properties
    $ct.DisplayFormClientSideComponentProperties = $properties
    $ct.Update($false)
    Invoke-PnPQuery
    Write-Host ("{0}: {1} / {2}" -f $(if ($Remove) { 'Removed' } else { 'Assigned' }), $form.list, $form.contentType)
  }
}
