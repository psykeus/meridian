import { create } from "zustand";

export interface PlanRoom {
  id: number;
  owner_id: number;
  name: string;
  description?: string;
  aoi_bbox?: number[];
  aoi_countries?: string[];
  is_archived: boolean;
  created_at: string;
}

export interface Annotation {
  id: number;
  plan_room_id: number;
  created_by?: number;
  annotation_type: string;
  label?: string;
  notes?: string;
  color: string;
  geom_json?: Record<string, unknown>;
  is_locked: boolean;
  created_at: string;
}

export interface TimelineEntry {
  id: number;
  plan_room_id: number;
  created_by?: number;
  is_auto: boolean;
  title: string;
  body?: string;
  source_label?: string;
  entry_time: string;
  created_at: string;
}

export interface Task {
  id: number;
  plan_room_id: number;
  created_by?: number;
  assigned_to?: number;
  title: string;
  notes?: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

export interface DrawingMode {
  type: string;
  color: string;
  label?: string;
  notes?: string;
  roomId: number;
}

interface PlanStore {
  rooms: PlanRoom[];
  activeRoomId: number | null;
  annotations: Annotation[];
  timeline: TimelineEntry[];
  tasks: Task[];
  drawingMode: DrawingMode | null;
  spotlightAnnotationId: number | null;

  setRooms: (rooms: PlanRoom[]) => void;
  setActiveRoom: (id: number | null) => void;
  setAnnotations: (a: Annotation[]) => void;
  setTimeline: (t: TimelineEntry[]) => void;
  setTasks: (t: Task[]) => void;
  setDrawingMode: (mode: DrawingMode | null) => void;
  setSpotlightAnnotation: (id: number | null) => void;
  addAnnotation: (a: Annotation) => void;
  addTimelineEntry: (e: TimelineEntry) => void;
  addTask: (t: Task) => void;
  updateTask: (id: number, patch: Partial<Task>) => void;
  removeTask: (id: number) => void;

  fetchRooms: () => Promise<void>;
  fetchRoomData: (roomId: number) => Promise<void>;
}

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}`,
});

export const usePlanStore = create<PlanStore>((set, get) => ({
  rooms: [],
  activeRoomId: null,
  annotations: [],
  timeline: [],
  tasks: [],
  drawingMode: null,
  spotlightAnnotationId: null,

  setRooms: (rooms) => set({ rooms }),
  setActiveRoom: (id) => set({ activeRoomId: id }),
  setAnnotations: (annotations) => set({ annotations }),
  setTimeline: (timeline) => set({ timeline }),
  setTasks: (tasks) => set({ tasks }),
  setDrawingMode: (drawingMode) => set({ drawingMode }),
  setSpotlightAnnotation: (id) => set({ spotlightAnnotationId: id }),

  addAnnotation: (a) => set((s) => ({ annotations: [...s.annotations, a] })),
  addTimelineEntry: (e) => set((s) => ({ timeline: [e, ...s.timeline] })),
  addTask: (t) => set((s) => ({ tasks: [t, ...s.tasks] })),

  updateTask: (id, patch) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),

  removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

  fetchRooms: async () => {
    try {
      const r = await fetch("/api/v1/plan-rooms", { headers: authHeaders() });
      if (r.ok) get().setRooms(await r.json());
    } catch {}
  },

  fetchRoomData: async (roomId) => {
    try {
      const [annR, tlR, taskR] = await Promise.all([
        fetch(`/api/v1/plan-rooms/${roomId}/annotations`, { headers: authHeaders() }),
        fetch(`/api/v1/plan-rooms/${roomId}/timeline`, { headers: authHeaders() }),
        fetch(`/api/v1/plan-rooms/${roomId}/tasks`, { headers: authHeaders() }),
      ]);
      if (annR.ok) get().setAnnotations(await annR.json());
      if (tlR.ok) get().setTimeline(await tlR.json());
      if (taskR.ok) get().setTasks(await taskR.json());
    } catch {}
  },
}));
