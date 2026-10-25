param([Parameter(Mandatory=$true)][string]$Source)
$ErrorActionPreference = 'Stop'
function Edit([string]$Relative,[string]$Before,[string]$After) {
  $path = Join-Path $Source $Relative
  $content = [IO.File]::ReadAllText($path)
  $lf = [string][char]10
  $newline = if ($content.Contains([string][char]13+$lf)) { [string][char]13+$lf } else { $lf }
  $Before = $Before.Replace([string][char]13+$lf,$lf).Replace($lf,$newline)
  $After = $After.Replace([string][char]13+$lf,$lf).Replace($lf,$newline)
  if (!$content.Contains($Before)) { throw "Optimization anchor missing: $Relative / $Before" }
  [IO.File]::WriteAllText($path,$content.Replace($Before,$After),[Text.UTF8Encoding]::new($false))
}
$js = 'occt-import-js/src/js-interface.cpp'
Edit $js '#include <emscripten/bind.h>' "#include <emscripten/bind.h>`n#include `"buffered-array-writer.hpp`""
Copy-Item (Join-Path $PSScriptRoot 'buffered-array-writer.hpp') (Join-Path $Source 'occt-import-js/src/buffered-array-writer.hpp')
Edit $js 'emscripten::val brepFaceArr (emscripten::val::array ());' @'
emscripten::val brepFaceArr (emscripten::val::array ());
            BufferedArrayWriter positions (positionArr), normals (normalArr), indices (indexArr);
'@
foreach ($entry in @(@('positionArr','vertexCount','positions'),@('normalArr','normalCount','normals'))) {
  Edit $js ("{0}.set ({1} * 3, x);`n                    {0}.set ({1} * 3 + 1, y);`n                    {0}.set ({1} * 3 + 2, z);" -f $entry[0],$entry[1]) ($entry[2]+'.Add (x, y, z);')
}
Edit $js @'
indexArr.set (triangleCount * 3, vertexOffset + v0);
                    indexArr.set (triangleCount * 3 + 1, vertexOffset + v1);
                    indexArr.set (triangleCount * 3 + 2, vertexOffset + v2);
'@ 'indices.Add (vertexOffset + v0, vertexOffset + v1, vertexOffset + v2);'
Edit $js 'emscripten::val attributesObj (emscripten::val::object ());' @'
positions.Flush (); normals.Flush (); indices.Flush ();
            emscripten::val attributesObj (emscripten::val::object ());
'@
Edit 'occt-import-js/src/importer.hpp' 'bool retryMissingFaces;' "bool retryMissingFaces;`n    bool readFaceColors;"
Edit 'occt-import-js/src/importer.cpp' 'retryMissingFaces (false)' "retryMissingFaces (false),`n    readFaceColors (true)"
Edit $js 'if (paramsVal.hasOwnProperty ("linearUnit"))' @'
if (paramsVal.hasOwnProperty ("readFaceColors")) {
        params.readFaceColors = paramsVal["readFaceColors"].as<bool> ();
    }
    if (paramsVal.hasOwnProperty ("linearUnit"))
'@
Edit $js 'HierarchyWriter (emscripten::val& meshesArr, int meshTotal)' 'HierarchyWriter (emscripten::val& meshesArr, int meshTotal, bool readFaceColors)'
Edit $js 'mMeshTotal (meshTotal)' "mMeshTotal (meshTotal),`n        mReadFaceColors (readFaceColors)"
Edit $js 'int mMeshTotal;' "int mMeshTotal;`n    bool mReadFaceColors;"
Edit $js 'if (face.GetColor (faceColor))' 'if (mReadFaceColors && face.GetColor (faceColor))'
Edit $js 'HierarchyWriter hierarchyWriter (meshesArr, meshTotal);' 'HierarchyWriter hierarchyWriter (meshesArr, meshTotal, params.readFaceColors);'
# Cache only the root traversal that performs meshing; hierarchy and placement
# enumeration still follow the original code and mesh order.
$path = Join-Path $Source 'occt-import-js/src/importer-xcaf.cpp'
$content = [IO.File]::ReadAllText($path)
$start = $content.IndexOf('class XcafRootNode')
$end = $content.IndexOf('ImporterXcaf::ImporterXcaf')
if ($start -lt 0 -or $end -lt $start) { throw 'Root class boundaries missing' }
$root = $content.Substring($start,$end-$start)
$lf = [string][char]10
$nl = if ($root.Contains([string][char]13+$lf)) { [string][char]13+$lf } else { $lf }
$before = '        TDF_Label mainLabel = shapeTool->Label ();'
if (!$root.Contains($before)) { throw 'Root children anchor missing' }
$root = $root.Replace($before,'        if (childrenReady) return cachedChildren;'+$nl+$before)
$root = $root.Replace('        return children;','        cachedChildren = children;'+$nl+'        childrenReady = true;'+$nl+'        return cachedChildren;')
$root = $root.Replace('    const ImportParams& params;','    const ImportParams& params;'+$nl+'    mutable bool childrenReady = false;'+$nl+'    mutable std::vector<NodePtr> cachedChildren;')
[IO.File]::WriteAllText($path,$content.Substring(0,$start)+$root+$content.Substring($end),[Text.UTF8Encoding]::new($false))
