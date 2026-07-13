#!/usr/bin/env python3
"""
SEMBLA IFC4-Export via IfcOpenShell (LGPL) — Phase-1-Interoperabilität, Python/pyRevit-Seite.

Robuster, normkonformer IFC4-Writer als Ersatz für den handgeschriebenen IFC-String.
Erzeugt Projekt → Gelände → Gebäude → Ebene und je Wand einen IfcWallStandardCase
mit extrudierter Rechteck-Geometrie (Länge × Wandstärke, Höhe) und korrekter Platzierung.

Datenmodell wie sembla-cad.mjs (Einheiten intern mm; IFC in Metern).

CLI:  python3 sembla_ifc.py projekt.json ausgabe.ifc
"""
import json
import math
import sys
import time

import ifcopenshell
import ifcopenshell.guid

THICK_MM = 125


def _guid():
    return ifcopenshell.guid.new()


def create_ifc(project):
    f = ifcopenshell.file(schema="IFC4")

    person = f.create_entity("IfcPerson", FamilyName="SEMBLA")
    org = f.create_entity("IfcOrganization", Name="Polycare")
    pando = f.create_entity("IfcPersonAndOrganization", ThePerson=person, TheOrganization=org)
    app = f.create_entity("IfcApplication", ApplicationDeveloper=org, Version="1.0",
                          ApplicationFullName="SEMBLA Planungs-Suite", ApplicationIdentifier="SEMBLA")
    owner = f.create_entity("IfcOwnerHistory", OwningUser=pando, OwningApplication=app,
                            ChangeAction="ADDED", CreationDate=int(time.time()))

    length = f.create_entity("IfcSIUnit", UnitType="LENGTHUNIT", Name="METRE")
    area = f.create_entity("IfcSIUnit", UnitType="AREAUNIT", Name="SQUARE_METRE")
    vol = f.create_entity("IfcSIUnit", UnitType="VOLUMEUNIT", Name="CUBIC_METRE")
    units = f.create_entity("IfcUnitAssignment", Units=[length, area, vol])

    origin = f.create_entity("IfcCartesianPoint", Coordinates=(0., 0., 0.))
    wcs = f.create_entity("IfcAxis2Placement3D", Location=origin)
    ctx = f.create_entity("IfcGeometricRepresentationContext", ContextType="Model",
                          CoordinateSpaceDimension=3, Precision=1e-5, WorldCoordinateSystem=wcs)
    body_ctx = f.create_entity("IfcGeometricRepresentationSubContext", ContextIdentifier="Body",
                               ContextType="Model", ParentContext=ctx, TargetView="MODEL_VIEW")

    proj = f.create_entity("IfcProject", GlobalId=_guid(), OwnerHistory=owner,
                           Name=project.get("name", "SEMBLA Projekt"),
                           RepresentationContexts=[ctx], UnitsInContext=units)

    def placement(rel=None, x=0., y=0., z=0., rot_deg=0.):
        loc = f.create_entity("IfcCartesianPoint", Coordinates=(float(x), float(y), float(z)))
        kw = {"Location": loc}
        if rot_deg:
            a = math.radians(rot_deg)
            kw["Axis"] = f.create_entity("IfcDirection", DirectionRatios=(0., 0., 1.))
            kw["RefDirection"] = f.create_entity("IfcDirection", DirectionRatios=(math.cos(a), math.sin(a), 0.))
        ax = f.create_entity("IfcAxis2Placement3D", **kw)
        return f.create_entity("IfcLocalPlacement", PlacementRelTo=rel, RelativePlacement=ax)

    site_pl = placement()
    site = f.create_entity("IfcSite", GlobalId=_guid(), OwnerHistory=owner, Name="Gelände",
                           ObjectPlacement=site_pl, CompositionType="ELEMENT")
    bldg_pl = placement(site_pl)
    bldg = f.create_entity("IfcBuilding", GlobalId=_guid(), OwnerHistory=owner, Name="Gebäude",
                           ObjectPlacement=bldg_pl, CompositionType="ELEMENT")
    storey_pl = placement(bldg_pl)
    storey = f.create_entity("IfcBuildingStorey", GlobalId=_guid(), OwnerHistory=owner, Name="Ebene 0",
                             ObjectPlacement=storey_pl, CompositionType="ELEMENT", Elevation=0.)
    f.create_entity("IfcRelAggregates", GlobalId=_guid(), OwnerHistory=owner, RelatingObject=proj, RelatedObjects=[site])
    f.create_entity("IfcRelAggregates", GlobalId=_guid(), OwnerHistory=owner, RelatingObject=site, RelatedObjects=[bldg])
    f.create_entity("IfcRelAggregates", GlobalId=_guid(), OwnerHistory=owner, RelatingObject=bldg, RelatedObjects=[storey])

    walls = []
    T = THICK_MM / 1000.0
    for w in project["walls"]:
        wd = w["wall"]
        L, H = wd["length_mm"] / 1000.0, wd["height_mm"] / 1000.0
        wpl = placement(storey_pl, w.get("x_mm", 0) / 1000.0, w.get("y_mm", 0) / 1000.0, 0., w.get("rot_deg", 0))
        prof_pos = f.create_entity("IfcAxis2Placement2D",
                                   Location=f.create_entity("IfcCartesianPoint", Coordinates=(L / 2., T / 2.)))
        prof = f.create_entity("IfcRectangleProfileDef", ProfileType="AREA", Position=prof_pos, XDim=L, YDim=T)
        solid_pos = f.create_entity("IfcAxis2Placement3D",
                                    Location=f.create_entity("IfcCartesianPoint", Coordinates=(0., 0., 0.)))
        solid = f.create_entity("IfcExtrudedAreaSolid", SweptArea=prof, Position=solid_pos,
                                ExtrudedDirection=f.create_entity("IfcDirection", DirectionRatios=(0., 0., 1.)), Depth=H)
        shape = f.create_entity("IfcShapeRepresentation", ContextOfItems=body_ctx,
                                RepresentationIdentifier="Body", RepresentationType="SweptSolid", Items=[solid])
        pds = f.create_entity("IfcProductDefinitionShape", Representations=[shape])
        wall = f.create_entity("IfcWallStandardCase", GlobalId=_guid(), OwnerHistory=owner,
                               Name=w.get("name", "Wand"), ObjectPlacement=wpl, Representation=pds)
        walls.append(wall)

    f.create_entity("IfcRelContainedInSpatialStructure", GlobalId=_guid(), OwnerHistory=owner,
                    Name="Wände", RelatingStructure=storey, RelatedElements=walls)
    return f


def save_ifc(project, path):
    create_ifc(project).write(path)
    return path


def _normalize(data):
    project = data.get("projekt") or data.get("project") or data
    if "walls" not in project and "wall" in project:
        project = {"name": data.get("name", "Projekt"), "walls": [project]}
    if "walls" not in project and ("courses" in project or "length_mm" in project):
        project = {"name": project.get("name", "Wand"), "walls": [{"name": project.get("name", "Wand"), "wall": project}]}
    return project


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 1
    with open(argv[1], "r", encoding="utf-8") as fh:
        project = _normalize(json.load(fh))
    save_ifc(project, argv[2])
    print(f"IFC4 geschrieben: {argv[2]}  ({len(project['walls'])} Wand/Wände)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
