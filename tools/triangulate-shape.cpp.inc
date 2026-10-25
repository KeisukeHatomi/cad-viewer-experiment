
#include <TopTools_IndexedMapOfShape.hxx>
#include <Standard_Failure.hxx>
#include <iostream>

// Bounding-box deflection follows upstream semantics for both modes.
bool TriangulateShape (TopoDS_Shape& shape, const ImportParams& params)
{
    Standard_Real linDeflection = params.linearDeflection;
    Standard_Real angDeflection = params.angularDeflection;
    if (params.linearDeflectionType == ImportParams::LinearDeflectionType::BoundingBoxRatio) {
        Bnd_Box boundingBox;
        BRepBndLib::Add (shape, boundingBox, false);
        if (boundingBox.IsVoid ()) return false;
        Standard_Real xMin, yMin, zMin, xMax, yMax, zMax;
        boundingBox.Get (xMin, yMin, zMin, xMax, yMax, zMax);
        Standard_Real avgSize = ((xMax-xMin) + (yMax-yMin) + (zMax-zMin)) / 3.0;
        linDeflection = avgSize * params.linearDeflection;
        if (linDeflection < Precision::Confusion ()) {
            linDeflection = UnitsMethods::GetLengthUnitScale (
                UnitsMethods_LengthUnit_Millimeter, LinearUnitToLengthUnit (params.linearUnit));
        }
    }
    int flags = 0;
    auto meshOne = [&](const TopoDS_Shape& target, Standard_Real deflection) {
        try {
            BRepMesh_IncrementalMesh mesh (target, deflection, Standard_False, angDeflection);
            flags |= mesh.GetStatusFlags ();
            if (!mesh.IsDone ()) std::cerr << "OCCT mesh not done" << std::endl;
        } catch (const Standard_Failure& failure) {
            std::cerr << "OCCT mesh exception: " << (failure.GetMessageString () ? failure.GetMessageString () : "unknown") << std::endl;
        }
    };
    if (!params.meshByPart) {
        ReportStepProgress ("meshing");
        meshOne (shape, linDeflection);
    } else {
        TopTools_IndexedMapOfShape parts;
        auto collect = [&](TopAbs_ShapeEnum type, TopAbs_ShapeEnum avoid) {
            for (TopExp_Explorer ex (shape, type, avoid); ex.More (); ex.Next ()) {
                TopoDS_Shape local = ex.Current ();
                // Triangulation belongs to the shared TShape. Output keeps each original placement.
                local.Location (TopLoc_Location ());
                parts.Add (local);
            }
        };
        collect (TopAbs_SOLID, TopAbs_SHAPE);
        collect (TopAbs_SHELL, TopAbs_SOLID);
        collect (TopAbs_FACE, TopAbs_SHELL);
        ReportStepProgress ("meshing-parts", 0, parts.Extent ());
        for (int i = 1; i <= parts.Extent (); ++i) {
            meshOne (parts (i), linDeflection);
            if (i % 10 == 0 || i == parts.Extent ()) ReportStepProgress ("meshing-parts", i, parts.Extent (), flags);
        }
    }
    if (params.meshByPart && params.retryMissingFaces) {
        TopTools_IndexedMapOfShape missing;
        for (TopExp_Explorer ex (shape, TopAbs_FACE); ex.More (); ex.Next ()) {
            TopoDS_Shape local = ex.Current ();
            local.Location (TopLoc_Location ());
            TopLoc_Location location;
            Handle (Poly_Triangulation) triangles = BRep_Tool::Triangulation (TopoDS::Face (local), location);
            if (triangles.IsNull () || triangles->NbTriangles () == 0) missing.Add (local);
        }
        ReportStepProgress ("meshing-faces", 0, missing.Extent (), flags);
        for (int i = 1; i <= missing.Extent (); ++i) {
            // Keep the exact face and its model tolerances. Only refine the display mesh.
            Standard_Real retryDeflection = linDeflection;
            for (int attempt = 0; attempt < 4; ++attempt) {
                meshOne (missing (i), retryDeflection);
                TopLoc_Location location;
                Handle (Poly_Triangulation) triangles = BRep_Tool::Triangulation (TopoDS::Face (missing (i)), location);
                if (!triangles.IsNull () && triangles->NbTriangles () > 0) break;
                retryDeflection = Max (Precision::Confusion (), retryDeflection * 0.1);
            }
            if (i % 10 == 0 || i == missing.Extent ()) ReportStepProgress ("meshing-faces", i, missing.Extent (), flags);
        }
    }
    int faces = 0, triangulated = 0;
    for (TopExp_Explorer ex (shape, TopAbs_FACE); ex.More (); ex.Next ()) {
        ++faces;
        TopLoc_Location location;
        Handle (Poly_Triangulation) triangles = BRep_Tool::Triangulation (TopoDS::Face (ex.Current ()), location);
        if (!triangles.IsNull () && triangles->NbTriangles () > 0) ++triangulated;
    }
    ReportStepProgress ("meshed", triangulated, faces, flags);
    // Preserve empty parts for downstream validation instead of silently dropping subassemblies.
    return true;
}
