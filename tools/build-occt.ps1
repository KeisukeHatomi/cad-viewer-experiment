
param([Parameter(Mandatory=$true)][string]$BuildDirectory, [int]$Jobs = 2, [switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
function Run([string]$Program, [string[]]$Arguments) {
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Program failed ($LASTEXITCODE)" }
}
$BuildDirectory = [IO.Path]::GetFullPath($BuildDirectory)
$source = Join-Path $BuildDirectory 'source'
if (Test-Path $source) { throw 'Use a new build directory for the pinned source.' }
New-Item -ItemType Directory -Force $BuildDirectory | Out-Null
Run 'git' @('clone','--depth','1','--branch','0.0.23','https://github.com/kovacsv/occt-import-js.git',$source)
$commit = & git -C $source rev-parse HEAD
if ($commit -ne 'c2148e54b456b571238d35cac037d304053d64b2') { throw 'Unexpected source commit' }
Run 'git' @('-C',$source,'config','submodule.occt.url','https://github.com/Open-Cascade-SAS/OCCT.git')
Run 'git' @('-C',$source,'submodule','update','--init','--depth','1')
$occtCommit = & git -C (Join-Path $source 'occt') rev-parse HEAD
if ($occtCommit -ne 'd2abb6d844231cb8f29be6894440874a4700e4a5') { throw 'Unexpected OCCT commit' }
function ReplaceSource([string]$RelativePath,[string]$From,[string]$To) {
  $path = Join-Path $source $RelativePath
  $text = [IO.File]::ReadAllText($path)
  if (!$text.Contains($From)) { throw "Source anchor missing in $RelativePath" }
  $lf = [string][char]10
  $newline = if ($text.Contains([string][char]13+$lf)) { [string][char]13+$lf } else { $lf }
  $To = $To.Replace([string][char]13+$lf,$lf).Replace($lf,$newline)
  [IO.File]::WriteAllText($path,$text.Replace($From,$To),[Text.UTF8Encoding]::new($false))
}
ReplaceSource 'CMakeLists.txt' '-sALLOW_MEMORY_GROWTH=1 --no-heap-copy' '-sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=4GB --no-heap-copy'
ReplaceSource 'occt-import-js/src/importer.hpp' 'double angularDeflection;' "double angularDeflection;$([char]10)    bool meshByPart;"
ReplaceSource 'occt-import-js/src/importer.cpp' 'angularDeflection (0.5)' "angularDeflection (0.5),$([char]10)    meshByPart (false)"
ReplaceSource 'occt-import-js/src/js-interface.cpp' 'if (paramsVal.hasOwnProperty ("linearUnit"))' @'
if (paramsVal.hasOwnProperty ("meshByPart")) {
        params.meshByPart = paramsVal["meshByPart"].as<bool> ();
    }
    if (paramsVal.hasOwnProperty ("linearUnit"))
'@
ReplaceSource 'occt-import-js/src/js-interface.cpp' 'const std::vector<uint8_t>& bufferArr =' 'std::vector<uint8_t> bufferArr ='
ReplaceSource 'occt-import-js/src/js-interface.cpp' 'Importer::Result importResult = importer->LoadFile (bufferArr, params);' @'
Importer::Result importResult = importer->LoadFile (bufferArr, params);
    std::vector<uint8_t> ().swap (bufferArr);
    ReportStepProgress ("transferred");
'@
ReplaceSource 'occt-import-js/src/js-interface.cpp' 'resultObj.set ("meshes", meshesArr);' @'
resultObj.set ("meshes", meshesArr);
    unsigned int triangles = 0;
    for (unsigned int i = 0; i < meshesArr["length"].as<unsigned int> (); ++i) {
        triangles += meshesArr[i]["index"]["array"]["length"].as<unsigned int> () / 3;
    }
    resultObj.set ("success", triangles > 0);
    resultObj.set ("triangleCount", triangles);
'@
ReplaceSource 'occt-import-js/src/importer.hpp' 'bool meshByPart;' "bool meshByPart;$([char]10)    bool retryMissingFaces;"
ReplaceSource 'occt-import-js/src/importer.cpp' 'meshByPart (false)' "meshByPart (false),$([char]10)    retryMissingFaces (false)"
ReplaceSource 'occt-import-js/src/js-interface.cpp' 'if (paramsVal.hasOwnProperty ("linearUnit"))' @"
if (paramsVal.hasOwnProperty ("retryMissingFaces")) {
        params.retryMissingFaces = paramsVal["retryMissingFaces"].as<bool> ();
    }
    if (paramsVal.hasOwnProperty ("linearUnit"))
"@
ReplaceSource 'occt-import-js/src/js-interface.cpp' 'emscripten::vecFromJSArray<std::uint8_t> (buffer)' 'emscripten::convertJSArrayToNumberVector<std::uint8_t> (buffer)'
ReplaceSource 'occt-import-js/src/js-interface.cpp' 'HierarchyWriter (emscripten::val& meshesArr)' 'HierarchyWriter (emscripten::val& meshesArr, int meshTotal)'
ReplaceSource 'occt-import-js/src/js-interface.cpp' 'mMeshCount (0)' "mMeshCount (0),$([char]10)        mMeshTotal (meshTotal)"
ReplaceSource 'occt-import-js/src/js-interface.cpp' 'int mMeshCount;' "int mMeshCount;$([char]10)    int mMeshTotal;"
ReplaceSource 'occt-import-js/src/js-interface.cpp' 'HierarchyWriter hierarchyWriter (meshesArr);' @"
int meshTotal = 0;
    EnumerateNodeMeshes (rootNode, [&](const Mesh&) { ++meshTotal; });
    ReportStepProgress ("exporting", 0, meshTotal);
    HierarchyWriter hierarchyWriter (meshesArr, meshTotal);
"@
ReplaceSource 'occt-import-js/src/js-interface.cpp' 'mMeshCount += 1;' @"
mMeshCount += 1;
            if (mMeshCount % 20 == 0 || mMeshCount == mMeshTotal) {
                ReportStepProgress ("exporting", mMeshCount, mMeshTotal);
            }
"@
Copy-Item (Join-Path $PSScriptRoot 'occt-progress.hpp') (Join-Path $source 'occt-import-js/src/occt-progress.hpp')
foreach ($file in @('importer-step.cpp','importer-utils.cpp','js-interface.cpp')) {
  $path = Join-Path $source "occt-import-js/src/$file"
  $text = [IO.File]::ReadAllText($path)
  [IO.File]::WriteAllText($path,'#include "occt-progress.hpp"'+[char]10+$text,[Text.UTF8Encoding]::new($false))
}
ReplaceSource 'occt-import-js/src/importer-step.cpp' 'IFSelect_ReturnStatus readStatus = stepReader.ReadStream' @'
ReportStepProgress ("reading-step");
    IFSelect_ReturnStatus readStatus = stepReader.ReadStream
'@
ReplaceSource 'occt-import-js/src/importer-step.cpp' 'if (!stepCafReader.Transfer (document))' @'
ReportStepProgress ("transferring", 0, stepReader.NbRootsForTransfer ());
    if (!stepCafReader.Transfer (document))
'@
$utilsPath = Join-Path $source 'occt-import-js/src/importer-utils.cpp'
$utils = [IO.File]::ReadAllText($utilsPath)
$functionStart = $utils.IndexOf('bool TriangulateShape (')
if ($functionStart -lt 0) { throw 'Triangulation anchor missing' }
$triangulate = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'triangulate-shape.cpp.inc'))
[IO.File]::WriteAllText($utilsPath,$utils.Substring(0,$functionStart)+$triangulate,[Text.UTF8Encoding]::new($false))
foreach ($class in @('IMeshTools_ModelBuilder','IMeshTools_ModelAlgo')) {
  $path = "occt/src/IMeshTools/$class.hxx"
  ReplaceSource $path 'catch (Standard_Failure const&)' 'catch (Standard_Failure const& failure)'
  $before = if ($class -eq 'IMeshTools_ModelBuilder') { 'SetStatus (Message_Fail2);' } else { 'return Standard_False;' }
  $after = 'std::cerr << "'+$class+' failure: " << (failure.GetMessageString () ? failure.GetMessageString () : "unknown") << std::endl;'+[char]10+'      '+$before
  ReplaceSource $path $before $after
  $full = Join-Path $source $path
  [IO.File]::WriteAllText($full,'#include <iostream>'+[char]10+[IO.File]::ReadAllText($full),[Text.UTF8Encoding]::new($false))
}
& (Join-Path $PSScriptRoot 'optimize-export.ps1') -Source $source
if ($PrepareOnly) { Write-Output "Prepared: $source"; return }
$build = Join-Path $BuildDirectory 'wasm'
Run 'emcmake' @('cmake','-S',$source,'-B',$build,'-G','Ninja','-DEMSCRIPTEN=1','-DCMAKE_BUILD_TYPE=Release')
Run 'cmake' @('--build',$build,'-j',"$Jobs")
Write-Output "Candidate: $build/Release/occt-import-js.js and .wasm"
