"use client"

import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react"
import Link from "next/link"
import { ReactFlow, applyNodeChanges, Background, Controls, MiniMap, Handle, useUpdateNodeInternals, Position, MarkerType, type NodeProps, type Connection, type ReactFlowInstance, type NodeChange } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { ArrowLeft, ArrowRight, Check, ChevronDown, Flag, GitBranch, LayoutGrid, MessageSquare, Play, Plus, RotateCcw, Save, Trash2, Undo2, Redo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { api, type SalesGraphFlow, type SalesGraphNode, type SalesGraphRoute } from "@/lib/api"
import { answerFields, arrangeGraph, exampleGraph, newQuestion, validateGraph } from "@/lib/sales-flow"
import { reconcileSalesCanvasNodes, type SalesCanvasNode as FlowNode } from "@/lib/sales-flow-canvas"
import { confirmDiscardUnsaved, registerUnsavedGuard } from "@/lib/unsaved-guard"
import { useCurrentUser } from "@/lib/current-user-context"
import { SalesFlowTransferButtons } from "@/components/sales-flow-transfer-buttons"

const QuestionNode = memo(function QuestionNode({ id, data, selected }: NodeProps<FlowNode>) {
  const q = data.question
  const updateHandles = useUpdateNodeInternals()
  useEffect(() => { updateHandles(id) }, [id, q.routes.length, data.start, updateHandles])
  return <div className={`relative w-[290px] rounded-2xl border bg-card shadow-sm transition-shadow ${selected ? "border-primary ring-2 ring-primary/20 shadow-lg" : data.unreachable ? "border-amber-500" : "border-border"}`}>
    {data.start && <div className="rounded-t-2xl bg-primary/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary">Conversation starts here</div>}
    <Handle type="target" position={Position.Top} className="!size-3 !border-2 !border-background !bg-primary" />
    <div className="px-4 pt-4 pb-3">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"><MessageSquare className="size-3.5" />Ask a question</div>
      <div className={`line-clamp-3 text-sm font-semibold leading-relaxed ${!q.text ? "text-muted-foreground" : ""}`}>{q.text || "Write your question…"}</div>
      {q.variable && <div className="mt-3 inline-block max-w-full truncate rounded bg-muted px-2 py-1 font-mono text-[11px] text-primary">{q.variable}</div>}
      {data.unreachable && <p className="mt-2 text-xs text-amber-700">Connect this question to the flow</p>}
    </div>
    <div className="border-t border-border/60 py-1">
      {q.routes.map((r, index) => <div key={r.id} className="relative flex min-h-10 items-center gap-2 border-b border-border/40 px-4 py-2 text-xs last:border-0">
        <span className={`size-1.5 shrink-0 rounded-full ${r.condition === null ? "bg-muted-foreground" : "bg-primary"}`} />
        <span className="min-w-0 truncate text-muted-foreground">{r.condition === null ? (q.routes.length === 1 ? "Continue" : "Otherwise / unclear") : r.condition || `Describe path ${index + 1}…`}</span>
        {r.target === null && <span className="ml-auto shrink-0 text-[9px] uppercase text-muted-foreground">Finish</span>}
      </div>)}
    </div>
    {/* One port per route along the bottom edge, in route order, so edges leave downward. */}
    {q.routes.map((r, index) => <Handle key={r.id} type="source" position={Position.Bottom} id={r.id} style={{ left: `${((index + 0.5) / q.routes.length) * 100}%` }} className={`!size-3 !border-2 !border-background ${r.condition === null ? "!bg-muted-foreground" : "!bg-primary"}`} />)}
  </div>
})
const nodeTypes = { question: QuestionNode }
const edgeLabel = (condition: string) => condition.length > 28 ? `${condition.slice(0, 27)}…` : condition || undefined
const inputClass = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
const emptyFlow: SalesGraphFlow = { version: 2, entry_id: null, nodes: [] }

type HotelScript = { sales_intake_graph: SalesGraphFlow; sales_intake_recommended_graph: SalesGraphFlow; sales_intake_flow: SalesGraphFlow | null }

function PathPreview({ flow, open, onOpenChange }: { flow: SalesGraphFlow; open: boolean; onOpenChange: (value: boolean) => void }) {
  const [current, setCurrent] = useState(flow.entry_id)
  const [answer, setAnswer] = useState("")
  const [history, setHistory] = useState<{ id: string; answer: string }[]>([])
  const node = flow.nodes.find(n => n.id === current)
  const variables = Object.fromEntries(history.flatMap(step => {
    const n = flow.nodes.find(q => q.id === step.id)
    return n?.variable && step.answer.trim() ? [[n.variable, step.answer.trim()]] : []
  }))
  function reset() { setCurrent(flow.entry_id); setAnswer(""); setHistory([]) }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Walk through a conversation</DialogTitle><DialogDescription>Try an answer, then choose the route it should match. On a live call, the agent interprets the meaning of the answer.</DialogDescription></DialogHeader>
    <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{history.length} steps followed</span><Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="mr-2 size-3" /> Restart</Button></div>
    {node ? <div className="space-y-4">
      <div className="rounded-xl bg-primary/5 p-5"><p className="mb-2 text-xs text-primary">Your agent asks</p><p className="font-medium leading-relaxed">{node.text}</p></div>
      <label className="block space-y-2 text-sm">Caller’s answer<textarea className={inputClass} rows={3} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type a sample answer…" /></label>
      <div className="space-y-2">{node.routes.map(r => <Button key={r.id} variant="outline" className="h-auto w-full justify-between whitespace-normal py-3 text-left" onClick={() => { setHistory([...history, {id:node.id, answer}]); setCurrent(r.target); setAnswer("") }}><span>{r.condition ?? (node.routes.length === 1 ? "Continue" : "Otherwise / unclear")}</span><ArrowRight className="ml-3 size-4 shrink-0" /></Button>)}</div>
    </div> : <div className="rounded-xl bg-emerald-50 p-5 text-sm text-emerald-900"><Check className="mb-2 size-5" /><strong>Intake complete</strong><p className="mt-1">The agent submits the answers from this path and closes the call. Questions on other branches are not asked.</p></div>}
    {history.length > 0 && <Button variant="ghost" className="justify-start" onClick={() => {const prev=history.at(-1)!;setHistory(history.slice(0,-1));setCurrent(prev.id);setAnswer(prev.answer)}}><ArrowLeft className="mr-2 size-4" /> Back one step</Button>}
    <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Captured variables</p><pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(variables, null, 2)}</pre></div>
  </DialogContent></Dialog>
}

