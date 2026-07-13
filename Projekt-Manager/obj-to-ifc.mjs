// OBJ -> IFC4 IfcFacetedBrep.
// Konvention der Quell-OBJ: X=Länge, Y=Tiefe, Z=Höhe (mm), Nullpunkt unten-vorne-links.
// IFC ist in Metern, Z-aufrecht -> 1:1-Übernahme, nur mm->m.

export function parseObj(text){
  const V=[], faces=[];
  for(const ln of text.split('\n')){
    if(ln[0]==='v'&&ln[1]===' '){ const p=ln.split(/\s+/); V.push([+p[1],+p[2],+p[3]]); }
    else if(ln[0]==='f'&&ln[1]===' '){
      const idx=ln.trim().split(/\s+/).slice(1).map(t=>parseInt(t.split('/')[0],10)-1);
      faces.push(idx);
    }
  }
  return {V, faces};
}

// Euler-/Watertight-Check: V - E + F = 2 (geschlossener Mannigfaltigkeit, Genus 0);
// jede Kante muss von genau 2 Facetten geteilt werden.
export function meshStats(V, faces){
  const edge=new Map();
  for(const f of faces){ for(let i=0;i<f.length;i++){ const a=f[i], b=f[(i+1)%f.length];
    const k=a<b?a+'_'+b:b+'_'+a; edge.set(k,(edge.get(k)||0)+1); } }
  let boundary=0, nonmanifold=0;
  for(const c of edge.values()){ if(c===1) boundary++; else if(c>2) nonmanifold++; }
  const Vn=V.length, En=edge.size, Fn=faces.length;
  return {V:Vn, E:En, F:Fn, euler:Vn-En+Fn, boundaryEdges:boundary, nonManifoldEdges:nonmanifold, closed:boundary===0&&nonmanifold===0};
}

// Erzeugt die Brep-Entities in einer Ifc-Factory und liefert die FacetedBrep-Referenz.
// f: { e(type,args)->"#id" }, F: mm->m Formatter.
export function facetedBrepEntities(f, F, V, faces){
  const ptRef = V.map(v=>f.e('IFCCARTESIANPOINT', `(${F(v[0])},${F(v[1])},${F(v[2])})`));
  const faceRefs = faces.map(idx=>{
    const loop = f.e('IFCPOLYLOOP', `(${idx.map(i=>ptRef[i]).join(',')})`);
    const bound = f.e('IFCFACEOUTERBOUND', `${loop},.T.`);
    return f.e('IFCFACE', `(${bound})`);
  });
  const shell = f.e('IFCCLOSEDSHELL', `(${faceRefs.join(',')})`);
  return f.e('IFCFACETEDBREP', `${shell}`);
}

// Vollständige eigenständige IFC4-Datei mit einem Stein als IfcBuildingElementProxy (Brep-Body).
export function objToIfcFile(objText, name){
  const {V, faces}=parseObj(objText);
  let n=0; const lines=[];
  const e=(t,a)=>{ n++; lines.push(`#${n}=${t}(${a});`); return `#${n}`; };
  const F=v=>(v/1000).toFixed(6);
  const guid=()=>{ const c="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$"; let s=""; for(let i=0;i<22;i++) s+=c[Math.floor(Math.random()*64)]; return s; };
  const dir0=e('IFCDIRECTION','(1.,0.,0.)');
  const org0=e('IFCCARTESIANPOINT','(0.,0.,0.)');
  const axis3=e('IFCAXIS2PLACEMENT3D',`${org0},$,$`);
  const ctx=e('IFCGEOMETRICREPRESENTATIONCONTEXT',`$,'Model',3,1.E-05,${axis3},$`);
  const lenU=e('IFCSIUNIT','*,.LENGTHUNIT.,$,.METRE.');
  const areaU=e('IFCSIUNIT','*,.AREAUNIT.,$,.SQUARE_METRE.');
  const volU=e('IFCSIUNIT','*,.VOLUMEUNIT.,$,.CUBIC_METRE.');
  const units=e('IFCUNITASSIGNMENT',`(${lenU},${areaU},${volU})`);
  const proj=e('IFCPROJECT',`'${guid()}',$,'${name}',$,$,$,$,(${ctx}),${units}`);
  const sitePl=e('IFCLOCALPLACEMENT',`$,${axis3}`);
  const site=e('IFCSITE',`'${guid()}',$,'Gelände',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$`);
  const bldgPl=e('IFCLOCALPLACEMENT',`${sitePl},${axis3}`);
  const bldg=e('IFCBUILDING',`'${guid()}',$,'Gebäude',$,$,${bldgPl},$,$,.ELEMENT.,$,$,$`);
  const storPl=e('IFCLOCALPLACEMENT',`${bldgPl},${axis3}`);
  const storey=e('IFCBUILDINGSTOREY',`'${guid()}',$,'Ebene 0',$,$,${storPl},$,$,.ELEMENT.,0.`);
  e('IFCRELAGGREGATES',`'${guid()}',$,$,$,${proj},(${site})`);
  e('IFCRELAGGREGATES',`'${guid()}',$,$,$,${site},(${bldg})`);
  e('IFCRELAGGREGATES',`'${guid()}',$,$,$,${bldg},(${storey})`);
  const brep=facetedBrepEntities({e}, F, V, faces);
  const rep=e('IFCSHAPEREPRESENTATION',`${ctx},'Body','Brep',(${brep})`);
  const pds=e('IFCPRODUCTDEFINITIONSHAPE',`$,$,(${rep})`);
  const elPl=e('IFCLOCALPLACEMENT',`${storPl},${axis3}`);
  const proxy=e('IFCBUILDINGELEMENTPROXY',`'${guid()}',$,'${name}',$,$,${elPl},${pds},$,.NOTDEFINED.`);
  e('IFCRELCONTAINEDINSPATIALSTRUCTURE',`'${guid()}',$,$,$,(${proxy}),${storey}`);
  const ts=new Date().toISOString().replace(/\.\d+Z$/,'');
  return ['ISO-10303-21;','HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    `FILE_NAME('${name}.ifc','${ts}',(''),(''),'SEMBLA','SEMBLA','');`,
    "FILE_SCHEMA(('IFC4'));",'ENDSEC;','DATA;',
    ...lines,'ENDSEC;','END-ISO-10303-21;',''].join('\n');
}
