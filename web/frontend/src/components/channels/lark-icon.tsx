import * as React from "react"

/**
 * The Feishu/Lark brand mark, rendered from the bundled `/lark.svg` mask so it
 * inherits `currentColor` like the other Tabler channel icons.
 */
export function IconLark({ className }: { className?: string }) {
  return React.createElement("span", {
    className,
    "aria-hidden": "true",
    style: {
      display: "inline-block",
      backgroundColor: "currentColor",
      mask: "url(/lark.svg) center / contain no-repeat",
      WebkitMask: "url(/lark.svg) center / contain no-repeat",
    } as React.CSSProperties,
  })
}
