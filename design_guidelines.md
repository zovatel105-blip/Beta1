{
  "target": {
    "file": "/app/components/UniversalChallengeAdvancedWizard.jsx",
    "scope": "Targeted improvement of existing Challenge editor tool modals (bottom sheets). Preserve current dark/monochrome look, keep video + timeline mounted. No new routes, no backend/API changes, no redesign of the overall editor shell. Improve modal content structure + readability + semantic icons."
  },
  "brand_attributes": [
    "Monochrome creator tooling (black canvas, white ink)",
    "Mobile-first, thumb-friendly, bottom-sheet driven",
    "Dense information made readable via hierarchy + progressive disclosure",
    "Utility-premium: crisp borders, soft blur, no flashy gradients"
  ],
  "design_tokens": {
    "font": {
      "family": {
        "ui": "Figtree, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial",
        "mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace"
      },
      "sizes": {
        "h1": "text-4xl sm:text-5xl lg:text-6xl",
        "h2": "text-base md:text-lg",
        "body": "text-sm md:text-base",
        "small": "text-xs"
      },
      "weights": {
        "regular": 400,
        "semibold": 600,
        "bold": 700
      }
    },
    "color": {
      "note": "Monochrome reference is binding. Keep editor canvas dark regardless of system theme.",
      "canvas": {
        "bg": "#000000",
        "sheetBg": "rgba(20,20,20,0.97)",
        "surface": "rgba(255,255,255,0.06)",
        "surface2": "rgba(255,255,255,0.04)",
        "stroke": "rgba(255,255,255,0.10)",
        "strokeStrong": "rgba(255,255,255,0.18)",
        "text": "#FFFFFF",
        "text2": "rgba(255,255,255,0.72)",
        "text3": "rgba(255,255,255,0.45)"
      },
      "state": {
        "focusRing": "rgba(255,255,255,0.35)",
        "dangerSurface": "rgba(255,255,255,0.06)",
        "dangerStroke": "rgba(255,255,255,0.18)"
      },
      "white_action_exception": {
        "allowed": true,
        "usage": "Primary action buttons may be solid white with black text."
      }
    },
    "radius": {
      "video": "30px",
      "pill": "9999px",
      "tile": "16px",
      "sheet": "24px",
      "field": "12px"
    },
    "shadow": {
      "sheet": "0 -12px 48px rgba(0,0,0,0.45)",
      "soft": "0 10px 30px rgba(0,0,0,0.55)"
    },
    "spacing": {
      "screenPaddingX": "16px",
      "sheetPadding": "20px",
      "sectionGap": "16px",
      "rowGap": "10px",
      "hitTarget": "44px"
    }
  },
  "layout": {
    "single_screen_rule": "All tools open as bottom sheets over the timeline area; video remains mounted and visible behind.",
    "sheet_geometry": {
      "height": "62–72dvh (default ~68dvh). Never full-screen by default.",
      "radius": "24px top corners",
      "backdrop": "rgba(0,0,0,0.55) + subtle blur (backdrop-blur-[2px])",
      "handle": "Top-center grab handle: w-10 h-1 rounded-full bg-white/20"
    },
    "pinned_regions": {
      "rule": "Sheet must have pinned header + pinned footer; only the middle content scrolls.",
      "implementation": "DrawerContent: flex flex-col; header/footer flex-shrink-0; body: flex-1 overflow-y-auto overscroll-contain. Avoid overflow-y-auto on DrawerContent itself (can interfere with swipe-to-dismiss)."
    }
  },
  "components": {
    "tool_modals_addendum": {
      "goal": "Make each tool modal understandable at a glance: clear sections, readable labels, helper text, and progressive disclosure for advanced settings. Avoid dense horizontal strips.",
      "use_shadcn": {
        "preferred": "Drawer (mobile-first)",
        "fallback": "Dialog (desktop or if Drawer unavailable)",
        "requirements": [
          "Backdrop dim over editor (video remains visible behind)",
          "Focus trap + ESC to close",
          "Swipe down / tap outside to dismiss",
          "Safe-area padding at bottom",
          "Pinned header/footer + internal scroll",
          "z-index above editor shell"
        ]
      },
      "icon_mapping_lucide": {
        "Moments": { "icon": "Scissors", "reason": "segments/cuts" },
        "Prediction": { "icon": "Hash", "reason": "numeric prediction" },
        "Participants": { "icon": "Users", "reason": "people list" },
        "Rules": { "icon": "ListChecks", "reason": "checklist" },
        "Result": { "icon": "Trophy", "reason": "outcome" },
        "Close": { "icon": "X", "reason": "dismiss" }
      },
      "header_hierarchy": {
        "row": "[icon tile] [title + subtitle] (left) + close button (right)",
        "title": "text-[18px] font-semibold tracking-tight text-white",
        "subtitle": "text-[12px] leading-snug text-white/70 (1 line max; truncate if needed)"
      },
      "section_patterns": {
        "section_title": "Use small uppercase label: text-[11px] font-bold uppercase tracking-wide text-white/60",
        "card": "bg-white/[0.04] border border-white/10 rounded-xl p-3.5",
        "row": "flex items-start justify-between gap-3 py-2.5",
        "row_label": "text-[13.5px] font-semibold text-white",
        "row_help": "text-[11.5px] text-white/65 leading-snug",
        "divider": "Separator border-white/10 with my-3"
      },
      "field_styles": {
        "inputs": "bg-white/[0.04] border-white/10 text-white placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-white/30",
        "select_menus": "SelectContent: bg-neutral-900 text-white border-white/20 z-[120]",
        "switch": "Use shadcn Switch; ensure 44px hit target wrapper"
      },
      "data_testids_modal": {
        "rule": "All modal triggers + modal root + close + primary inputs must have data-testid (kebab-case).",
        "must_add": [
          "tool-modal-root",
          "tool-modal-title",
          "tool-modal-description",
          "tool-modal-close-button",
          "tool-modal-done",
          "tool-modal-moments",
          "tool-modal-prediction",
          "tool-modal-participants",
          "tool-modal-rules",
          "tool-modal-result"
        ]
      }
    },
    "modal_content_structure": {
      "moments_modal": {
        "primary_goal": "Fast scan + add/edit moments without cognitive load.",
        "structure": [
          "Section: Overview (small helper line: how Moments work)",
          "Section: Moments list (each row: icon + rule label + question + start time; show 'scores' badge only when scoring enabled)",
          "Primary CTA: Add moment (full-width dashed button)",
          "Progressive disclosure: optional filter/sort (only if already present; otherwise omit)"
        ],
        "row_rules": [
          "Row height >= 76px; left icon 36–40px; right chevron",
          "Question line truncates to 1 line; never shrink font below 12px",
          "Time uses mono font and muted color"
        ],
        "empty_state": {
          "copy": "No Moments yet — add the first one below.",
          "layout": "Centered text, 24px vertical padding"
        }
      },
      "prediction_modal": {
        "primary_goal": "Make numeric prediction setup obvious and safe.",
        "structure": [
          "Section: Prediction type (segmented control: Option vs Number)",
          "If Number: Field group 'Actual number' + helper text 'Hidden until moment ends'",
          "If Option: Options list + helper text explaining when to use options vs participants",
          "Advanced (Accordion): Team vs Team (only when exactly 2 groups exist)"
        ],
        "progressive_disclosure": {
          "rule": "Hide Team vs Team and other advanced toggles behind Accordion to avoid dense UI.",
          "accordion_trigger": "Use shadcn AccordionTrigger with clear label 'Advanced'"
        },
        "validation_messaging": {
          "rule": "If numeric value blank, show neutral helper (not error). Only show error when finishing if required by existing logic.",
          "placement": "Inline under field; keep error banner at top for finish-level errors"
        }
      },
      "participants_modal": {
        "primary_goal": "Add people quickly; assign to teams/groups without clutter.",
        "structure": [
          "Section: Type (Individual / Team / Group) as chips",
          "Section: Count stepper (minus/count/plus) with 44px buttons",
          "Section: Participant list (avatar + name input + remove)",
          "If Team/Group: Section: Teams/Groups cards with (label input + member chips)"
        ],
        "readability_rules": [
          "Participant rows: keep name input font >= 13px; avoid ultra-small text",
          "Remove button must remain visible but subdued (text-white/50; hover to stronger)"
        ],
        "empty_state": {
          "teams_groups": "If no participants yet, show helper: 'Add participants above first.'"
        }
      },
      "rules_modal": {
        "primary_goal": "Explain global scoring clearly; avoid mixing Rules and Result content in one dense block.",
        "structure": [
          "Top badge: 'Applies to the whole challenge' (global indicator)",
          "Section: Scoring rule (card) with title + 1–2 line explanation + Switch",
          "If scoring ON: show 'What counts toward score' helper + Result type + Tie-breaker fields",
          "Advanced (Accordion): Tie-break winner picker (only when creator_defined)"
        ],
        "progressive_disclosure": {
          "rule": "Only reveal dependent fields when scoring is enabled; only reveal winner picker when tie-breaker requires it.",
          "avoid": "Do not render Result preview list inside Rules view. Keep Rules focused."
        }
      },
      "result_modal": {
        "primary_goal": "Show what viewers will see; keep it informational (no fake scores).",
        "structure": [
          "Top badge: 'Applies to the whole challenge'",
          "Section: Summary sentence (based on resultType + tieBreak) in readable paragraph",
          "Section: Participants preview list (avatar + name + muted note 'Score appears once viewers watch')",
          "If scoring OFF: show guidance to enable scoring in Rules (link/button that navigates to Rules sheet view)"
        ],
        "no_fake_data_rule": "Never show computed scores or rankings in editor; only explanatory placeholders."
      }
    },
    "shadcn_components_to_use": {
      "paths": [
        "/app/components/ui/drawer",
        "/app/components/ui/button",
        "/app/components/ui/input",
        "/app/components/ui/switch",
        "/app/components/ui/select",
        "/app/components/ui/accordion",
        "/app/components/ui/separator"
      ],
      "notes": [
        "Project uses .jsx/.js; keep examples in JSX (not TSX).",
        "Prefer shadcn components over raw HTML for select/switch/accordion."
      ]
    }
  },
  "interaction_motion": {
    "principles": [
      "No universal transition: never transition: all",
      "Tactile press feedback: active:scale-[0.98] on tiles/rows; active:scale-90 on icon buttons",
      "Sheet open/close should feel snappy (180–220ms)"
    ],
    "micro_interactions": {
      "tool_tiles": "Active tile: border-white/25 bg-white/[0.08]; press: active:scale-[0.98] transition-[background-color,border-color] duration-150",
      "rows": "hover:bg-white/[0.08] (desktop), active:scale-[0.98]",
      "focus": "focus-visible:ring-2 ring-white/30 ring-offset-0"
    },
    "reduced_motion": "Respect prefers-reduced-motion: reduce by disabling sheet animation and scale effects."
  },
  "accessibility": {
    "hit_targets": "Minimum 44x44px for tappable controls (close, chips, +/- stepper, list rows).",
    "focus": "Visible focus ring on keyboard navigation (ring-white/30).",
    "contrast": "Secondary text uses white/65–72; avoid white/40 for anything essential.",
    "scroll": "Ensure internal scroll region is reachable and does not trap focus; keep header title focusable for screen readers."
  },
  "image_urls": {
    "note": "No external images required. Use local video thumbnails for timeline filmstrip."
  },
  "component_path": {
    "primary": [
      "/app/components/UniversalChallengeAdvancedWizard.jsx",
      "/app/components/ChallengeEditor.module.css"
    ],
    "shadcn_ui_expected": [
      "/app/components/ui/drawer.jsx",
      "/app/components/ui/dialog.jsx (fallback)",
      "/app/components/ui/button.jsx",
      "/app/components/ui/input.jsx",
      "/app/components/ui/switch.jsx",
      "/app/components/ui/select.jsx",
      "/app/components/ui/accordion.jsx",
      "/app/components/ui/separator.jsx"
    ]
  },
  "instructions_to_main_agent": [
    "Do NOT redesign the overall editor shell; only improve the five tool modals (Moments/Prediction/Participants/Rules/Result) content structure and readability.",
    "Keep the current monochrome/dark look; avoid gradients except the existing allowed white primary actions. Remove any rose/pink gradient usage inside modals.",
    "Ensure each modal has: pinned header, pinned footer, and a single internal scroll region for content.",
    "Apply progressive disclosure: dependent settings appear only when relevant (e.g., scoring ON, tie-breaker creator_defined).",
    "Rules and Result must be separate views: Rules view should not render Result preview list; Result view should not duplicate Rules controls.",
    "All interactive and key informational elements MUST include data-testid (kebab-case).",
    "Keep UI text in English as-is; only add short helper text where it improves comprehension.",
    "No new routes, no backend changes, no fake scores/rankings."
  ],
  "general_ui_ux_design_guidelines_appendix": "<General UI UX Design Guidelines>\n    - You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms\n    - You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text\n   - NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json\n\n **GRADIENT RESTRICTION RULE**\nNEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc\nNEVER use dark gradients for logo, testimonial, footer etc\nNEVER let gradients cover more than 20% of the viewport.\nNEVER apply gradients to text-heavy content or reading areas.\nNEVER use gradients on small UI elements (<100px width).\nNEVER stack multiple gradient layers in the same viewport.\n\n**ENFORCEMENT RULE:**\n    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors\n\n**How and where to use:**\n   • Section backgrounds (not content backgrounds)\n   • Hero section header content. Eg: dark to light to dark color\n   • Decorative overlays and accent elements only\n   • Hero section with 2-3 mild color\n   • Gradients creation can be done for any angle say horizontal, vertical or diagonal\n\n- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**\n\n</Font Guidelines>\n\n- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead. \n   \n- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.\n\n- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.\n   \n- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly\n    Eg: - if it implies playful/energetic, choose a colorful scheme\n           - if it implies monochrome/minimal, choose a black–white/neutral scheme\n\n**Component Reuse:**\n\t- Prioritize using pre-existing components from src/components/ui when applicable\n\t- Create new components that match the style and conventions of existing components when needed\n\t- Examine existing components to understand the project's component patterns before creating new ones\n\n**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component\n\n**Best Practices:**\n\t- Use Shadcn/UI as the primary component library for consistency and accessibility\n\t- Import path: ./components/[component-name]\n\n**Export Conventions:**\n\t- Components MUST use named exports (export const ComponentName = ...)\n\t- Pages MUST use default exports (export default function PageName() {...})\n\n**Toasts:**\n  - Use `sonner` for toasts\"\n  - Sonner component are located in `/app/src/components/ui/sonner.tsx`\n\nUse 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals.\n</General UI UX Design Guidelines>"
}
