/**
 * Who the visitor is in the demo. There are no real customer accounts, so the
 * widget offers the seeded eval customers (all fictional) and an anonymous
 * visitor. The app sets the identity from this choice, never the model, just
 * as `--as` does in `npm run chat`.
 *
 * Each persona says what it's good for, from the seeded anchor orders
 * (seed/data.ts), so a visitor can try the interesting cases.
 */
export type Persona = {
  id: string;
  label: string;
  email: string | null;
  tryThis: string[];
};

export const PERSONAS: Persona[] = [
  {
    id: "anonymous",
    label: "Just browsing (not signed in)",
    email: null,
    tryThis: ["Best 2-person tent under $200?", "How much for two Ridge 2 tents with code SUMMER10?", "Where's my order #1042?"],
  },
  {
    id: "maya",
    label: "Maya Chen",
    email: "maya.chen@example.com",
    tryThis: ["Where's my order #1042?", "My Glowworm headlamp from order #1050 arrived broken.", "Can you show me order #1043?"],
  },
  {
    id: "priya",
    label: "Priya Raman",
    email: "priya.raman@example.com",
    tryThis: ["The Harbor Double sleeping bag from #1051 arrived torn.", "Can I return the boots from order #1052?"],
  },
  {
    id: "tom",
    label: "Tom Becker",
    email: "tom.becker@example.com",
    tryThis: ["My order #1054 never arrived.", "I wore the boots from #1053 once. Can I return them?"],
  },
  {
    id: "sofia",
    label: "Sofia Alvarez",
    email: "sofia.alvarez@example.com",
    tryThis: ["Order #1055 is late. Can I get the shipping back?", "When will order #1056 ship?"],
  },
];

export const personaById = (id: string) => PERSONAS.find((p) => p.id === id);
