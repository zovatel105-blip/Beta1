{
  "target": {
    "file": "/app/components/UniversalChallengeAdvancedWizard.jsx",
    "scope": "Pixel-accurate monochrome editor restyle for Challenges only (single persistent screen). No new flows/screens/engines; keep existing English copy; keep video mounted; panels open over lower timeline."
  },
  "brand_attributes": [
    "Monochrome, creator-tooling, high-contrast",
    "TikTok-like editing canvas (dark, immersive)",
    "Precise, utilitarian controls with premium spacing"
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
      "note": "Monochrome reference is binding. Preserve dark editing canvas regardless of system theme.",
      "canvas": {
        "bg": "#000000",
        "surface": "rgba(255,255,255,0.06)",
        "surface2": "rgba(255,255,255,0.04)",
        "stroke": "rgba(255,255,255,0.10)",
        "strokeStrong": "rgba(255,255,255,0.18)",
        "text": "#FFFFFF",
        "text2": "rgba(255,255,255,0.72)",
        "text3": "rgba(255,255,255,0.45)"
      },
      "controls": {
        "iconButtonBg": "rgba(20,20,20,0.85)",
        "iconButtonStroke": "rgba(255,255,255,0.10)",
        "icon": "#FFFFFF",
        "disabled": "rgba(255,255,255,0.28)"
      },
      "timeline": {
        "divider": "rgba(255,255,255,0.10)",
        "rulerText": "rgba(255,255,255,0.55)",
        "trackThumbBg": "rgba(255,255,255,0.08)",
        "trackMomentBg": "rgba(255,255,255,0.10)",
        "trackRuleBg": "rgba(255,255,255,0.08)",
        "playhead": "#FFFFFF"
      },
      "state": {
        "dangerBg": "rgba(255,255,255,0.06)",
        "dangerText": "#FFFFFF",
        "focusRing": "rgba(255,255,255,0.35)"
      },
      "white_action_exception": {
        "allowed": true,
        "usage": "Primary action buttons may be solid white with black text (reference behavior)."
      }
    },
    "radius": {
      "video": "30px",
      "pill": "9999px",
      "tile": "16px",
      "sheet": "24px"
    },
    "shadow": {
      "soft": "0 10px 30px rgba(0,0,0,0.55)",
      "tile": "0 8px 22px rgba(0,0,0,0.45)"
    },
    "spacing": {
      "screenPaddingX": "16px",
      "gutter": "12px",
      "timelineBottomPadding": "18px"
    }
  },
  "layout": {
    "viewport": {
      "no_phone_bars": true,
      "background": "#000",
      "safe_area": "Use env(safe-area-inset-*) only for padding; do not render fake status/nav bars."
    },
    "reference_geometry_720x1650": {
      "video": {
        "x": 132,
        "y": 50,
        "w": 456,
        "h": 811,
        "radius": 30,
        "alignment": "Centered portrait"
      },
      "top_controls": {
        "left_chevron_circle": { "x": 32, "y": 66, "diameter": 88 },
        "right_next_circle": { "x": 600, "y": 66, "diameter": 88 }
      },
      "timeline": {
        "dividerY": 974,
        "playheadX": 360,
        "playheadY1": 975,
        "playheadY2": 1410,
        "ruler": "5s ticks",
        "thumbTrack": { "y": 1058, "h": 108 },
        "track1": { "y": 1174, "h": 72 },
        "track2": { "y": 1254, "h": 72 },
        "hintY": 1422,
        "bottomTiles": { "y": 1474, "tileW": 104, "tileH": 80 }
      }
    },
    "responsive_proportions": {
      "video_container": "Use fixed aspect portrait preview; on small heights clamp to keep timeline visible. Prefer CSS clamp(): height: clamp(360px, 49vh, 811px).",
      "timeline_height": "Reserve ~40–45% viewport for timeline + tools; timeline scrolls horizontally only.",
      "max_width": "Do not center the whole app; only center the video frame within the canvas."
    },
    "single_screen_rule": "All tool panels (Moments, Prediction, Participants, Rules, Result) open as bottom sheets over the timeline area; video remains mounted and visible. No route changes."
  },
  "components": {
    "existing_only": [
      "UniversalChallengeAdvancedWizard.jsx (primary)",
      "UploadDialog.jsx (entry point button already exists)"
    ],
    "editor_shell": {
      "structure": [
        "Top: black canvas with centered portrait video (rounded 30)",
        "Overlay: left/back circular button + right/next circular button (88px)",
        "Below video: transport row (play, timecode center, undo/redo right)",
        "Divider line",
        "Timeline: horizontal scroll with fixed center playhead",
        "Bottom: tool tiles row (Moments, Prediction, Participants, Rules, Result)"
      ],
      "tool_tiles": {
        "style": "Square tiles (104x80 @ 720w reference), rounded-2xl, subtle stroke, label below icon.",
        "labels": ["Moments", "Prediction", "Participants", "Rules", "Result"],
        "behavior": "Tap opens corresponding panel as sheet over timeline; active tile shows stronger stroke + slightly brighter surface."
      }
    },
    "timeline_tracks_mapping": {
      "thumb_track": "Video thumbnails (local generated).",
      "track_moments": "Moments (event ranges) blocks.",
      "track_rules_result": "Rules & Result global markers (e.g., scoring enabled indicator) + Prediction numeric-only indicator."
    },
    "tool_modals_addendum": {
      "goal": "Tools open as bottom modals (sheets) over the editor with video visible behind; icons represent each tool; modal content is better organized without changing flows or copy.",
      "use_shadcn": {
        "preferred": "Drawer (mobile-first)",
        "fallback": "Dialog (if Drawer not present)",
        "requirements": [
          "Backdrop dim over editor (video remains visible behind)",
          "Focus trap + ESC to close",
          "Swipe down / tap outside to dismiss",
          "Safe-area padding at bottom",
          "z-index above editor shell (must be > 71)"
        ]
      },
      "sheet_geometry": {
        "height": "Use 62–72dvh depending on content; never full-screen by default.",
        "radius": "24px top corners (match tokens.radius.sheet)",
        "backdrop": "rgba(0,0,0,0.55) with subtle blur: backdrop-blur-[2px]",
        "handle": "Top-center grab handle: w-10 h-1 rounded-full bg-white/20"
      },
      "header_hierarchy": {
        "row": "[icon] [title] (left) + close button (right)",
        "title": "text-sm font-semibold tracking-tight text-white",
        "subtitle_optional": "text-xs text-white/60 (only if needed; keep short)"
      },
      "content_layout": {
        "pattern": "Use 2 sections max per modal: (1) Primary controls (2) Advanced/secondary. Separate with a thin divider border-white/10 and spacing gap-3.",
        "control_rows": "Use list rows: flex items-center justify-between gap-3 py-2.5",
        "labels": "Left label text-xs text-white/70; right control aligned",
        "inputs": "Use shadcn Input/Slider/Switch; keep monochrome surfaces bg-white/5 border-white/10 focus:ring-white/30"
      },
      "icon_mapping_lucide": {
        "Moments": { "icon": "Scissors", "reason": "represents cutting/segments" },
        "Prediction": { "icon": "Hash", "reason": "numeric-only prediction" },
        "Participants": { "icon": "Users", "reason": "people list" },
        "Rules": { "icon": "ListChecks", "reason": "checklist of rules" },
        "Result": { "icon": "Trophy", "reason": "outcome/winner" },
        "Close": { "icon": "X", "reason": "clear dismissal" }
      },
      "tile_icon_rules": {
        "size": "Icon 22px; label text-[11px] leading-tight",
        "active_state": "Active tile: border-white/25 bg-white/[0.08]; inactive: border-white/10 bg-white/[0.04]",
        "press": "active:scale-[0.98] transition-[background-color,border-color] duration-150"
      },
      "close_affordance": {
        "button": "Top-right close icon button (44x44 hit target) always visible.",
        "data_testid": "sheet-close-button"
      },
      "data_testids_modal": {
        "rule": "All modal triggers + modal root + close + primary inputs must have data-testid.",
        "must_add": [
          "tool-modal-root",
          "tool-modal-title",
          "tool-modal-close-button",
          "tool-modal-moments",
          "tool-modal-prediction",
          "tool-modal-participants",
          "tool-modal-rules",
          "tool-modal-result"
        ]
      },
      "implementation_scaffold_jsx": {
        "note": "Pseudo-structure only; keep existing editor shell and state. Use Tailwind classes; no new screens.",
        "drawer_structure": [
          "<Drawer open={open} onOpenChange={setOpen}>",
          "  <DrawerContent className=\"z-[120] rounded-t-[24px] border-white/10 bg-black/92 backdrop-blur-[2px] shadow-[0_10px_30px_rgba(0,0,0,0.55)]\">",
          "    <div className=\"px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]\">",
          "      <div className=\"mx-auto mb-3 h-1 w-10 rounded-full bg-white/20\" data-testid=\"tool-modal-handle\" />",
          "      <header className=\"flex items-center justify-between gap-3\">",
          "        <div className=\"flex items-center gap-2\">{icon}<h3 className=\"text-sm font-semibold text-white\" data-testid=\"tool-modal-title\">{title}</h3></div>",
          "        <Button variant=\"ghost\" size=\"icon\" className=\"h-11 w-11 rounded-full hover:bg-white/10\" onClick={() => setOpen(false)} data-testid=\"tool-modal-close-button\">",
          "          <X className=\"h-5 w-5\" />",
          "        </Button>",
          "      </header>",
          "      <div className=\"mt-4 space-y-3\">{content}</div>",
          "    </div>",
          "  </DrawerContent>",
          "</Drawer>"
        ]
      }
    },
    "data_testid_requirements": {
      "rule": "Every interactive element and key info must have data-testid (kebab-case).",
      "must_cover": [
        "top-left-back-button",
        "top-right-next-button",
        "transport-play-button",
        "transport-undo-button",
        "transport-redo-button",
        "timeline-scroll-area",
        "timeline-playhead",
        "tool-tile-moments",
        "tool-tile-prediction",
        "tool-tile-participants",
        "tool-tile-rules",
        "tool-tile-result",
        "sheet-close-button",
        "numeric-prediction-input"
      ]
    }
  },
  "interaction_motion": {
    "principles": [
      "No universal transition: never transition: all",
      "Use short, tactile press feedback: active:scale-[0.98] on tiles; active:scale-90 on icon buttons",
      "Horizontal timeline scroll should feel inertial (native) with hidden scrollbar"
    ],
    "micro_interactions": {
      "icon_buttons": "hover:bg-white/10 (desktop), active:scale-90, focus-visible:ring-2 ring-white/30",
      "tiles": "hover:bg-white/[0.08], active:scale-[0.98]",
      "sheet": "slide-up animation (reuse existing .animate-sheet-up if present)"
    }
  },
  "accessibility": {
    "focus": "All controls must have visible focus ring on keyboard navigation (ring-white/30).",
    "hit_targets": "Minimum 44x44px for tappable controls; reference circles are 88px.",
    "contrast": "All text must remain readable on #000; use text2/text3 tokens for secondary labels.",
    "reduced_motion": "Respect prefers-reduced-motion: reduce by disabling sheet animation and scale effects."
  },
  "implementation_notes_for_main_agent": [
    "This guideline is for targeted editor change only: restyle UniversalChallengeAdvancedWizard.jsx to match the provided 720x1650 reference pixel-for-pixel, but focused on Challenges.",
    "Do NOT introduce new screens or routes. Panels must open over the lower timeline area; video stays mounted.",
    "Keep English UI copy as-is.",
    "Monochrome only. Remove any existing pink/rose gradients in the wizard UI; replace with solid monochrome surfaces and white primary actions (exception allowed).",
    "Implement tool panels as bottom modals (sheets) using shadcn Drawer/Dialog; backdrop dims editor but keeps video visible behind.",
    "Icons must represent the tool (see icon_mapping_lucide).",
    "Rules and Result remain global config; can be separate views of the same global object.",
    "No simulated phone status/navigation bars.",
    "Timeline must be horizontally scrollable with a fixed center playhead line (white) spanning ruler+tracks.",
    "Adapt existing concepts only: Moments, Prediction (numeric prediction only), Participants, Rules, Result. Rules & Result are global.",
    "Use Tailwind utility classes directly in .jsx (project already uses Tailwind).",
    "Ensure every interactive element has a stable data-testid in kebab-case."
  ],
  "component_path": {
    "primary": [
      "/app/components/UniversalChallengeAdvancedWizard.jsx",
      "/app/components/UploadDialog.jsx"
    ],
    "global_css": [
      "/app/app/globals.css"
    ],
    "shadcn_ui_expected": [
      "/app/components/ui/drawer.jsx (if present)",
      "/app/components/ui/dialog.jsx (fallback)",
      "/app/components/ui/button.jsx",
      "/app/components/ui/input.jsx",
      "/app/components/ui/switch.jsx",
      "/app/components/ui/slider.jsx",
      "/app/components/ui/separator.jsx"
    ]
  },
  "image_urls": {
    "note": "No external images. Use local uploaded video thumbnails for the thumbnail track."
  },
  "general_ui_ux_design_guidelines_appendix": "<General UI UX Design Guidelines>\n    - You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms\n    - You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text\n   - NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json\n\n **GRADIENT RESTRICTION RULE**\nNEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc\nNEVER use dark gradients for logo, testimonial, footer etc\nNEVER let gradients cover more than 20% of the viewport.\nNEVER apply gradients to text-heavy content or reading areas.\nNEVER use gradients on small UI elements (<100px width).\nNEVER stack multiple gradient layers in the same viewport.\n\n**ENFORCEMENT RULE:**\n    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors\n\n**How and where to use:**\n   • Section backgrounds (not content backgrounds)\n   • Hero section header content. Eg: dark to light to dark color\n   • Decorative overlays and accent elements only\n   • Hero section with 2-3 mild color\n   • Gradients creation can be done for any angle say horizontal, vertical or diagonal\n\n- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**\n\n</Font Guidelines>\n\n- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead. \n   \n- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.\n\n- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.\n   \n- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly\n    Eg: - if it implies playful/energetic, choose a colorful scheme\n           - if it implies monochrome/minimal, choose a black–white/neutral scheme\n\n**Component Reuse:**\n\t- Prioritize using pre-existing components from src/components/ui when applicable\n\t- Create new components that match the style and conventions of existing components when needed\n\t- Examine existing components to understand the project's component patterns before creating new ones\n\n**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component\n\n**Best Practices:**\n\t- Use Shadcn/UI as the primary component library for consistency and accessibility\n\t- Import path: ./components/[component-name]\n\n**Export Conventions:**\n\t- Components MUST use named exports (export const ComponentName = ...)\n\t- Pages MUST use default exports (export default function PageName() {...})\n\n**Toasts:**\n  - Use `sonner` for toasts\"\n  - Sonner component are located in `/app/src/components/ui/sonner.tsx`\n\nUse 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals.\n</General UI UX Design Guidelines>"
}
