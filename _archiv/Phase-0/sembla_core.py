#!/usr/bin/env python3
"""
SEMBLA Phase 0 - Referenz-Validator & Fixture-Generator.
Ausfuehrbare Spezifikation der bestaetigten Aufbau-Regeln; Saat fuer den Phase-1-Core.
Einheiten: mm. grid = Rastereinheit (125mm).
"""
import json, math

GRID, COURSE, THICK, ROD = 125, 200, 125, 1100
CHAMBER_OFFSET = 62.5      # Kammerzentrum ab Steinanfang -> globales Lattice 62.5+125k
MAX_SPAN_GRID  = 3         # Vorspannung max. alle 3 Raster (375mm)
FORBIDDEN_N    = {1, 4}    # nicht baubare / nicht versetzbare Segmentbreiten (Raster)

def compositions(n, parts=(2,3)):
    if n==0: return [[]]
    out=[]
    for p in parts:
        if p<=n:
            for t in compositions(n-p,parts): out.append([p]+t)
    return out

def seg_joints(start_grid, tiling):
    js=set(); c=start_grid
    for b in tiling[:-1]:
        c+=b; js.add(c)
    return js

def pick_tiling(start_grid, n, forbidden):
    best=None
    for comp in compositions(n):
        js=seg_joints(start_grid,comp)
        conflict=bool(js & forbidden)
        dist=min((abs(j-f) for j in js for f in forbidden), default=99) if (js and forbidden) else 99
        key=(not conflict, dist)
        if best is None or key>best[0]: best=(key,comp,js,conflict)
    return best[1], best[2], best[3]

def balanced_fill(a,b,maxstep):
    if b<=a: return [a]
    k=math.ceil((b-a)/maxstep)
    return [round(a+(b-a)*i/k) for i in range(k+1)]

def build_wall(name, length_mm, height_mm, openings):
    assert length_mm%GRID==0 and height_mm%COURSE==0
    N=length_mm//GRID; L=height_mm//COURSE
    courses=[]; prev=set(); rigid_lagen=[]; invalid_segments=[]
    for li in range(L):
        cuts=[(0,N)]
        for op in openings:
            if op["l0"]<=li<op["l1"]:
                nc=[]
                for (s,e) in cuts:
                    if op["g1"]<=s or op["g0"]>=e: nc.append((s,e)); continue
                    if op["g0"]>s: nc.append((s,op["g0"]))
                    if op["g1"]<e: nc.append((op["g1"],e))
                cuts=nc
        stones=[]; joints=set(); rig=False
        for (s,e) in cuts:
            w=e-s
            if w in FORBIDDEN_N:
                seg={"lage":li,"start_grid":s,"breite_grid":w}
                if seg not in invalid_segments: invalid_segments.append(seg)
            comp,js,conf=pick_tiling(s,w,prev); rig|=conf; joints|=js
            g=s
            for b in comp:
                stones.append({"type":"i2" if b==2 else "i3","x0":g*GRID,"x1":(g+b)*GRID}); g+=b
        if rig: rigid_lagen.append(li)
        courses.append({"lage":li,"stones":stones,"joints_grid":sorted(joints)})
        prev=joints
    versatz_ok=True; viol=[]
    for li in range(L-1):
        bad=set(courses[li]["joints_grid"]) & set(courses[li+1]["joints_grid"])
        if bad: versatz_ok=False; viol.append({"zwischen_lagen":[li,li+1],"fugen_grid":sorted(bad)})
    inside=lambda k: any(op["g0"]<=k<op["g1"] for op in openings)
    allowed=[k for k in range(N) if not inside(k)]
    runs=[]; cur=[allowed[0]]
    for k in allowed[1:]:
        (cur.append(k) if k==cur[-1]+1 else (runs.append(cur),cur:=[k]))
    runs.append(cur)
    cols=set()
    for run in runs:
        for c in balanced_fill(run[0],run[-1],MAX_SPAN_GRID): cols.add(c)
    must={0,N-1}
    for op in openings:
        if op["g0"]-1>=0: must.add(op["g0"]-1)
        if op["g1"]<=N-1: must.add(op["g1"])
    cols|=(must & set(allowed)); cols=sorted(cols)
    span_ok=True
    for run in runs:
        rc=[c for c in cols if run[0]<=c<=run[-1]]
        for x,y in zip(rc,rc[1:]):
            if y-x>MAX_SPAN_GRID: span_ok=False
    # vertikal: Stangen werden abgelaengt -> letzter Stab gekuerzt, Rest = Verschnitt
    stueck=math.ceil(height_mm/ROD)
    cut_len=height_mm-(stueck-1)*ROD
    verschnitt_col=stueck*ROD-height_mm
    nc=len(cols)
    columns=[{"k":k,"x_mm":CHAMBER_OFFSET+GRID*k,"gewindestangen":stueck,
              "letzte_stange_mm":cut_len,"verschnitt_mm":verschnitt_col,
              "verbindungsmuttern":stueck-1,"stahlplatten_strukturell":2,"spannmuttern":2} for k in cols]
    bom={"i2":0,"i3":0}
    for c in courses:
        for s in c["stones"]: bom[s["type"]]+=1
    bom.update(gewindestangen=stueck*nc, verbindungsmuttern=(stueck-1)*nc,
               stahlplatten=2*nc, spannmuttern=2*nc, verschnitt_mm=verschnitt_col*nc)
    buildable = versatz_ok and not invalid_segments
    return {"name":name,"length_mm":length_mm,"height_mm":height_mm,
            "grid_mm":GRID,"course_mm":COURSE,"thickness_mm":THICK,"rod_mm":ROD,
            "N_grid":N,"lagen":L,"openings":openings,
            "tension_columns":columns,"bom":bom,
            "validation":{"buildable":buildable,"versatz_ok":versatz_ok,"versatz_violations":viol,
                          "tension_span_ok":span_ok,"rigid_lagen":rigid_lagen,
                          "invalid_segments":invalid_segments},
            "courses":courses}

def summarize(w):
    v=w["validation"]
    print(f"=== {w['name']} : {w['length_mm']}x{w['height_mm']}mm (N={w['N_grid']}, {w['lagen']} Lagen) ===")
    print(f"  buildable: {v['buildable']} | Versatz: {v['versatz_ok']} | Abstand: {v['tension_span_ok']} | ungueltige Segmente: {v['invalid_segments']}")
    print(f"  Straenge: {len(w['tension_columns'])} @ k={[c['k'] for c in w['tension_columns']]}")
    print(f"  BOM: {w['bom']}")
    print()

if __name__=="__main__":
    out="/sessions/dreamy-jolly-johnson/mnt/outputs/sembla_phase0"
    walls=[
        build_wall("ref1_glatte_wand", 1000, 2000, []),
        build_wall("ref2_wand_tuer", 2000, 2600, [{"g0":5,"g1":11,"l0":0,"l1":10,"art":"tuer"}]),
        build_wall("ref3_wand_fenster", 2000, 2600, [{"g0":6,"g1":10,"l0":4,"l1":10,"art":"fenster"}]),
    ]
    for w in walls: summarize(w)
    summarize(build_wall("edge_starr_500", 500, 800, []))  # N=4 -> buildable False erwartet
    for w in walls:
        with open(f"{out}/{w['name']}.json","w") as f: json.dump(w,f,indent=2,ensure_ascii=False)
    print("Fixtures:", [w["name"] for w in walls])
