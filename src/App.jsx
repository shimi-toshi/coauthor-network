import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as d3 from "d3";

import RAW from "./data/papers";

const COLOR_PALETTE = [
  "#E63946","#457B9D","#2A9D8F","#E9C46A","#F4A261",
  "#264653","#6A4C93","#1982C4","#8AC926","#FF595E",
  "#6D6875","#B5838D","#E5989B","#FFB4A2","#FFCDB2",
  "#52B788","#40916C","#2D6A4F","#95D5B2","#D8F3DC",
  "#7400B8","#6930C3","#5390D9","#4EA8DE","#48BFE3",
  "#023E8A","#0077B6","#00B4D8","#90E0EF","#CAF0F8",
  "#D62828","#F77F00","#FCBF49","#EAE2B7","#003049"
];

export default function CoAuthorNetwork() {
  const svgRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [sizeMetric, setSizeMetric] = useState("papers");
  const [components, setComponents] = useState(new Map());
  const [transform, setTransform] = useState(d3.zoomIdentity);
  const [sidebarTab, setSidebarTab] = useState("papers");
  const simulationRef = useRef(null);
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ width: 900, height: 700 });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef(null);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return nodes
      .filter(n => n.id.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStart = a.id.toLowerCase().startsWith(q) ? 0 : 1;
        const bStart = b.id.toLowerCase().startsWith(q) ? 0 : 1;
        return aStart - bStart || b.papers - a.papers;
      })
      .slice(0, 10);
  }, [searchQuery, nodes]);

  const selectSearchResult = useCallback((nodeId) => {
    setSelectedNode(nodeId);
    setSidebarTab("papers");
    setSearchQuery("");
    setSearchFocused(false);
    // Zoom to the selected node
    const node = nodes.find(n => n.id === nodeId);
    if (node && svgRef.current) {
      const svg = d3.select(svgRef.current);
      const w = svgRef.current.clientWidth;
      const h = svgRef.current.clientHeight;
      const scale = 2;
      const tx = w / 2 - node.x * scale;
      const ty = h / 2 - node.y * scale;
      svg.transition().duration(500).call(
        d3.zoom().scaleExtent([0.2, 6]).on("zoom", (e) => setTransform(e.transform)).transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale)
      );
    }
  }, [nodes]);

  // Paper lookup by author
  const papersByAuthor = useMemo(() => {
    const map = new Map();
    RAW.nodes.forEach(n => map.set(n.id, n.paperList || []));
    return map;
  }, []);

  useEffect(() => {
    const nodeData = RAW.nodes.map(n => ({ ...n }));
    const linkData = RAW.links.map(l => ({ ...l }));

    const adj = new Map();
    nodeData.forEach(n => adj.set(n.id, []));
    linkData.forEach(l => {
      adj.get(l.source)?.push(l.target);
      adj.get(l.target)?.push(l.source);
    });

    const visited = new Set();
    const compMap = new Map();
    let compId = 0;
    nodeData.forEach(n => {
      if (!visited.has(n.id)) {
        const queue = [n.id];
        const comp = [];
        while (queue.length) {
          const cur = queue.shift();
          if (visited.has(cur)) continue;
          visited.add(cur);
          comp.push(cur);
          (adj.get(cur) || []).forEach(nb => { if (!visited.has(nb)) queue.push(nb); });
        }
        comp.forEach(id => compMap.set(id, compId));
        compId++;
      }
    });
    setComponents(compMap);

    // Custom force: push apart nodes of different components (colors)
    function forceComponentSeparation(cMap) {
      let simNodes;
      function force(alpha) {
        for (let i = 0; i < simNodes.length; i++) {
          for (let j = i + 1; j < simNodes.length; j++) {
            const a = simNodes[i], b = simNodes[j];
            if ((cMap.get(a.id) ?? 0) === (cMap.get(b.id) ?? 0)) continue;
            const dx = b.x - a.x, dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const rA = Math.max(4, a.papers * 3.5);
            const rB = Math.max(4, b.papers * 3.5);
            const minDist = rA + rB + 10;
            if (dist < minDist) {
              const k = ((minDist - dist) / dist) * alpha * 1.0;
              const mx = dx * k, my = dy * k;
              b.vx += mx; b.vy += my;
              a.vx -= mx; a.vy -= my;
            }
          }
        }
      }
      force.initialize = (_) => { simNodes = _; };
      return force;
    }

    const sim = d3.forceSimulation(nodeData)
      .force("link", d3.forceLink(linkData).id(d => d.id).distance(80).strength(0.4))
      .force("charge", d3.forceManyBody().strength(-200).distanceMax(400))
      .force("center", d3.forceCenter(dims.width / 2, dims.height / 2))
      .force("collision", d3.forceCollide().radius(d => Math.max(4, d.papers * 3.5) + 18))
      .force("componentSep", forceComponentSeparation(compMap))
      .force("x", d3.forceX(dims.width / 2).strength(0.03))
      .force("y", d3.forceY(dims.height / 2).strength(0.03));

    sim.on("tick", () => {
      setNodes([...nodeData]);
      setLinks([...linkData]);
    });
    simulationRef.current = sim;
    return () => sim.stop();
  }, []);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const zoom = d3.zoom().scaleExtent([0.2, 6]).on("zoom", (e) => setTransform(e.transform));
    svg.call(zoom);
    return () => svg.on(".zoom", null);
  }, []);

  const getRadius = useCallback((node) => {
    const val = node[sizeMetric] || 1;
    if (sizeMetric === "citations") return Math.max(4, Math.sqrt(val) * 1.2);
    return Math.max(4, val * 3.5);
  }, [sizeMetric]);

  const getColor = useCallback((nodeId) => {
    const cId = components.get(nodeId) ?? 0;
    return COLOR_PALETTE[cId % COLOR_PALETTE.length];
  }, [components]);

  const neighbors = useMemo(() => {
    const target = selectedNode || hoveredNode;
    if (!target) return null;
    const set = new Set([target]);
    links.forEach(l => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      if (s === target) set.add(t);
      if (t === target) set.add(s);
    });
    return set;
  }, [selectedNode, hoveredNode, links]);

  const getOpacity = useCallback((nodeId) => {
    if (!neighbors) return 1;
    return neighbors.has(nodeId) ? 1 : 0.08;
  }, [neighbors]);

  const getLinkOpacity = useCallback((link) => {
    if (!neighbors) return 0.2;
    const s = typeof link.source === "object" ? link.source.id : link.source;
    const t = typeof link.target === "object" ? link.target.id : link.target;
    return (neighbors.has(s) && neighbors.has(t)) ? 0.6 : 0.03;
  }, [neighbors]);

  const nodeInfo = useMemo(() => {
    const target = selectedNode || hoveredNode;
    if (!target) return null;
    const node = nodes.find(n => n.id === target);
    if (!node) return null;
    const coauthors = [];
    links.forEach(l => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      const w = l.weight || 1;
      if (s === target) coauthors.push({ name: t, weight: w });
      if (t === target) coauthors.push({ name: s, weight: w });
    });
    coauthors.sort((a, b) => b.weight - a.weight);
    return { ...node, coauthors };
  }, [selectedNode, hoveredNode, nodes, links]);

  const handleDrag = useMemo(() => ({
    start: (e, nodeId) => {
      if (!simulationRef.current) return;
      simulationRef.current.alphaTarget(0.3).restart();
      const node = simulationRef.current.nodes().find(n => n.id === nodeId);
      if (node) { node.fx = node.x; node.fy = node.y; }
    },
    drag: (e, nodeId) => {
      const node = simulationRef.current?.nodes().find(n => n.id === nodeId);
      if (node) {
        const rect = svgRef.current.getBoundingClientRect();
        node.fx = (e.clientX - rect.left - transform.x) / transform.k;
        node.fy = (e.clientY - rect.top - transform.y) / transform.k;
      }
    },
    end: (e, nodeId) => {
      if (!simulationRef.current) return;
      simulationRef.current.alphaTarget(0);
      const node = simulationRef.current.nodes().find(n => n.id === nodeId);
      if (node) { node.fx = null; node.fy = null; }
    }
  }), [transform]);

  const [dragging, setDragging] = useState(null);

  const topByPapers = useMemo(() => [...nodes].sort((a, b) => b.papers - a.papers).slice(0, 10), [nodes]);
  const topByDegree = useMemo(() => [...nodes].sort((a, b) => b.degree - a.degree).slice(0, 10), [nodes]);

  const selectedPapers = useMemo(() => {
    const target = selectedNode || hoveredNode;
    if (!target) return [];
    return papersByAuthor.get(target) || [];
  }, [selectedNode, hoveredNode, papersByAuthor]);

  const truncate = (s, len) => s && s.length > len ? s.slice(0, len) + "…" : s;

  const sty = {
    root: { background: "#0a0f1a", height: "100vh", fontFamily: "'JetBrains Mono','SF Mono','Fira Code',monospace", color: "#c8d6e5", display: "flex", flexDirection: "column" },
    header: { padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 },
    btn: (active) => ({ padding: "4px 10px", fontSize: 11, border: active ? "1px solid #457B9D" : "1px solid rgba(255,255,255,0.1)", borderRadius: 4, background: active ? "rgba(69,123,157,0.2)" : "transparent", color: active ? "#8ec5e5" : "#5a6c7f", cursor: "pointer", fontFamily: "inherit" }),
    tab: (active) => ({ padding: "6px 12px", fontSize: 11, border: "none", borderBottom: active ? "2px solid #457B9D" : "2px solid transparent", background: "transparent", color: active ? "#c8d6e5" : "#5a6c7f", cursor: "pointer", fontFamily: "inherit" }),
    card: { padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 12 },
    stat: { background: "rgba(255,255,255,0.03)", padding: "8px", borderRadius: 6, textAlign: "center" },
    paperItem: { padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.04)", marginBottom: 6 },
  };

  return (
    <div style={sty.root}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap'); ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:#0a0f1a} ::-webkit-scrollbar-thumb{background:#1e2a3a;border-radius:3px}`}</style>

      <div style={sty.header}>
        <div>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#f0f4f8", letterSpacing: "-0.02em" }}>Co-authorship Network</h1>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "#5a6c7f" }}>{nodes.length} authors · {links.length} edges · 336 records</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ position: "relative" }} ref={searchRef}>
            <input
              type="text"
              placeholder="著者名を検索..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              onKeyDown={e => {
                if (e.key === "Enter" && searchResults.length > 0) {
                  selectSearchResult(searchResults[0].id);
                }
                if (e.key === "Escape") {
                  setSearchQuery("");
                  setSearchFocused(false);
                  e.target.blur();
                }
              }}
              style={{
                padding: "5px 10px 5px 28px", fontSize: 11, width: 180,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4, color: "#c8d6e5", fontFamily: "inherit", outline: "none",
              }}
            />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5a6c7f" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {searchFocused && searchQuery.trim() && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                background: "#131a2b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 100, maxHeight: 260, overflowY: "auto",
              }}>
                {searchResults.length === 0 ? (
                  <div style={{ padding: "10px 12px", fontSize: 11, color: "#5a6c7f" }}>該当なし</div>
                ) : (
                  searchResults.map(n => (
                    <div
                      key={n.id}
                      onMouseDown={e => { e.preventDefault(); selectSearchResult(n.id); }}
                      style={{
                        padding: "8px 12px", fontSize: 11, cursor: "pointer",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{ color: "#c8d6e5" }}>{n.id}</span>
                      <span style={{ fontSize: 9, color: "#5a6c7f" }}>{n.papers}篇</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#5a6c7f" }}>Size:</span>
            {["papers","citations","degree"].map(m => (
              <button key={m} onClick={() => setSizeMetric(m)} style={sty.btn(sizeMetric === m)}>
                {m === "papers" ? "論文数" : m === "citations" ? "被引用数" : "次数"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <svg ref={svgRef} width="100%" height="100%" style={{ background: "#0a0f1a", cursor: dragging ? "grabbing" : "grab" }} onClick={() => setSelectedNode(null)}>
            <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
              {links.map((l, i) => {
                const sx = typeof l.source === "object" ? l.source.x : 0;
                const sy = typeof l.source === "object" ? l.source.y : 0;
                const tx = typeof l.target === "object" ? l.target.x : 0;
                const ty = typeof l.target === "object" ? l.target.y : 0;
                return <line key={i} x1={sx} y1={sy} x2={tx} y2={ty} stroke="#3a4a5c" strokeWidth={Math.max(0.5, (l.weight||1)*0.8)} opacity={getLinkOpacity(l)} />;
              })}
              {nodes.map(n => {
                const r = getRadius(n);
                const op = getOpacity(n.id);
                const isActive = n.id === selectedNode || n.id === hoveredNode;
                return (
                  <g key={n.id} transform={`translate(${n.x||0},${n.y||0})`} opacity={op} style={{ cursor: "pointer", transition: "opacity 0.15s" }}
                    onMouseEnter={() => !dragging && setHoveredNode(n.id)}
                    onMouseLeave={() => !dragging && setHoveredNode(null)}
                    onClick={e => { e.stopPropagation(); setSelectedNode(n.id === selectedNode ? null : n.id); setSidebarTab("papers"); }}
                    onMouseDown={e => {
                      e.stopPropagation(); setDragging(n.id); handleDrag.start(e, n.id);
                      const onMove = ev => handleDrag.drag(ev, n.id);
                      const onUp = ev => { handleDrag.end(ev, n.id); setDragging(null); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                      window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
                    }}>
                    <circle r={r} fill={getColor(n.id)} stroke={isActive ? "#fff" : "rgba(255,255,255,0.15)"} strokeWidth={isActive ? 2 : 0.5} opacity={0.85} />
                    {(r > 8 || isActive) && <text dy={r+10} textAnchor="middle" fontSize={isActive ? 10 : 8} fontWeight={isActive ? 600 : 400} fill={isActive ? "#f0f4f8" : "#7a8c9f"} style={{ pointerEvents: "none", fontFamily: "inherit" }}>{n.id}</text>}
                  </g>
                );
              })}
            </g>
          </svg>
          <div style={{ position: "absolute", bottom: 10, left: 12, fontSize: 10, color: "#3a4a5c" }}>scroll to zoom · drag to pan · click node to select</div>
        </div>

        {/* Sidebar */}
        <div style={{ width: 310, borderLeft: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {nodeInfo ? (
            <>
              {/* Author header */}
              <div style={{ padding: "14px 14px 0", flexShrink: 0 }}>
                <div style={sty.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <h3 style={{ margin: 0, fontSize: 14, color: "#f0f4f8", fontWeight: 600 }}>{nodeInfo.id}</h3>
                    <button onClick={() => setSelectedNode(null)} style={{ background: "none", border: "none", color: "#5a6c7f", cursor: "pointer", fontSize: 14, padding: 0, fontFamily: "inherit" }}>✕</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 10 }}>
                    {[{ label: "論文数", val: nodeInfo.papers },{ label: "被引用", val: nodeInfo.citations },{ label: "次数", val: nodeInfo.degree }].map(s => (
                      <div key={s.label} style={sty.stat}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: getColor(nodeInfo.id) }}>{s.val}</div>
                        <div style={{ fontSize: 9, color: "#5a6c7f", marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <button style={sty.tab(sidebarTab === "papers")} onClick={() => setSidebarTab("papers")}>論文 ({selectedPapers.length})</button>
                  <button style={sty.tab(sidebarTab === "coauthors")} onClick={() => setSidebarTab("coauthors")}>共著者 ({nodeInfo.coauthors.length})</button>
                </div>
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
                {sidebarTab === "papers" ? (
                  selectedPapers.length === 0 ? (
                    <p style={{ fontSize: 11, color: "#5a6c7f" }}>No papers found.</p>
                  ) : (
                    selectedPapers.map((p, i) => (
                      <div key={i} style={sty.paperItem}>
                        <div style={{ fontSize: 11, color: "#e0e8f0", lineHeight: 1.45, fontWeight: 500, marginBottom: 6 }}>
                          {p.title}
                        </div>
                        <div style={{ fontSize: 10, color: "#5a6c7f", lineHeight: 1.4, marginBottom: 4 }}>
                          {truncate(p.authors, 80)}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 9, color: "#4a5c6f", flex: 1 }}>
                            {truncate(p.journal, 35)} {p.year && `(${p.year})`}
                          </span>
                          <span style={{ fontSize: 9, background: "rgba(42,157,143,0.15)", color: "#6dc9b8", padding: "2px 6px", borderRadius: 10, whiteSpace: "nowrap" }}>
                            TC: {p.tc}
                          </span>
                        </div>
                        {p.doi && (
                          <div style={{ marginTop: 5 }}>
                            <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: "#457B9D", textDecoration: "none" }}>
                              {p.doi}
                            </a>
                          </div>
                        )}
                      </div>
                    ))
                  )
                ) : (
                  nodeInfo.coauthors.map(ca => (
                    <div key={ca.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 8px", background: "rgba(255,255,255,0.02)", borderRadius: 4, cursor: "pointer", marginBottom: 3 }}
                      onClick={() => { setSelectedNode(ca.name); setSidebarTab("papers"); }}>
                      <span style={{ color: "#c8d6e5", fontSize: 11 }}>{ca.name}</span>
                      <span style={{ fontSize: 9, background: "rgba(69,123,157,0.2)", color: "#8ec5e5", padding: "2px 6px", borderRadius: 10 }}>{ca.weight}篇</span>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div style={{ overflowY: "auto", padding: "14px", fontSize: 12 }}>
              <h4 style={{ margin: "0 0 10px", fontSize: 11, color: "#5a6c7f", textTransform: "uppercase", letterSpacing: "0.05em" }}>Top by Papers</h4>
              {topByPapers.map((n, i) => (
                <div key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", cursor: "pointer", borderRadius: 4, background: hoveredNode === n.id ? "rgba(255,255,255,0.04)" : "transparent" }}
                  onMouseEnter={() => setHoveredNode(n.id)} onMouseLeave={() => setHoveredNode(null)} onClick={() => { setSelectedNode(n.id); setSidebarTab("papers"); }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "#3a4a5c", fontSize: 10, width: 16 }}>{i+1}.</span>
                    <span style={{ color: "#c8d6e5", fontSize: 11 }}>{n.id}</span>
                  </span>
                  <span style={{ color: getColor(n.id), fontSize: 11, fontWeight: 600 }}>{n.papers}</span>
                </div>
              ))}
              <h4 style={{ margin: "18px 0 10px", fontSize: 11, color: "#5a6c7f", textTransform: "uppercase", letterSpacing: "0.05em" }}>Top by Degree</h4>
              {topByDegree.map((n, i) => (
                <div key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", cursor: "pointer", borderRadius: 4, background: hoveredNode === n.id ? "rgba(255,255,255,0.04)" : "transparent" }}
                  onMouseEnter={() => setHoveredNode(n.id)} onMouseLeave={() => setHoveredNode(null)} onClick={() => { setSelectedNode(n.id); setSidebarTab("papers"); }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "#3a4a5c", fontSize: 10, width: 16 }}>{i+1}.</span>
                    <span style={{ color: "#c8d6e5", fontSize: 11 }}>{n.id}</span>
                  </span>
                  <span style={{ color: getColor(n.id), fontSize: 11, fontWeight: 600 }}>{n.degree}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