export function SalesFlowBuilder({ hotelId, hotelName }: { hotelId: string; hotelName: string }) {
  const [graph, setGraph] = useState<SalesGraphFlow>(emptyFlow)
  const [recommended, setRecommended] = useState<SalesGraphFlow>(emptyFlow)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [nodes, setNodes] = useState<FlowNode[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [retry, setRetry] = useState(0)
  const [preview, setPreview] = useState<SalesGraphFlow | null>(null)
  const [undo, setUndo] = useState<SalesGraphFlow[]>([])
  const [redo, setRedo] = useState<SalesGraphFlow[]>([])
  const { isPlatformAdmin } = useCurrentUser()
  const canvas = useRef<ReactFlowInstance<FlowNode> | null>(null)
  const graphRef = useRef(graph); graphRef.current = graph
  const snapshot = JSON.stringify(graph)
  const dirty = baseline !== null && snapshot !== baseline
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty
  const errors = useMemo(() => validateGraph(graph), [graph])
  const active = graph.nodes.find(n => n.id === selected)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    api<HotelScript>(`/api/v1/admin/hotels/${encodeURIComponent(hotelId)}`).then(hotel => {
      if (cancelled) return
      if (!hotel.sales_intake_graph) throw new Error("The backend needs the graph-builder update before this script can be edited.")
      setGraph(hotel.sales_intake_graph); setRecommended(hotel.sales_intake_recommended_graph)
      setBaseline(JSON.stringify(hotel.sales_intake_graph)); setSelected(hotel.sales_intake_graph.entry_id)
    }).catch(e => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load the script.") })
    return () => { cancelled = true }
  }, [hotelId, retry])
  useEffect(() => registerUnsavedGuard(() => dirtyRef.current ? "Discard your unsaved script changes?" : null), [])
  useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (dirtyRef.current) {event.preventDefault();event.returnValue=""} }; window.addEventListener("beforeunload", handler);return () => window.removeEventListener("beforeunload", handler) }, [])

  const edit = useCallback((change: (flow: SalesGraphFlow) => SalesGraphFlow) => {
    setUndo(h => [...h.slice(-49), graphRef.current]); setRedo([]); setSaved(false); setSaveError(null)
    setGraph(change(graphRef.current))
  }, [])
  function changeNode(id: string, change: Partial<SalesGraphNode>) { edit(g => ({...g,nodes:g.nodes.map(n=>n.id===id?{...n,...change}:n)})) }
  function changeRoute(id: string, routeId: string, change: Partial<SalesGraphRoute>) { edit(g=>({...g,nodes:g.nodes.map(n=>n.id===id?{...n,routes:n.routes.map(r=>r.id===routeId?{...r,...change}:r)}:n)})) }
  function addQuestion(source?: string, routeId?: string) {
    const parent = graph.nodes.find(n=>n.id===source)
    const child = newQuestion(graph, parent ? {x:parent.position.x + (parent.routes.length > 1 ? 360 : 0),y:parent.position.y+390} : {x:0,y:0})
    if (parent && routeId) child.routes[0].target = parent.routes.find(r=>r.id===routeId)?.target ?? null
    edit(g=>({...g,entry_id:g.entry_id??child.id,nodes:[...g.nodes.map(n=>n.id===source?{...n,routes:n.routes.map(r=>r.id===routeId?{...r,target:child.id}:r)}:n),child]}))
    setSelected(child.id)
    requestAnimationFrame(() => canvas.current?.setCenter(child.position.x + 145, child.position.y + 120, { zoom: 0.85, duration: 250 }))
  }
  function removeNode(node: SalesGraphNode) {
    if (!window.confirm("Remove this question? Incoming paths will finish here until you reconnect them. You can undo this change.")) return
    edit(g=>({...g,entry_id:g.entry_id===node.id?null:g.entry_id,nodes:g.nodes.filter(n=>n.id!==node.id).map(n=>({...n,routes:n.routes.map(r=>r.target===node.id?{...r,target:null}:r)}))}))
    setSelected(null)
  }
  function replaceFlow(next: SalesGraphFlow) {
    if (!window.confirm("Replace this draft? Your live script changes only when you save.")) return
    loadFlow(next)
  }
  // Undoable; the caller has already confirmed (replaceFlow above, or the Upload dialog).
  function loadFlow(next: SalesGraphFlow) {
    edit(()=>next);setSelected(next.entry_id)
    requestAnimationFrame(()=>canvas.current?.fitView({nodes:next.nodes.filter(n=>n.id===next.entry_id || next.nodes.find(entry=>entry.id===next.entry_id)?.routes.some(r=>r.target===n.id)),padding:0.2,minZoom:0.55,maxZoom:0.85,duration:250}))
  }
  useEffect(() => {
    setNodes(previous => reconcileSalesCanvasNodes(graph, selected, previous))
  }, [graph, selected])
  const edges = graph.nodes.flatMap(n=>n.routes.filter(r=>r.target).map(r=>({id:`${n.id}:${r.id}`,source:n.id,sourceHandle:r.id,target:r.target!,type:"default",label:r.condition===null?(n.routes.length===1?undefined:"Otherwise"):edgeLabel(r.condition),labelStyle:{fontSize:11},labelBgPadding:[6,3] as [number,number],labelBgBorderRadius:4,markerEnd:{type:MarkerType.ArrowClosed,color:r.condition===null?"#a4a09a":"#c34a1a"},style:{stroke:r.condition===null?"#a4a09a":"#c34a1a",strokeWidth:2}})))
  function connect(c: Connection) {
    if (!c.source || !c.sourceHandle || !c.target) return
    changeRoute(c.source,c.sourceHandle,{target:c.target})
  }
  const nodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    // Dimensions, selection and dragging are part of controlled canvas state,
    // even though only positions belong in the persisted conversation graph.
    setNodes(current => applyNodeChanges(changes, current))
    const selection = changes.find(c => c.type === "select" && c.selected)
    if (selection?.type === "select") setSelected(selection.id)
    const positions = changes.filter(c => c.type === "position" && c.position)
    if (!positions.length) return
    setSaved(false)
    setGraph(g => {
      let moved = false
      const next = g.nodes.map(n => {
        const change = positions.find(c => c.type === "position" && c.id === n.id)
        if (change?.type !== "position" || !change.position ||
            (change.position.x === n.position.x && change.position.y === n.position.y)) return n
        moved = true
        return { ...n, position: { ...change.position } }
      })
      return moved ? { ...g, nodes: next } : g
    })
  }, [])
  async function save() {
    if (errors.length || !dirty || saving) return
    const submitted = graphRef.current, submittedJson = JSON.stringify(submitted)
    setSaving(true);setSaveError(null)
    try {
      const hotel = await api<HotelScript>(`/api/v1/admin/hotels/${encodeURIComponent(hotelId)}`,{method:"PUT",body:{sales_intake_flow:submitted}})
      const result = hotel.sales_intake_graph
      setBaseline(JSON.stringify(result));setGraph(current=>JSON.stringify(current)===submittedJson?result:current);setSaved(true)
    } catch(e) {setSaveError(e instanceof Error?e.message:"Could not save. Your draft is still here.")} finally {setSaving(false)}
  }

  return <div className="flex h-dvh min-h-[600px] flex-col bg-background">
    <header className="z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card px-5 py-4">
      <div className="flex items-center gap-4"><Link href="/agent-config" aria-label="Back to agent configuration" className="rounded-lg border p-2 hover:bg-muted" onClick={e=>{if(!confirmDiscardUnsaved())e.preventDefault()}}><ArrowLeft className="size-4" /></Link><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Sales agent · {hotelName}</p><h1 className="mt-1 text-lg font-semibold">Conversation builder</h1></div></div>
      <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{saving?"Saving…":dirty?"Unsaved changes":saved?"Saved":"All changes saved"}</span>{isPlatformAdmin&&baseline!==null&&<SalesFlowTransferButtons hotelId={hotelId} hotelName={hotelName} flow={graph} hasUnsavedChanges={dirty} disabled={saving} onLoad={loadFlow}/>}<Button variant="outline" disabled={baseline===null||errors.length>0} onClick={()=>setPreview(structuredClone(graph))}><Play className="mr-2 size-4" /> Preview path</Button><Button disabled={!dirty||saving||errors.length>0} onClick={save}><Save className="mr-2 size-4" /> Save script</Button></div>
    </header>
    {saveError && <div role="alert" className="border-b bg-destructive/10 px-5 py-3 text-sm text-destructive">{saveError}</div>}
    {loadError ? <div className="m-auto max-w-md space-y-4 text-center"><p role="alert">{loadError}</p><Button variant="outline" onClick={()=>setRetry(r=>r+1)}>Retry loading script</Button></div> : baseline===null ? <div className="m-auto text-sm text-muted-foreground">Loading your conversation…</div> : <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card/70 px-5 py-2.5">
        <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={graph.nodes.length>=60} onClick={()=>addQuestion(active?.id,active?.routes.at(-1)?.id)}><Plus className="mr-1.5 size-4" /> Question</Button><Button size="icon" variant="ghost" aria-label="Undo" disabled={!undo.length} onClick={()=>{const prev=undo.at(-1)!;setRedo(h=>[...h,graph]);setUndo(undo.slice(0,-1));setGraph(prev)}}><Undo2 className="size-4" /></Button><Button size="icon" variant="ghost" aria-label="Redo" disabled={!redo.length} onClick={()=>{const next=redo.at(-1)!;setUndo(h=>[...h,graph]);setRedo(redo.slice(0,-1));setGraph(next)}}><Redo2 className="size-4" /><span className="sr-only">Redo</span></Button><Button size="sm" variant="ghost" onClick={()=>{const sizes=new Map(nodes.flatMap(n=>n.measured?.width&&n.measured?.height?[[n.id,{width:n.measured.width,height:n.measured.height}] as const]:[]));edit(g=>arrangeGraph(g,sizes));requestAnimationFrame(()=>canvas.current?.fitView({padding:0.2,duration:250}))}}><LayoutGrid className="mr-1.5 size-4" /> Arrange</Button></div>
        <details className="relative"><summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground">Start from a template <ChevronDown className="size-3" /></summary><div className="absolute right-0 top-7 z-50 w-64 space-y-1 rounded-xl border bg-card p-2 shadow-lg"><Button className="w-full justify-start" variant="ghost" size="sm" onClick={()=>replaceFlow(recommended)}>Recommended intake</Button><Button className="w-full justify-start" variant="ghost" size="sm" onClick={()=>replaceFlow(exampleGraph())}>Existing vs. new inquiry</Button><Button className="w-full justify-start" variant="ghost" size="sm" onClick={()=>replaceFlow(emptyFlow)}>Empty script</Button></div></details>
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[350px] flex-1 bg-[#f7f6f2]">
          <ReactFlow<FlowNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={nodesChange} onConnect={connect} onNodeClick={(_,n)=>setSelected(n.id)} onPaneClick={()=>setSelected(null)} onInit={instance=>{canvas.current=instance}} onNodeDragStart={()=>{setUndo(h=>[...h.slice(-49),graphRef.current]);setRedo([])}} fitView fitViewOptions={{nodes:nodes.filter(n=>n.data.start || edges.some(e=>e.source===graph.entry_id && e.target===n.id)),padding:0.2,minZoom:0.55,maxZoom:0.85}} minZoom={0.15} maxZoom={1.5} deleteKeyCode={null} nodesConnectable elementsSelectable>
            <Background color="#d6d3cb" gap={22} size={1} /><Controls showInteractive={false} /><MiniMap nodeColor={n=>n.id===graph.entry_id?"#c34a1a":"#d9c9bf"} maskColor="rgba(247,246,242,0.7)" pannable zoomable className="!overflow-hidden !rounded-xl !border !shadow-sm" />
          </ReactFlow>
          {!graph.nodes.length && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="max-w-sm rounded-2xl border border-dashed bg-card/90 p-8 text-center"><GitBranch className="mx-auto mb-4 size-8 text-primary" /><h2 className="font-semibold">Every conversation starts somewhere</h2><p className="mt-2 text-sm text-muted-foreground">Add your first question or choose a template. An empty saved script records only what callers volunteer.</p></div></div>}
          <div className="pointer-events-none absolute left-4 top-4 rounded-lg border bg-card/90 px-3 py-2 text-[11px] text-muted-foreground">Drag questions to arrange · Connect the dots to route answers</div>
        </div>
        <aside className="max-h-[50vh] w-full shrink-0 overflow-y-auto border-t bg-card lg:max-h-none lg:w-[360px] lg:border-l lg:border-t-0">
          {active ? <div className="space-y-5 p-5" key={active.id}>
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Question details</h2><Button variant="ghost" size="icon" aria-label="Remove selected question" onClick={()=>removeNode(active)}><Trash2 className="size-4" /></Button></div>
            <label className="block space-y-2 text-xs font-medium">What should the agent ask?<textarea className={inputClass} rows={4} maxLength={300} value={active.text} onChange={e=>changeNode(active.id,{text:e.target.value})} placeholder="Write the question exactly as callers should hear it…" /></label>
            <label className="block space-y-2 text-xs font-medium">Save the answer as<input className={`${inputClass} font-mono`} value={active.variable} maxLength={64} onChange={e=>changeNode(active.id,{variable:e.target.value})} placeholder="e.g. preferred_venue" /><span className="block font-normal leading-relaxed text-muted-foreground">Choose your own variable name. Every answer is stored with its question in the inquiry.</span></label>
            <details className="rounded-lg border p-3"><summary className="cursor-pointer text-xs text-muted-foreground">Also use in a standard inquiry field</summary><select aria-label="Standard inquiry field" className={`${inputClass} mt-3`} value={active.field} onChange={e=>changeNode(active.id,{field:e.target.value as SalesGraphNode["field"]})}>{Object.entries(answerFields).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select><p className="mt-2 text-xs text-muted-foreground">Optional. Your custom variable is always kept.</p></details>
            <Button variant="outline" size="sm" className="w-full" disabled={graph.entry_id===active.id} onClick={()=>edit(g=>({...g,entry_id:active.id}))}><Flag className="mr-2 size-3.5" />{graph.entry_id===active.id?"Starting question":"Make this the starting question"}</Button>
            <div className="border-t pt-5"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Where does the answer lead?</h3><span className="text-xs text-muted-foreground">{active.routes.length} paths</span></div><p className="mb-4 text-xs leading-relaxed text-muted-foreground">The first matching meaning wins. Otherwise follows the fallback. Ending a path finishes the intake.</p>
              <div className="space-y-3">{active.routes.map((route,index)=><div key={route.id} className={`space-y-3 rounded-xl border p-3 ${route.condition===null?"bg-muted/40":"border-primary/20 bg-primary/[0.025]"}`}>
                <div className="flex items-center justify-between text-xs font-semibold"><span>{route.condition===null?(active.routes.length===1?"Continue to":"Otherwise / unclear"): `Path ${index+1} · When the answer means`}</span>{route.condition!==null && <Button variant="ghost" size="icon" className="size-6" aria-label={`Remove path ${index+1}`} onClick={()=>changeNode(active.id,{routes:active.routes.filter(r=>r.id!==route.id)})}><Trash2 className="size-3" /></Button>}</div>
                {route.condition!==null && <>
                  <textarea aria-label={`Meaning for path ${index+1}`} className={inputClass} rows={3} maxLength={300} value={route.condition} onChange={e=>changeRoute(active.id,route.id,{condition:e.target.value})} placeholder="e.g. They are following up on an existing inquiry" />
                  <label className="block space-y-1 text-xs">Based on the answer to<select className={inputClass} value={route.answer_from??""} onChange={e=>changeRoute(active.id,route.id,{answer_from:e.target.value||null})}><option value="">This question</option>{graph.nodes.filter(n=>n.id!==active.id).map(n=><option key={n.id} value={n.id}>{n.variable} · {n.text.slice(0,45)}</option>)}</select></label>
                </>}
                <label className="block space-y-1 text-xs text-muted-foreground">Then go to<select className={inputClass} value={route.target??""} onChange={e=>changeRoute(active.id,route.id,{target:e.target.value||null})}><option value="">Finish intake</option>{graph.nodes.filter(n=>n.id!==active.id).map(n=><option key={n.id} value={n.id}>{n.variable} · {n.text.slice(0,42)||"Untitled question"}</option>)}</select></label>
                <div className="flex items-center justify-between"><Button variant="ghost" size="sm" className="h-7 px-1 text-xs" disabled={graph.nodes.length>=60} onClick={()=>addQuestion(active.id,route.id)}><Plus className="mr-1 size-3" /> New question on this path</Button>{route.condition!==null&&index>0&&<Button variant="ghost" size="sm" className="h-7 px-1 text-xs" onClick={()=>{const routes=[...active.routes];[routes[index-1],routes[index]]=[routes[index],routes[index-1]];changeNode(active.id,{routes})}}>Move up</Button>}</div>
              </div>)}</div>
              <Button className="mt-3 w-full" size="sm" variant="outline" disabled={active.routes.length>=6} onClick={()=>changeNode(active.id,{routes:[...active.routes.slice(0,-1),{id:`r_${crypto.randomUUID()}`,condition:"",target:null,answer_from:null},active.routes.at(-1)!]})}><GitBranch className="mr-2 size-3.5" /> Add conditional path</Button>
            </div>
          </div> : <div className="space-y-4 p-6"><GitBranch className="size-7 text-primary" /><h2 className="font-semibold">A conversation, shaped by the caller</h2><p className="text-sm leading-relaxed text-muted-foreground">Select a question to edit its wording, answer variable, and paths. Each path can lead to a completely different set of questions.</p><p className="text-xs leading-relaxed text-muted-foreground">Questions are read as written, with small contextual adjustments. Conditions describe meaning rather than exact words.</p></div>}
          {errors.length>0 && <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950" role="status"><p className="mb-2 font-semibold">Before saving</p><ul className="list-disc space-y-2 pl-4">{errors.map(e=><li key={e}>{e}</li>)}</ul></div>}
        </aside>
      </div>
      <footer className="flex shrink-0 justify-between border-t bg-card px-5 py-2 text-[11px] text-muted-foreground"><span>{graph.nodes.length} questions · {graph.nodes.reduce((s,n)=>s+n.routes.filter(r=>r.condition!==null).length,0)} conditions</span><span>Changes go live for new calls after saving</span></footer>
    </>}
    {preview && <PathPreview key={JSON.stringify(preview)} flow={preview} open onOpenChange={open=>{if(!open)setPreview(null)}} />}
  </div>
}
